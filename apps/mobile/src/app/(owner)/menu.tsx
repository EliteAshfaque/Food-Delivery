import { useState } from "react";
import { openSettings } from "expo-linking";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/axios";
import { RequestErrorState } from "@/components/request-error-state";
import { getApiErrorMessage } from "@/lib/api-error";
import { formatCurrency } from "@/lib/format";
import { validateCategoryName, validateMenuItem } from "@/lib/form-validation";
import { useImageUploader } from "../../lib/uploadthing";
import { BottomTabInset } from "@/constants/theme";
import type { MenuCategory, MenuItem, Restaurant } from "@food-delivery/types";

function MenuImagePicker({
  image,
  onChange,
  restaurantId,
}: {
  image: string | null;
  onChange: (url: string | null) => void;
  restaurantId: string;
}) {
  const { openImagePicker, isUploading } = useImageUploader("menuItemImage", {
    onClientUploadComplete: (result) => {
      const uploadedImage = result[0];
      if (!uploadedImage?.url) {
        Alert.alert("Image upload failed", "Please choose the image again.");
        return;
      }
      onChange(uploadedImage.url);
    },
    onUploadError: (error: Error) => {
      Alert.alert("Image upload failed", getApiErrorMessage(error));
    },
  });

  function pickImage() {
    void openImagePicker({
      source: "library",
      input: { restaurantId },
      onInsufficientPermissions: () => {
        Alert.alert(
          "No permissions",
          "You need to grant permission to your Photos",
          [
            { text: "Dismiss" },
            { text: "Open Settings", onPress: () => void openSettings() },
          ],
        );
      },
    });
  }

  return (
    <View>
      <Pressable
        style={[styles.imagePicker, image && styles.imagePickerWithImage]}
        onPress={pickImage}
        disabled={isUploading}
      >
        {image ? (
          <>
            <Image source={{ uri: image }} style={styles.itemImage} />
            <Pressable
              style={styles.removeImageButton}
              onPress={() => onChange(null)}
              disabled={isUploading}
            >
              <Text style={styles.removeImageText}>×</Text>
            </Pressable>
          </>
        ) : (
          <Text style={styles.imagePickerText}>Tap to upload image</Text>
        )}
      </Pressable>
      {isUploading && (
        <View style={styles.uploadProgress}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

export default function OwnerMenuScreen() {
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(
    null,
  );
  const [categoryName, setCategoryName] = useState("");
  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemImageUrl, setItemImageUrl] = useState<string | null>(null);
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemAvailable, setItemAvailable] = useState(true);

  const {
    data: restaurant,
    error: restaurantError,
    isError: restaurantIsError,
    isLoading: restaurantLoading,
    refetch: refetchRestaurant,
  } = useQuery<Restaurant | null>({
    queryKey: ["my-restaurants"],
    queryFn: () => api.get("/restaurants/mine").then((res) => res.data),
  });

  const restaurantId = restaurant?.id;

  const {
    data: categories = [],
    error: categoriesError,
    isError: categoriesIsError,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
  } = useQuery<MenuCategory[]>({
    queryKey: ["menu-categories", restaurantId],
    queryFn: () =>
      api.get(`/menu/categories/${restaurantId}`).then((res) => res.data),
    enabled: Boolean(restaurantId),
  });

  const {
    data: items = [],
    error: itemsError,
    isError: itemsIsError,
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useQuery<MenuItem[]>({
    queryKey: ["menu-items", restaurantId],
    queryFn: () =>
      api.get(`/menu/items/${restaurantId}`).then((res) => res.data),
    enabled: Boolean(restaurantId),
  });

  const { mutate: saveCategory, isPending: savingCategory } = useMutation({
    mutationFn: async () => {
      if (editingCategory) {
        const { data } = await api.patch(
          `/menu/categories/${editingCategory.id}`,
          {
            name: categoryName.trim(),
          },
        );
        return data as MenuCategory;
      }
      const { data } = await api.post("/menu/categories", {
        name: categoryName.trim(),
      });
      return data as MenuCategory;
    },
    onSuccess: (category) => {
      void queryClient.invalidateQueries({
        queryKey: ["menu-categories", restaurantId],
      });
      setSelectedCategoryId(category.id);
      closeCategoryModal();
    },
    onError: (error) => {
      Alert.alert("Could not save category", getApiErrorMessage(error));
    },
  });

  const {
    mutate: deleteCategory,
    isPending: deletingCategory,
    variables: deletingCategoryId,
  } = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/categories/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<MenuCategory[]>(
        ["menu-categories", restaurantId],
        (old) => old?.filter((category) => category.id !== id),
      );
      queryClient.setQueryData<MenuItem[]>(
        ["menu-items", restaurantId],
        (old) => old?.filter((item) => item.categoryId !== id),
      );
      if (selectedCategoryId === id) setSelectedCategoryId(null);
    },
    onError: (error) => {
      Alert.alert("Could not delete category", getApiErrorMessage(error));
    },
  });

  const { mutate: saveItem, isPending: savingItem } = useMutation({
    mutationFn: async () => {
      const payload = {
        categoryId: itemCategoryId,
        name: itemName.trim(),
        description: itemDescription.trim() || undefined,
        price: itemPrice.trim(),
        imageUrl: itemImageUrl ?? undefined,
      };
      if (editingItem) {
        const { data } = await api.patch(`/menu/items/${editingItem.id}`, {
          ...payload,
          isAvailable: itemAvailable,
        });
        return data;
      }
      const { data } = await api.post("/menu/items", payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["menu-items", restaurantId],
      });
      closeItemModal();
    },
    onError: (error) => {
      Alert.alert("Could not save item", getApiErrorMessage(error));
    },
  });

  const {
    mutate: deleteItem,
    isPending: deletingItem,
    variables: deletingItemId,
  } = useMutation({
    mutationFn: (id: string) => api.delete(`/menu/items/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<MenuItem[]>(
        ["menu-items", restaurantId],
        (old) => old?.filter((item) => item.id !== id),
      );
    },
    onError: (error) => {
      Alert.alert("Could not delete item", getApiErrorMessage(error));
    },
  });

  const menuItemsKey = ["menu-items", restaurantId] as const;

  const {
    mutate: toggleAvailable,
    isPending: togglingAvailability,
    variables: togglingAvailabilityVars,
  } = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      api
        .patch(`/menu/items/${id}`, { isAvailable })
        .then((res) => res.data as MenuItem),
    onMutate: async ({ id, isAvailable }) => {
      await queryClient.cancelQueries({ queryKey: menuItemsKey });
      const previous = queryClient.getQueryData<MenuItem[]>(menuItemsKey);
      queryClient.setQueryData<MenuItem[]>(menuItemsKey, (old) =>
        old?.map((item) => (item.id === id ? { ...item, isAvailable } : item)),
      );
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(menuItemsKey, context.previous);
      }
      Alert.alert("Could not update availability", getApiErrorMessage(error));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<MenuItem[]>(menuItemsKey, (old) =>
        old?.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        ),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: menuItemsKey });
    },
  });

  const visibleItems = selectedCategoryId
    ? items.filter((item) => item.categoryId === selectedCategoryId)
    : items;

  const isLoading = restaurantLoading || categoriesLoading || itemsLoading;
  const isInitialRequestError =
    restaurantIsError || categoriesIsError || itemsIsError;
  const requestError = restaurantError ?? categoriesError ?? itemsError;
  const categoryBusy = savingCategory || deletingCategory;

  function closeCategoryModal() {
    setCategoryModalVisible(false);
    setEditingCategory(null);
    setCategoryName("");
  }

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryName("");
    setCategoryModalVisible(true);
  }

  function openEditCategory(category: MenuCategory) {
    setEditingCategory(category);
    setCategoryName(category.name);
    setCategoryModalVisible(true);
  }

  function closeItemModal() {
    setItemModalVisible(false);
    setEditingItem(null);
    setItemName("");
    setItemDescription("");
    setItemPrice("");
    setItemImageUrl(null);
    setItemCategoryId("");
    setItemAvailable(true);
  }

  function openCreateItem() {
    if (categories.length === 0) {
      Alert.alert(
        "Add a category first",
        "Create a category before adding menu items.",
      );
      return;
    }
    setEditingItem(null);
    setItemName("");
    setItemDescription("");
    setItemPrice("");
    setItemImageUrl(null);
    setItemCategoryId(selectedCategoryId ?? categories[0].id);
    setItemAvailable(true);
    setItemModalVisible(true);
  }

  function openEditItem(item: MenuItem) {
    setEditingItem(item);
    setItemName(item.name);
    setItemDescription(item.description ?? "");
    setItemPrice(String(item.price));
    setItemImageUrl(item.imageUrl);
    setItemCategoryId(item.categoryId);
    setItemAvailable(item.isAvailable);
    setItemModalVisible(true);
  }

  function handleSaveCategory() {
    const validationError = validateCategoryName(categoryName);
    if (validationError) {
      Alert.alert("Check category", validationError);
      return;
    }
    saveCategory();
  }

  function handleSaveItem() {
    const validationError = validateMenuItem({
      name: itemName,
      description: itemDescription,
      price: itemPrice,
      categoryId: itemCategoryId,
    });
    if (validationError) {
      Alert.alert("Check menu item", validationError);
      return;
    }
    saveItem();
  }

  function confirmDeleteCategory(category: MenuCategory) {
    Alert.alert(
      "Delete category",
      `Delete "${category.name}"? Items in this category will be removed too.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteCategory(category.id),
        },
      ],
    );
  }

  function confirmDeleteItem(item: MenuItem) {
    Alert.alert("Delete item", `Delete "${item.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteItem(item.id),
      },
    ]);
  }

  function onCategoryLongPress(category: MenuCategory) {
    Alert.alert(category.name, undefined, [
      { text: "Rename", onPress: () => openEditCategory(category) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDeleteCategory(category),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function categoryNameFor(item: MenuItem) {
    return categories.find((category) => category.id === item.categoryId)?.name;
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      </SafeAreaView>
    );
  }

  if (isInitialRequestError) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <RequestErrorState
          error={requestError}
          onRetry={() => {
            void refetchRestaurant();
            void refetchCategories();
            void refetchItems();
          }}
          title="Couldn’t load your menu"
        />
      </SafeAreaView>
    );
  }

  if (!restaurant) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Create a restaurant first</Text>
          <Text style={styles.emptyText}>
            You need a restaurant before you can add a menu.
          </Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => router.replace("/(owner)/(index)/create-restaurant")}
          >
            <Text style={styles.primaryButtonText}>Create restaurant</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Menu</Text>
            <Text style={styles.subtitle}>{restaurant.name}</Text>
          </View>
          <Pressable style={styles.addButton} onPress={openCreateItem}>
            <Text style={styles.addButtonText}>Add item</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          <Pressable
            style={[styles.chip, !selectedCategoryId && styles.chipActive]}
            onPress={() => setSelectedCategoryId(null)}
          >
            <Text
              style={[
                styles.chipText,
                !selectedCategoryId && styles.chipTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          {categories.map((category) => {
            const active = selectedCategoryId === category.id;
            const isDeletingThisCategory =
              deletingCategory && deletingCategoryId === category.id;
            return (
              <Pressable
                key={category.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedCategoryId(category.id)}
                onLongPress={() => onCategoryLongPress(category)}
                disabled={isDeletingThisCategory}
              >
                {isDeletingThisCategory ? (
                  <ActivityIndicator
                    size="small"
                    color={active ? "#fff" : "#FF6B35"}
                  />
                ) : (
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {category.name}
                  </Text>
                )}
              </Pressable>
            );
          })}
          <Pressable style={styles.chipAdd} onPress={openCreateCategory}>
            <Text style={styles.chipAddText}>+ Category</Text>
          </Pressable>
        </ScrollView>

        <FlatList
          style={styles.list}
          data={visibleItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>
                {categories.length === 0
                  ? "Add a category, then add your first item."
                  : "No items in this category yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isDeletingThisItem =
              deletingItem && deletingItemId === item.id;
            return (
              <View style={styles.itemCard}>
                {item.imageUrl ? (
                  <Image
                    source={{ uri: item.imageUrl }}
                    style={styles.itemThumb}
                  />
                ) : (
                  <View style={[styles.itemThumb, styles.itemThumbEmpty]}>
                    <Text style={styles.itemThumbText}>No photo</Text>
                  </View>
                )}
                <View style={styles.itemBody}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemMeta}>
                    {categoryNameFor(item) ? `${categoryNameFor(item)} · ` : ""}
                    {formatCurrency(item.price)}
                  </Text>
                  <View style={styles.itemActions}>
                    <View style={styles.availableRow}>
                      <Text style={styles.availableLabel}>Available</Text>
                      <Switch
                        value={Boolean(item.isAvailable)}
                        onValueChange={(isAvailable) =>
                          toggleAvailable({ id: item.id, isAvailable })
                        }
                        disabled={
                          isDeletingThisItem ||
                          (togglingAvailability &&
                            togglingAvailabilityVars?.id === item.id)
                        }
                        trackColor={{ false: "#ddd", true: "#34c759" }}
                        thumbColor="#fff"
                      />
                    </View>
                    <Pressable
                      onPress={() => openEditItem(item)}
                      disabled={isDeletingThisItem}
                    >
                      <Text style={styles.link}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDeleteItem(item)}
                      disabled={deletingItem}
                    >
                      {isDeletingThisItem ? (
                        <ActivityIndicator size="small" color="#FF3B30" />
                      ) : (
                        <Text style={styles.dangerLink}>Delete</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
                {isDeletingThisItem ? (
                  <View style={styles.deletingOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.deletingText}>Deleting…</Text>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      </View>

      <Modal visible={categoryModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingCategory ? "Rename category" : "New category"}
            </Text>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={80}
              style={styles.input}
              placeholder="e.g. Starters"
              placeholderTextColor="#999"
              value={categoryName}
              onChangeText={setCategoryName}
            />
            <Pressable
              style={[
                styles.primaryButton,
                categoryBusy && styles.buttonDisabled,
              ]}
              onPress={handleSaveCategory}
              disabled={categoryBusy}
            >
              {savingCategory ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>Save</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={closeCategoryModal}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={itemModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {editingItem ? "Edit item" : "New item"}
              </Text>

              <MenuImagePicker
                image={itemImageUrl}
                onChange={setItemImageUrl}
                restaurantId={restaurant.id}
              />

              <Text style={styles.label}>Name</Text>
              <TextInput
                autoCapitalize="sentences"
                autoCorrect={false}
                maxLength={120}
                style={styles.input}
                placeholder="e.g. Margherita pizza"
                placeholderTextColor="#999"
                value={itemName}
                onChangeText={setItemName}
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                autoCapitalize="sentences"
                maxLength={500}
                style={[styles.input, styles.multiline]}
                placeholder="Optional"
                placeholderTextColor="#999"
                value={itemDescription}
                onChangeText={setItemDescription}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.label}>Price</Text>
              <TextInput
                style={styles.input}
                placeholder="9.99"
                placeholderTextColor="#999"
                value={itemPrice}
                onChangeText={setItemPrice}
                keyboardType="decimal-pad"
              />

              <Text style={styles.label}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {categories.map((category) => {
                  const active = itemCategoryId === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setItemCategoryId(category.id)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {editingItem ? (
                <View style={styles.availableRow}>
                  <Text style={styles.label}>Available</Text>
                  <Switch
                    value={itemAvailable}
                    onValueChange={setItemAvailable}
                    trackColor={{ false: "#ddd", true: "#34c759" }}
                  />
                </View>
              ) : null}

              <Pressable
                style={[
                  styles.primaryButton,
                  savingItem && styles.buttonDisabled,
                ]}
                onPress={handleSaveItem}
                disabled={savingItem}
              >
                {savingItem ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {editingItem ? "Save changes" : "Add item"}
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={closeItemModal}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 16,
    paddingBottom: BottomTabInset,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  addButton: {
    backgroundColor: "#FF6B35",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  categoryRow: {
    gap: 8,
    paddingBottom: 12,
    alignItems: "center",
  },
  chip: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: "#f9f9f9",
    minWidth: 72,
    alignItems: "center",
  },
  chipActive: {
    backgroundColor: "#FF6B35",
    borderColor: "#FF6B35",
  },
  chipText: {
    color: "#333",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#fff",
  },
  chipAdd: {
    borderWidth: 1,
    borderColor: "#FF6B35",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderStyle: "dashed",
  },
  chipAddText: {
    color: "#FF6B35",
    fontWeight: "600",
  },
  itemCard: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  deletingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  deletingText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  itemThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: "#f3f3f3",
  },
  itemThumbEmpty: {
    alignItems: "center",
    justifyContent: "center",
  },
  itemThumbText: {
    color: "#999",
    fontSize: 11,
  },
  itemBody: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  itemMeta: {
    color: "#666",
    marginTop: 2,
    marginBottom: 8,
  },
  itemActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  availableRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  availableLabel: {
    fontSize: 13,
    color: "#666",
  },
  link: {
    color: "#FF6B35",
    fontWeight: "600",
  },
  dangerLink: {
    color: "#FF3B30",
    fontWeight: "600",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    color: "#666",
    textAlign: "center",
    marginBottom: 16,
  },
  imagePicker: {
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "#f9f9f9",
    marginVertical: 8,
  },
  itemImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imagePickerText: {
    color: "#999",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  imagePickerWithImage: {
    borderStyle: "solid",
    borderColor: "#34c759",
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  uploadProgress: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalScroll: {
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
    color: "#111",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: "#fafafa",
    color: "#111",
    marginBottom: 8,
  },
  multiline: {
    minHeight: 80,
    paddingTop: 12,
  },
  primaryButton: {
    backgroundColor: "#FF6B35",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  secondaryButton: {
    padding: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#666",
    fontWeight: "600",
  },
});
