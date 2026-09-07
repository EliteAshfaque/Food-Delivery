import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";

import { AppIcon } from "@/components/wasil-icon-system";
import { RequestErrorState } from "@/components/request-error-state";
import { WasilImage } from "@/components/wasil-image";
import { brand } from "@/constants/brand";
import { api } from "@/lib/axios";
import { formatCurrency } from "@/lib/format";
import { useCartStore } from "@/store/cart-store";
import type {
  MenuCategory,
  MenuItem,
  Restaurant,
  RestaurantReview,
} from "@food-delivery/types";

function formatRating(rating: number | string) {
  const value = typeof rating === "number" ? rating : Number.parseFloat(rating);
  if (Number.isNaN(value) || value <= 0) return "New";
  return value.toFixed(1);
}

export default function RestaurantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );

  const {
    items: cartItems,
    restaurantId: cartRestaurantId,
    restaurantName: cartRestaurantName,
    addItem,
    incrementItem,
    decrementItem,
    clearCart,
    totalItems,
    totalPrice,
  } = useCartStore();

  const {
    data: restaurant,
    error: restaurantError,
    isError: restaurantIsError,
    isLoading: restaurantLoading,
    refetch: refetchRestaurant,
  } =
    useQuery<Restaurant | null>({
      queryKey: ["restaurant", id],
      queryFn: () => api.get(`/restaurants/${id}`).then((res) => res.data),
      enabled: Boolean(id),
    });

  const {
    data: categories = [],
    error: categoriesError,
    isError: categoriesIsError,
    isLoading: categoriesLoading,
    refetch: refetchCategories,
  } = useQuery<MenuCategory[]>({
    queryKey: ["menu-categories", id],
    queryFn: () => api.get(`/menu/categories/${id}`).then((res) => res.data),
    enabled: Boolean(id),
  });

  const {
    data: menuItems = [],
    error: menuItemsError,
    isError: menuItemsIsError,
    isLoading: itemsLoading,
    refetch: refetchMenuItems,
  } = useQuery<MenuItem[]>({
    queryKey: ["menu-items", id],
    queryFn: () => api.get(`/menu/items/${id}`).then((res) => res.data),
    enabled: Boolean(id),
  });

  const { data: reviews = [] } = useQuery<RestaurantReview[]>({
    queryKey: ["restaurant-reviews", id],
    queryFn: () =>
      api.get(`/reviews/restaurant/${id}`).then((res) => res.data),
    enabled: Boolean(id),
  });

  const availableItems = useMemo(
    () => menuItems.filter((item) => item.isAvailable),
    [menuItems],
  );

  const visibleItems = useMemo(() => {
    if (!selectedCategoryId) return availableItems;
    return availableItems.filter(
      (item) => item.categoryId === selectedCategoryId,
    );
  }, [availableItems, selectedCategoryId]);

  const groupedSections = useMemo(() => {
    if (selectedCategoryId) {
      const category = categories.find(
        (item) => item.id === selectedCategoryId,
      );
      return [{ title: category?.name ?? "Items", data: visibleItems }];
    }

    return categories
      .map((category) => ({
        title: category.name,
        data: availableItems.filter((item) => item.categoryId === category.id),
      }))
      .filter((section) => section.data.length > 0);
  }, [availableItems, categories, selectedCategoryId, visibleItems]);

  const isLoading = restaurantLoading || categoriesLoading || itemsLoading;
  const cartCount = cartRestaurantId === id ? totalItems() : 0;
  const cartTotal = cartRestaurantId === id ? totalPrice() : 0;

  function getItemQuantity(menuItemId: string) {
    return cartItems.find((item) => item.id === menuItemId)?.quantity ?? 0;
  }

  function addToCart(menuItem: MenuItem) {
    if (!restaurant) return;
    if (!restaurant.isOpen || !menuItem.isAvailable) {
      Alert.alert(
        'Item unavailable',
        'This restaurant is not accepting orders right now. Please try another restaurant.',
      );
      return;
    }

    const cartItem = {
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      imageUrl: menuItem.imageUrl,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      quantity: 1,
    };

    if (cartRestaurantId && cartRestaurantId !== restaurant.id) {
      Alert.alert(
        "Replace cart?",
        `Your cart has items from ${cartRestaurantName}. Clear it and add from ${restaurant.name}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Clear & add",
            style: "destructive",
            onPress: () => {
              clearCart();
              addItem(cartItem);
            },
          },
        ],
      );
      return;
    }

    addItem(cartItem);
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <View style={styles.loadingIcon}>
          <AppIcon
            color={brand.colors.light.primary}
            name="restaurant"
            size="xl"
          />
        </View>
        <ActivityIndicator color={brand.colors.light.primary} size="small" />
        <Text style={styles.loadingText}>Setting the table…</Text>
      </View>
    );
  }

  if (restaurantIsError || categoriesIsError || menuItemsIsError) {
    return (
      <View style={styles.centered}>
        <RequestErrorState
          error={restaurantError ?? categoriesError ?? menuItemsError}
          onRetry={() => {
            void refetchRestaurant();
            void refetchCategories();
            void refetchMenuItems();
          }}
          title="Couldn’t load this restaurant"
        />
      </View>
    );
  }

  if (!restaurant) {
    return (
      <View style={styles.centered}>
        <View style={styles.loadingIcon}>
          <AppIcon
            color={brand.colors.light.primary}
            name="restaurant"
            size="xl"
          />
        </View>
        <Text style={styles.notFoundTitle}>Restaurant not found</Text>
        <Text style={styles.notFoundText}>
          This restaurant may no longer be available.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
        >
          <AppIcon color="#FFFFFF" name="back" size="sm" />
          <Text style={styles.primaryButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          cartCount > 0 && styles.scrollContentWithBar,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroWrap}>
          <WasilImage
            accessibilityLabel={`${restaurant.name.trim() || "Local kitchen"} restaurant image`}
            contentFit="contain"
            style={styles.heroImage}
            uri={restaurant.imageUrl}
          />
          <View style={styles.heroActions}>
            <Pressable
              accessibilityLabel="Go back"
              accessibilityRole="button"
              hitSlop={6}
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <AppIcon color={brand.colors.light.ink} name="back" size="md" />
            </Pressable>
            <View
              accessibilityLabel={`Rating ${formatRating(restaurant.rating)}`}
              style={styles.ratingPill}
            >
              <AppIcon
                color={brand.colors.light.accent}
                name="rating"
                size="xs"
              />
              <Text style={styles.ratingText}>
                {formatRating(restaurant.rating)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text accessibilityRole="header" style={styles.title}>
                {restaurant.name.trim() || "Local kitchen"}
              </Text>
              <Text style={styles.cuisine}>
                {restaurant.cuisineType.trim() || "Open kitchen"}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                restaurant.isOpen ? styles.statusOpen : styles.statusClosed,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  restaurant.isOpen
                    ? styles.statusDotOpen
                    : styles.statusDotClosed,
                ]}
              />
              <Text
                style={[
                  styles.statusText,
                  restaurant.isOpen
                    ? styles.statusTextOpen
                    : styles.statusTextClosed,
                ]}
              >
                {restaurant.isOpen ? "Open" : "Closed"}
              </Text>
            </View>
          </View>

          {restaurant.description?.trim() ? (
            <Text numberOfLines={3} style={styles.description}>
              {restaurant.description.trim()}
            </Text>
          ) : null}

          <View style={styles.metaChips}>
            <View style={styles.metaChip}>
              <AppIcon
                color={brand.colors.light.primary}
                name="deliveryTime"
                size="xs"
              />
              <Text style={styles.metaChipText}>25–35 min</Text>
            </View>
            <View style={styles.metaChip}>
              <AppIcon
                color={brand.colors.light.mint}
                name="deliveryLocation"
                size="xs"
              />
              <Text style={styles.metaChipText}>Free delivery</Text>
            </View>
            <View style={styles.metaChip}>
              <AppIcon
                color={brand.colors.light.inkMuted}
                name="location"
                size="xs"
              />
              <Text numberOfLines={1} style={styles.metaChipText}>
                {restaurant.address.trim() || "Nearby"}
              </Text>
            </View>
          </View>
        </View>

        {reviews.length > 0 ? (
          <View style={styles.reviewsCard}>
            <View style={styles.reviewsHeader}>
              <AppIcon
                color={brand.colors.light.primary}
                name="reviews"
                size="sm"
              />
              <Text style={styles.reviewsTitle}>Customer reviews</Text>
            </View>
            {reviews.slice(0, 3).map((review) => (
              <View key={review.id} style={styles.reviewItem}>
                <View style={styles.reviewTop}>
                  <Text style={styles.reviewName}>
                    {review.customerFirstName} {review.customerLastName[0]}.
                  </Text>
                  <View style={styles.reviewRatings}>
                    <View style={styles.reviewRating}>
                      <AppIcon
                        color={brand.colors.light.primary}
                        name="restaurant"
                        size="xs"
                      />
                      <Text style={styles.reviewRatingText}>
                        {review.restaurantRating}
                      </Text>
                    </View>
                    {review.driverRating ? (
                      <View style={styles.reviewRating}>
                        <AppIcon
                          color={brand.colors.light.mint}
                          name="deliveryRider"
                          size="xs"
                        />
                        <Text style={styles.reviewRatingText}>
                          {review.driverRating}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {review.comment ? (
                  <Text style={styles.reviewComment}>{review.comment}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.menuHeader}>
          <Text accessibilityRole="header" style={styles.menuHeading}>
            Menu
          </Text>
          <Text style={styles.menuCount}>{availableItems.length} items</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
        >
          <Pressable
            accessibilityLabel="All menu items"
            accessibilityRole="button"
            accessibilityState={{ selected: !selectedCategoryId }}
            onPress={() => setSelectedCategoryId(null)}
            style={({ pressed }) => [
              styles.categoryChip,
              !selectedCategoryId && styles.categoryChipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.categoryChipText,
                !selectedCategoryId && styles.categoryChipTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>
          {categories.map((category) => {
            const active = selectedCategoryId === category.id;
            return (
              <Pressable
                accessibilityLabel={`${category.name} menu items`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                key={category.id}
                onPress={() => setSelectedCategoryId(category.id)}
                style={({ pressed }) => [
                  styles.categoryChip,
                  active && styles.categoryChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    active && styles.categoryChipTextActive,
                  ]}
                >
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.menuContent}>
          {groupedSections.length === 0 ? (
            <View style={styles.emptyMenu}>
              <View style={styles.emptyMenuIcon}>
                <AppIcon
                  color={brand.colors.light.primary}
                  name="menu"
                  size="lg"
                />
              </View>
              <Text style={styles.emptyMenuTitle}>No items available</Text>
              <Text style={styles.emptyMenuText}>
                Check back soon for this restaurant&apos;s menu.
              </Text>
            </View>
          ) : (
            groupedSections.map((section) => (
              <View key={section.title} style={styles.section}>
                {!selectedCategoryId ? (
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                ) : null}
                {section.data.map((item) => {
                  const quantity = getItemQuantity(item.id);
                  return (
                    <View key={item.id} style={styles.menuCard}>
                      <View style={styles.menuBody}>
                        <Text numberOfLines={2} style={styles.menuName}>
                          {item.name}
                        </Text>
                        {item.description ? (
                          <Text
                            numberOfLines={2}
                            style={styles.menuDescription}
                          >
                            {item.description}
                          </Text>
                        ) : null}
                        <Text style={styles.menuPrice}>
                          {formatCurrency(item.price)}
                        </Text>

                        {quantity > 0 ? (
                          <View
                            accessibilityLabel={`${quantity} ${item.name} in cart`}
                            style={styles.qtyControls}
                          >
                            <Pressable
                              accessibilityLabel={`Remove one ${item.name}`}
                              accessibilityRole="button"
                              hitSlop={4}
                              onPress={() => decrementItem(item.id)}
                              style={({ pressed }) => [
                                styles.qtyButton,
                                pressed && styles.pressed,
                              ]}
                            >
                              <AppIcon
                                color={brand.colors.light.ink}
                                name="minus"
                                size="xs"
                              />
                            </Pressable>
                            <Text style={styles.qtyValue}>{quantity}</Text>
                            <Pressable
                              accessibilityLabel={`Add one ${item.name}`}
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled: !restaurant.isOpen,
                              }}
                              disabled={!restaurant.isOpen}
                              hitSlop={4}
                              onPress={() => incrementItem(item.id)}
                              style={({ pressed }) => [
                                styles.qtyButton,
                                pressed && restaurant.isOpen && styles.pressed,
                                !restaurant.isOpen && styles.qtyButtonDisabled,
                              ]}
                            >
                              <AppIcon
                                color={brand.colors.light.ink}
                                name="plus"
                                size="xs"
                              />
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityLabel={`Add ${item.name} to cart`}
                            accessibilityRole="button"
                            disabled={!restaurant.isOpen}
                            onPress={() => addToCart(item)}
                            style={({ pressed }) => [
                              styles.addButton,
                              !restaurant.isOpen && styles.addButtonDisabled,
                              pressed && restaurant.isOpen && styles.pressed,
                            ]}
                          >
                            <AppIcon color="#FFFFFF" name="plus" size="xs" />
                            <Text style={styles.addButtonText}>Add</Text>
                          </Pressable>
                        )}
                      </View>

                      <View style={styles.menuImageWrap}>
                        <WasilImage
                          contentFit="cover"
                          style={styles.menuImage}
                          uri={item.imageUrl}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {cartCount > 0 ? (
        <Pressable
          accessibilityLabel={`View cart, ${cartCount} items, ${formatCurrency(cartTotal)}`}
          accessibilityRole="button"
          onPress={() => router.push("/(customer)/cart")}
          style={({ pressed }) => [
            styles.cartBar,
            pressed && styles.cartBarPressed,
          ]}
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
          <View style={styles.cartCopy}>
            <Text style={styles.cartBarText}>View cart</Text>
            <Text style={styles.cartBarHint}>Ready when you are</Text>
          </View>
          <Text style={styles.cartBarPrice}>{formatCurrency(cartTotal)}</Text>
          <AppIcon color="#FFFFFF" name="navigation" size="sm" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  scrollContent: { paddingBottom: 32 },
  scrollContentWithBar: { paddingBottom: 124 },
  centered: {
    alignItems: "center",
    backgroundColor: brand.colors.light.canvas,
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  loadingIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 36,
    height: 80,
    justifyContent: "center",
    marginBottom: 16,
    width: 80,
  },
  loadingText: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 12,
  },
  notFoundTitle: {
    color: brand.colors.light.ink,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  notFoundText: {
    color: brand.colors.light.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.medium,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  heroWrap: {
    aspectRatio: 16 / 10,
    backgroundColor: brand.colors.light.surfaceMuted,
    overflow: "hidden",
    width: "100%",
  },
  heroImage: { height: "100%", width: "100%" },
  heroActions: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    left: 16,
    position: "absolute",
    right: 16,
    top: 14,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
    ...brand.shadow,
  },
  ratingPill: {
    alignItems: "center",
    backgroundColor: "rgba(37,25,42,0.9)",
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 11,
  },
  ratingText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  infoCard: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: 28,
    marginHorizontal: 12,
    marginTop: -36,
    padding: 18,
    ...brand.shadow,
  },
  titleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  titleBlock: { flex: 1 },
  title: {
    color: brand.colors.light.ink,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
    marginBottom: 4,
  },
  cuisine: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  statusBadge: {
    alignItems: "center",
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 6,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  statusOpen: { backgroundColor: "#E4F6F0" },
  statusClosed: { backgroundColor: "#FDECEE" },
  statusDot: { borderRadius: 4, height: 7, width: 7 },
  statusDotOpen: { backgroundColor: brand.colors.light.mint },
  statusDotClosed: { backgroundColor: brand.colors.light.danger },
  statusText: { fontSize: 12, fontWeight: "900" },
  statusTextOpen: { color: brand.colors.light.mint },
  statusTextClosed: { color: brand.colors.light.danger },
  description: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
  },
  metaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  metaChip: {
    alignItems: "center",
    backgroundColor: brand.colors.light.canvas,
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  metaChipText: {
    color: brand.colors.light.ink,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  reviewsCard: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: 22,
    marginHorizontal: 12,
    marginTop: 16,
    padding: 16,
    gap: 12,
    ...brand.shadow,
  },
  reviewsHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  reviewsTitle: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  reviewItem: {
    borderTopColor: brand.colors.light.border,
    borderTopWidth: 1,
    gap: 4,
    paddingTop: 10,
  },
  reviewTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  reviewName: {
    color: brand.colors.light.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  reviewRating: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  reviewRatings: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  reviewRatingText: {
    color: brand.colors.light.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  reviewComment: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  menuHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 28,
    paddingHorizontal: 16,
  },
  menuHeading: {
    color: brand.colors.light.ink,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  menuCount: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  categoryRow: { gap: 8, paddingHorizontal: 16, paddingRight: 28 },
  categoryChip: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 14,
  },
  categoryChipActive: {
    backgroundColor: brand.colors.light.primary,
    borderColor: brand.colors.light.primary,
  },
  categoryChipText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  categoryChipTextActive: { color: "#FFFFFF" },
  menuContent: { paddingHorizontal: 16, paddingTop: 18 },
  section: { marginBottom: 8 },
  sectionTitle: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 12,
    marginTop: 4,
  },
  menuCard: {
    alignItems: "flex-start",
    backgroundColor: brand.colors.light.surface,
    borderRadius: 20,
    flexDirection: "row",
    gap: 14,
    marginBottom: 12,
    minHeight: 120,
    padding: 12,
    ...brand.shadow,
  },
  menuBody: {
    flex: 1,
    justifyContent: "space-between",
    minHeight: 96,
    paddingVertical: 2,
  },
  menuName: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  menuDescription: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  menuPrice: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 10,
  },
  menuImageWrap: {
    backgroundColor: brand.colors.light.surfaceMuted,
    borderRadius: 16,
    height: 104,
    overflow: "hidden",
    width: 104,
  },
  menuImage: { height: "100%", width: "100%" },
  addButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 12,
  },
  addButtonDisabled: { backgroundColor: brand.colors.light.border },
  addButtonText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },
  qtyControls: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    minHeight: 34,
    paddingHorizontal: 4,
  },
  qtyButton: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 28,
  },
  qtyButtonDisabled: { opacity: 0.35 },
  qtyValue: {
    color: brand.colors.light.ink,
    fontSize: 13,
    fontWeight: "900",
    minWidth: 16,
    textAlign: "center",
  },
  emptyMenu: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderStyle: "dashed",
    borderWidth: 1,
    padding: 28,
  },
  emptyMenuIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 24,
    height: 56,
    justifyContent: "center",
    marginBottom: 10,
    width: 56,
  },
  emptyMenuTitle: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 5,
  },
  emptyMenuText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  cartBar: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderRadius: 22,
    bottom: 12,
    flexDirection: "row",
    gap: 10,
    left: 16,
    minHeight: 66,
    paddingHorizontal: 13,
    position: "absolute",
    right: 16,
    ...brand.shadow,
  },
  cartBarPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  cartBadge: {
    alignItems: "center",
    backgroundColor: brand.colors.light.accent,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  cartBadgeText: {
    color: brand.colors.light.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  cartCopy: { flex: 1 },
  cartBarText: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  cartBarHint: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  cartBarPrice: { color: "#FFFFFF", fontSize: 15, fontWeight: "900" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.97 }] },
});
