import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { UserAddress } from "@food-delivery/types";
import { LocationPicker } from "@/components/location-picker";
import { RequestErrorState } from "@/components/request-error-state";
import { AppIcon } from "@/components/wasil-icon-system";
import { brand } from "@/constants/brand";
import { BottomTabInset } from "@/constants/theme";
import { getApiErrorMessage } from "@/lib/api-error";
import { api } from "@/lib/axios";
import {
  getAddressForCoordinates,
  getCoordinatesForAddress,
} from "@/lib/location";

const LABEL_OPTIONS = ["Home", "Work", "Other"] as const;

type AddressDraft = {
  id?: string;
  label: string;
  addressLine: string;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
};

const emptyDraft = (): AddressDraft => ({
  label: "Home",
  addressLine: "",
  latitude: null,
  longitude: null,
  isDefault: false,
});

export default function AddressesScreen() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [locating, setLocating] = useState(false);

  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () =>
      api.get<UserAddress[]>("/addresses").then((res) => res.data),
  });

  const saveMutation = useMutation({
    mutationFn: async (value: AddressDraft) => {
      if (value.latitude == null || value.longitude == null) {
        throw new Error("Set a map pin for this address.");
      }
      const payload = {
        label: value.label.trim(),
        addressLine: value.addressLine.trim(),
        latitude: value.latitude,
        longitude: value.longitude,
        isDefault: value.isDefault,
      };
      if (value.id) {
        return api
          .patch<UserAddress>(`/addresses/${value.id}`, payload)
          .then((res) => res.data);
      }
      return api
        .post<UserAddress>("/addresses", payload)
        .then((res) => res.data);
    },
    onSuccess: async () => {
      setDraft(null);
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: (error) => {
      Alert.alert("Could not save address", getApiErrorMessage(error));
    },
  });

  const defaultMutation = useMutation({
    mutationFn: (id: string) =>
      api.patch<UserAddress>(`/addresses/${id}/default`).then((res) => res.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: (error) => {
      Alert.alert("Could not update default", getApiErrorMessage(error));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/addresses/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
    },
    onError: (error) => {
      Alert.alert("Could not delete address", getApiErrorMessage(error));
    },
  });

  const sorted = useMemo(
    () => addresses.data ?? [],
    [addresses.data],
  );

  async function locateTypedAddress() {
    if (!draft?.addressLine.trim()) {
      Alert.alert("Enter an address", "Add street, building, or area first.");
      return;
    }
    setLocating(true);
    try {
      const coords = await getCoordinatesForAddress(draft.addressLine.trim());
      if (!coords) {
        Alert.alert(
          "Address not found",
          "Try a fuller address, or drop a pin on the map.",
        );
        return;
      }
      setDraft({ ...draft, latitude: coords.latitude, longitude: coords.longitude });
    } catch {
      Alert.alert("Address unavailable", "Try again or use the map.");
    } finally {
      setLocating(false);
    }
  }

  async function onMapConfirm(coordinates: {
    latitude: number;
    longitude: number;
  }) {
    setMapVisible(false);
    if (!draft) return;
    let addressLine = draft.addressLine;
    try {
      const detected = await getAddressForCoordinates(coordinates);
      if (detected) addressLine = detected;
    } catch {
      // Pin is still valid without reverse geocode.
    }
    setDraft({
      ...draft,
      addressLine,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    });
  }

  function confirmDelete(address: UserAddress) {
    Alert.alert(
      "Delete address?",
      `Remove ${address.label} · ${address.addressLine}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteMutation.mutate(address.id),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <AppIcon color={brand.colors.light.ink} name="back" size="sm" />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>DELIVERY</Text>
          <Text style={styles.title}>Saved addresses</Text>
        </View>
      </View>

      {addresses.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={brand.colors.light.primary} />
        </View>
      ) : null}

      {addresses.isError ? (
        <RequestErrorState
          error={addresses.error}
          onRetry={() => void addresses.refetch()}
        />
      ) : null}

      {!addresses.isLoading && !addresses.isError && !draft ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.subtitle}>
            Pick one at checkout, or add a new place like Home or Work.
          </Text>

          {sorted.length === 0 ? (
            <View style={styles.emptyCard}>
              <AppIcon
                color={brand.colors.light.primary}
                name="addAddress"
                size="lg"
              />
              <Text style={styles.emptyTitle}>No saved addresses yet</Text>
              <Text style={styles.emptyText}>
                Save your usual delivery spots so checkout stays one tap away.
              </Text>
            </View>
          ) : (
            sorted.map((address) => (
              <View key={address.id} style={styles.addressCard}>
                <View style={styles.addressTop}>
                  <View style={styles.labelPill}>
                    <Text style={styles.labelPillText}>{address.label}</Text>
                  </View>
                  {address.isDefault ? (
                    <Text style={styles.defaultBadge}>Default</Text>
                  ) : null}
                </View>
                <Text style={styles.addressLine}>{address.addressLine}</Text>
                <View style={styles.cardActions}>
                  {!address.isDefault ? (
                    <Pressable
                      onPress={() => defaultMutation.mutate(address.id)}
                    >
                      <Text style={styles.linkAction}>Make default</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() =>
                      setDraft({
                        id: address.id,
                        label: address.label,
                        addressLine: address.addressLine,
                        latitude: address.latitude,
                        longitude: address.longitude,
                        isDefault: address.isDefault,
                      })
                    }
                  >
                    <Text style={styles.linkAction}>Edit</Text>
                  </Pressable>
                  <Pressable onPress={() => confirmDelete(address)}>
                    <Text style={styles.dangerAction}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}

          <Pressable
            onPress={() =>
              setDraft({
                ...emptyDraft(),
                isDefault: sorted.length === 0,
              })
            }
            style={styles.addButton}
          >
            <AppIcon color="#FFFFFF" name="addAddress" size="sm" />
            <Text style={styles.addButtonText}>Add new address</Text>
          </Pressable>
        </ScrollView>
      ) : null}

      {draft ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.formTitle}>
            {draft.id ? "Edit address" : "Add address"}
          </Text>
          <Text style={styles.fieldLabel}>Label</Text>
          <View style={styles.labelRow}>
            {LABEL_OPTIONS.map((label) => (
              <Pressable
                key={label}
                onPress={() => setDraft({ ...draft, label })}
                style={[
                  styles.chip,
                  draft.label === label && styles.chipActive,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    draft.label === label && styles.chipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Delivery instructions</Text>
          <TextInput
            multiline
            onChangeText={(addressLine) =>
              setDraft({
                ...draft,
                addressLine,
                latitude: null,
                longitude: null,
              })
            }
            placeholder="Street, building, apartment..."
            placeholderTextColor={brand.colors.light.inkMuted}
            style={styles.input}
            textAlignVertical="top"
            value={draft.addressLine}
          />

          <Pressable
            disabled={locating}
            onPress={() => void locateTypedAddress()}
            style={styles.secondaryButton}
          >
            {locating ? (
              <ActivityIndicator color={brand.colors.light.primary} />
            ) : (
              <Text style={styles.secondaryButtonText}>Locate typed address</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => setMapVisible(true)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>
              Choose pin on map
            </Text>
          </Pressable>

          {draft.latitude != null && draft.longitude != null ? (
            <Text style={styles.coordsHint}>
              Pin locked · {draft.latitude.toFixed(5)},{" "}
              {draft.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.coordsHint}>
              A map pin is required so drivers can find this place.
            </Text>
          )}

          <Pressable
            onPress={() =>
              setDraft({ ...draft, isDefault: !draft.isDefault })
            }
            style={styles.defaultToggle}
          >
            <View
              style={[
                styles.checkbox,
                draft.isDefault && styles.checkboxChecked,
              ]}
            />
            <Text style={styles.defaultToggleText}>
              Set as default delivery address
            </Text>
          </Pressable>

          <View style={styles.formActions}>
            <Pressable
              onPress={() => setDraft(null)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saveMutation.isPending}
              onPress={() => saveMutation.mutate(draft)}
              style={styles.saveButton}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save address</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      ) : null}

      <LocationPicker
        initialCoordinates={
          draft?.latitude != null && draft.longitude != null
            ? { latitude: draft.latitude, longitude: draft.longitude }
            : null
        }
        onClose={() => setMapVisible(false)}
        onConfirm={(coordinates) => void onMapConfirm(coordinates)}
        title="Address location"
        visible={mapVisible}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: brand.colors.light.canvas,
    flex: 1,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderRadius: 16,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: brand.colors.light.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  content: {
    padding: 16,
    paddingBottom: BottomTabInset + 24,
  },
  centered: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderRadius: brand.radius.large,
    gap: 10,
    padding: 24,
  },
  emptyTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  addressCard: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: brand.radius.large,
    marginBottom: 12,
    padding: 16,
  },
  addressTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  labelPill: {
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  labelPillText: {
    color: brand.colors.light.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  defaultBadge: {
    color: brand.colors.light.mint,
    fontSize: 12,
    fontWeight: "800",
  },
  addressLine: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 14,
  },
  linkAction: {
    color: brand.colors.light.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  dangerAction: {
    color: brand.colors.light.danger,
    fontSize: 13,
    fontWeight: "800",
  },
  addButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.large,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  formTitle: {
    color: brand.colors.light.ink,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 16,
  },
  fieldLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: brand.colors.light.primarySoft,
    borderColor: brand.colors.light.primary,
  },
  chipText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  chipTextActive: {
    color: brand.colors.light.primary,
  },
  input: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    color: brand.colors.light.ink,
    fontSize: 15,
    minHeight: 96,
    padding: 14,
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 46,
  },
  secondaryButtonText: {
    color: brand.colors.light.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  coordsHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  defaultToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  checkbox: {
    borderColor: brand.colors.light.border,
    borderRadius: 6,
    borderWidth: 2,
    height: 20,
    width: 20,
  },
  checkboxChecked: {
    backgroundColor: brand.colors.light.primary,
    borderColor: brand.colors.light.primary,
  },
  defaultToggleText: {
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  cancelButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderRadius: brand.radius.medium,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  cancelButtonText: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    flex: 1.2,
    justifyContent: "center",
    minHeight: 50,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
