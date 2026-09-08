import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Location from "expo-location";
import type { UserAddress } from "@food-delivery/types";
import { api } from "@/lib/axios";
import { useCartStore } from "@/store/cart-store";
import { brand } from "@/constants/brand";
import { WasilMark } from "@/components/wasil-brand";
import { AppIcon } from "@/components/wasil-icon-system";
import { WasilImage } from "@/components/wasil-image";
import { LocationPicker } from "@/components/location-picker";
import { getApiErrorMessage } from "@/lib/api-error";
import { formatCurrency } from "@/lib/format";
import { validateDeliveryDetails } from "@/lib/form-validation";
import {
  getAddressForCoordinates,
  getCoordinatesForAddress,
} from "@/lib/location";

type OfferQuote = {
  offer: {
    id: string;
    title: string;
    code: string | null;
  };
  subtotalAmount: string;
  discountAmount: string;
  totalAmount: string;
};

type RestaurantOfferValue = {
  restaurantId: string | null;
  value: string;
};

export default function CustomerCartScreen() {
  const queryClient = useQueryClient();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null,
  );
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [isMapPickerVisible, setMapPickerVisible] = useState(false);
  const [isAddressPickerVisible, setAddressPickerVisible] = useState(false);
  const [isOneTimeMode, setOneTimeMode] = useState(false);
  const [saveAfterOrder, setSaveAfterOrder] = useState(false);
  const [offerInput, setOfferInput] = useState<RestaurantOfferValue>({
    restaurantId: null,
    value: "",
  });
  const [appliedOffer, setAppliedOffer] = useState<RestaurantOfferValue | null>(
    null,
  );
  const {
    items,
    restaurantId,
    restaurantName,
    incrementItem,
    decrementItem,
    removeItem,
    clearCart,
    totalPrice,
  } = useCartStore();
  const subtotal = totalPrice();

  const savedAddresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () =>
      api.get<UserAddress[]>("/addresses").then((res) => res.data),
  });

  // A saved address is derived from the latest query data instead of copying it
  // into local state after render. This keeps a newly marked default address
  // immediately usable and avoids a transient empty delivery form on load.
  const selectedSaved = isOneTimeMode
    ? undefined
    : savedAddresses.data?.find((item) => item.id === selectedAddressId) ??
      savedAddresses.data?.find((item) => item.isDefault) ??
      savedAddresses.data?.[0];
  const activeDeliveryAddress = selectedSaved?.addressLine ?? deliveryAddress;
  const activeDeliveryCoords = selectedSaved
    ? {
        latitude: selectedSaved.latitude,
        longitude: selectedSaved.longitude,
      }
    : deliveryCoords;
  // Offers are scoped to the restaurant that was in the cart when they were
  // entered. Deriving the visible value prevents a code from being carried to
  // a replacement cart without an effect that resets form state after render.
  const offerCode =
    offerInput.restaurantId === restaurantId ? offerInput.value : "";
  const appliedOfferCode =
    appliedOffer?.restaurantId === restaurantId ? appliedOffer.value : null;

  function setOfferCode(value: string) {
    setOfferInput({ restaurantId, value });
  }

  function setAppliedOfferCode(value: string | null) {
    setAppliedOffer(value ? { restaurantId, value } : null);
  }

  const offerQuote = useQuery<OfferQuote | null>({
    queryKey: ["offer-quote", restaurantId, subtotal, appliedOfferCode],
    queryFn: () =>
      api
        .post<OfferQuote | null>("/offers/validate", {
          restaurantId,
          subtotalAmount: subtotal,
          code: appliedOfferCode ?? undefined,
        })
        .then((res) => res.data),
    enabled: Boolean(restaurantId && subtotal > 0),
    retry: false,
    staleTime: 15_000,
  });

  const { mutate: validateOfferCode, isPending: validatingOffer } = useMutation({
    mutationFn: (code: string) => {
      if (!restaurantId) throw new Error("No restaurant selected");
      return api
        .post<OfferQuote | null>("/offers/validate", {
          restaurantId,
          subtotalAmount: subtotal,
          code,
        })
        .then((res) => res.data);
    },
    onSuccess: (quote, code) => {
      if (!quote) {
        Alert.alert("No offer available", "That code does not apply to this cart.");
        return;
      }
      setOfferCode(code);
      setAppliedOfferCode(code);
    },
    onError: (error) => {
      Alert.alert("Could not apply offer", getApiErrorMessage(error));
    },
  });

  const quotedTotal = offerQuote.data?.totalAmount ?? subtotal;
  const quotedDiscount = offerQuote.data?.discountAmount ?? "0";

  const { mutate: placeOrder, isPending } = useMutation({
    mutationFn: async (coords: { latitude: number; longitude: number }) => {
      if (!restaurantId) throw new Error("No restaurant selected");
      const { data } = await api.post("/orders", {
        restaurantId,
        deliveryAddress: activeDeliveryAddress.trim(),
        deliveryLatitude: coords.latitude,
        deliveryLongitude: coords.longitude,
        items: items.map((item) => ({
          menuItemId: item.id,
          quantity: String(item.quantity),
        })),
        offerCode: appliedOfferCode ?? undefined,
      });

      if (saveAfterOrder && isOneTimeMode) {
        await api.post("/addresses", {
          label: "Other",
          addressLine: activeDeliveryAddress.trim(),
          latitude: coords.latitude,
          longitude: coords.longitude,
          isDefault: (savedAddresses.data?.length ?? 0) === 0,
        });
        await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      }

      return data;
    },
    onSuccess: (order) => {
      clearCart();
      router.replace({
        pathname: "/(customer)/(index)/oder/[id]",
        params: { id: order.id },
      });
    },
    onError: (error) => {
      Alert.alert("Order failed", getApiErrorMessage(error));
    },
  });

  function applySavedAddress(address: UserAddress) {
    setSelectedAddressId(address.id);
    setDeliveryAddress(address.addressLine);
    setDeliveryCoords({
      latitude: address.latitude,
      longitude: address.longitude,
    });
    setOneTimeMode(false);
    setSaveAfterOrder(false);
    setAddressPickerVisible(false);
  }

  function startOneTimeAddress() {
    setSelectedAddressId(null);
    setOneTimeMode(true);
    setDeliveryAddress("");
    setDeliveryCoords(null);
    setAddressPickerVisible(false);
  }

  async function captureCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Allow location access so we can deliver to your exact spot.",
        );
        return null;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      setDeliveryCoords(coords);

      const [place] = await Location.reverseGeocodeAsync(coords).catch(() => []);
      if (place) {
        const parts = [
          place.name,
          place.street,
          place.district,
          place.city,
          place.region,
        ].filter(Boolean);
        if (parts.length > 0) {
          setDeliveryAddress(parts.join(", "));
        }
      }

      setMapPickerVisible(true);

      return coords;
    } catch {
      Alert.alert(
        "Location unavailable",
        "We couldn't read your GPS. Check permissions and try again.",
      );
      return null;
    } finally {
      setLocating(false);
    }
  }

  async function handlePlaceOrder() {
    if (items.length === 0) {
      Alert.alert("Cart is empty", "Add items from a restaurant menu first.");
      return;
    }

    if (!restaurantId) {
      Alert.alert("Restaurant unavailable", "Return to the restaurant and add your items again.");
      return;
    }

    if (
      items.some(
        (item) =>
          !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99,
      )
    ) {
      Alert.alert("Update item quantity", "Each item quantity must be between 1 and 99.");
      return;
    }

    const deliveryError = validateDeliveryDetails({
      address: activeDeliveryAddress,
      coordinates: activeDeliveryCoords,
    });
    if (deliveryError) {
      Alert.alert("Delivery details needed", deliveryError);
      return;
    }

    // validateDeliveryDetails has confirmed the pin, and this guard narrows
    // the value for the request payload as well.
    if (!activeDeliveryCoords) return;
    if (appliedOfferCode && offerQuote.isError) {
      Alert.alert(
        "Offer needs attention",
        "This offer is no longer valid for the current cart. Remove it or apply it again before continuing.",
      );
      return;
    }

    placeOrder(activeDeliveryCoords);
  }

  function applyOffer() {
    const code = offerCode.trim().toUpperCase();
    if (!code) {
      setAppliedOfferCode(null);
      return;
    }
    validateOfferCode(code);
  }

  async function locateEnteredAddress() {
    if (!deliveryAddress.trim()) {
      Alert.alert("Enter an address", "Add your street, building, or area first.");
      return;
    }

    setLocating(true);
    try {
      const coords = await getCoordinatesForAddress(deliveryAddress.trim());
      if (!coords) {
        Alert.alert("Address not found", "Try adding a city, area, or building number, or use your current location.");
        return;
      }
      setDeliveryCoords(coords);
      Alert.alert("Delivery pin set", "The driver will receive this pin only for this order.");
    } catch {
      Alert.alert("Address unavailable", "We couldn't locate that address. Try again or use your current location.");
    } finally {
      setLocating(false);
    }
  }

  function handleAddressChange(value: string) {
    setDeliveryAddress(value);
    // A typed address may no longer match the existing pin. Require a fresh
    // lookup so the driver is never sent to a stale location.
    if (deliveryCoords) setDeliveryCoords(null);
  }

  async function handleMapLocationConfirm(coordinates: {
    latitude: number;
    longitude: number;
  }, selectedAddressLabel?: string) {
    setDeliveryCoords(coordinates);
    setMapPickerVisible(false);

    if (selectedAddressLabel?.trim()) {
      setDeliveryAddress(selectedAddressLabel.trim());
      return;
    }

    try {
      const detectedAddress = await getAddressForCoordinates(coordinates);
      if (detectedAddress) {
        setDeliveryAddress(detectedAddress);
        return;
      }
    } catch {
      // The pin is still valid; ask for a delivery instruction below.
    }

    Alert.alert(
      "Pin saved",
      "Add a building, street, or area so your driver has clear delivery instructions.",
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIcon}>
          <AppIcon name="cart" size="xl" color={brand.colors.light.primary} />
        </View>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptyText}>
          A great meal is only a few taps away.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push("/(customer)/(index)")}
        >
          <Text style={styles.primaryButtonText}>Browse restaurants</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.checkoutHeader}>
          <WasilMark size={40} />
          <View style={styles.checkoutTitleBlock}>
            <Text style={styles.heading}>Your cart</Text>
            <Text style={styles.restaurantName}>{restaurantName}</Text>
          </View>
          <View style={styles.securePill}>
            <AppIcon name="lock" size="xs" color={brand.colors.light.mint} />
            <Text style={styles.securePillText}>Secure</Text>
          </View>
        </View>

        {items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <WasilImage
              contentFit="cover"
              style={styles.itemImage}
              uri={item.imageUrl}
            />
            <View style={styles.itemBody}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemPrice}>
                {formatCurrency(parseFloat(item.price) * item.quantity)}
              </Text>
              <View style={styles.qtyRow}>
                <Pressable
                  style={styles.qtyButton}
                  onPress={() => decrementItem(item.id)}
                >
                  <Text style={styles.qtyButtonText}>−</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{item.quantity}</Text>
                <Pressable
                  style={styles.qtyButton}
                  onPress={() => incrementItem(item.id)}
                >
                  <Text style={styles.qtyButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={() => removeItem(item.id)}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.offerBox}>
          <View style={styles.labelRow}>
            <AppIcon name="coupon" size="sm" color={brand.colors.light.primary} />
            <Text style={styles.label}>Offer code</Text>
          </View>
          <View style={styles.offerInputRow}>
            <TextInput
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!validatingOffer}
              onChangeText={setOfferCode}
              placeholder="Enter promo code"
              placeholderTextColor={brand.colors.light.inkMuted}
              style={styles.offerInput}
              value={offerCode}
            />
            <Pressable
              disabled={validatingOffer}
              onPress={applyOffer}
              style={[styles.offerApplyButton, validatingOffer && styles.buttonDisabled]}
            >
              {validatingOffer ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.offerApplyText}>{appliedOfferCode ? "Update" : "Apply"}</Text>}
            </Pressable>
          </View>
          {offerQuote.isFetching ? <Text style={styles.offerHint}>Checking the latest offer…</Text> : null}
          {offerQuote.data ? (
            <View style={styles.appliedOffer}>
              <View style={styles.appliedOfferCopy}>
                <Text style={styles.appliedOfferTitle}>{offerQuote.data.offer.title}</Text>
                <Text style={styles.appliedOfferDetail}>{offerQuote.data.offer.code ? `Code ${offerQuote.data.offer.code}` : "Automatically applied"}</Text>
              </View>
              <View style={styles.offerSaving}><Text style={styles.offerSavingLabel}>SAVING</Text><Text style={styles.offerSavingValue}>−{formatCurrency(offerQuote.data.discountAmount)}</Text></View>
              {appliedOfferCode ? <Pressable accessibilityRole="button" onPress={() => { setOfferCode(""); setAppliedOfferCode(null); }}><Text style={styles.removeOfferText}>Remove</Text></Pressable> : null}
            </View>
          ) : null}
          {offerQuote.isError && appliedOfferCode ? <Text style={styles.offerError}>{getApiErrorMessage(offerQuote.error)}</Text> : null}
        </View>

        <View style={styles.field}>
          <View style={styles.labelRow}>
            <AppIcon
              name="deliveryLocation"
              size="sm"
              color={brand.colors.light.primary}
            />
            <Text style={styles.label}>Deliver to</Text>
          </View>

          {selectedSaved && !isOneTimeMode ? (
            <View style={styles.savedAddressCard}>
              <View style={styles.savedAddressTop}>
                <View style={styles.savedLabelPill}>
                  <Text style={styles.savedLabelText}>{selectedSaved.label}</Text>
                </View>
                {selectedSaved.isDefault ? (
                  <Text style={styles.defaultBadge}>Default</Text>
                ) : null}
              </View>
              <Text style={styles.savedAddressLine}>
                {selectedSaved.addressLine}
              </Text>
              <View style={styles.savedAddressActions}>
                <Pressable onPress={() => setAddressPickerVisible(true)}>
                  <Text style={styles.changeAddressText}>Change</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    router.push("/(customer)/(index)/addresses")
                  }
                >
                  <Text style={styles.manageAddressText}>Manage</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {(savedAddresses.data?.length ?? 0) > 0 ? (
                <Pressable
                  onPress={() => setAddressPickerVisible(true)}
                  style={styles.pickSavedButton}
                >
                  <AppIcon
                    color={brand.colors.light.primary}
                    name="addresses"
                    size="sm"
                  />
                  <Text style={styles.locationButtonText}>
                    Choose a saved address
                  </Text>
                </Pressable>
              ) : null}
              <TextInput
                style={styles.input}
                placeholder="Street, building, apartment..."
                placeholderTextColor={brand.colors.light.inkMuted}
                value={deliveryAddress}
                onChangeText={handleAddressChange}
                multiline
                textAlignVertical="top"
              />
              <Pressable
                style={[styles.locationButton, locating && styles.buttonDisabled]}
                disabled={locating}
                onPress={() => void captureCurrentLocation()}
              >
                {locating ? (
                  <ActivityIndicator color={brand.colors.light.primary} />
                ) : (
                  <>
                    <AppIcon
                      name="currentLocation"
                      size="sm"
                      color={brand.colors.light.primary}
                    />
                    <Text style={styles.locationButtonText}>
                      {deliveryCoords ? "Refresh my location" : "Use my location"}
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={styles.mapButton}
                onPress={() => setMapPickerVisible(true)}
              >
                <AppIcon name="map" size="sm" color={brand.colors.light.primary} />
                <Text style={styles.locationButtonText}>
                  Search or choose delivery pin on map
                </Text>
              </Pressable>
              <Pressable
                style={[styles.locationButton, locating && styles.buttonDisabled]}
                disabled={locating}
                onPress={() => void locateEnteredAddress()}
              >
                <AppIcon name="map" size="sm" color={brand.colors.light.primary} />
                <Text style={styles.locationButtonText}>
                  Locate entered address
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSaveAfterOrder((value) => !value)}
                style={styles.saveToggle}
              >
                <View
                  style={[
                    styles.checkbox,
                    saveAfterOrder && styles.checkboxChecked,
                  ]}
                />
                <Text style={styles.saveToggleText}>
                  Save this address for next time
                </Text>
              </Pressable>
              {deliveryCoords ? (
                <Text style={styles.coordsHint}>
                  GPS locked · {deliveryCoords.latitude.toFixed(5)},{" "}
                  {deliveryCoords.longitude.toFixed(5)}
                </Text>
              ) : (
                <Text style={styles.coordsHint}>
                  Use a saved address, current GPS, or drop a map pin. The exact
                  pin is shared only with your driver for this order.
                </Text>
              )}
            </>
          )}
        </View>

        <View style={styles.billCard}>
          <Text style={styles.billTitle}>Bill details</Text>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Item total</Text>
            <Text style={styles.billValue}>{formatCurrency(subtotal)}</Text>
          </View>
          {Number(quotedDiscount) > 0 ? (
            <View style={styles.billRow}>
              <Text style={styles.billDiscountLabel}>Offer discount</Text>
              <Text style={styles.billDiscountValue}>
                −{formatCurrency(quotedDiscount)}
              </Text>
            </View>
          ) : null}
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery fee</Text>
            <Text style={styles.billFree}>Free</Text>
          </View>
          <View style={styles.billDivider} />
          <View style={styles.billRow}>
            <Text style={styles.billTotalLabel}>To pay</Text>
            <Text style={styles.billTotalValue}>
              {formatCurrency(quotedTotal)}
            </Text>
          </View>
          <Text style={styles.billNote}>
            Payment is confirmed securely on the next screen.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerTotalLabel}>Total</Text>
          <Text style={styles.footerTotalValue}>
            {formatCurrency(quotedTotal)}
          </Text>
        </View>
        <Pressable
          style={[
            styles.placeOrderButton,
            (isPending || locating || validatingOffer) && styles.buttonDisabled,
          ]}
          onPress={handlePlaceOrder}
          disabled={isPending || locating || validatingOffer}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.placeOrderText}>Continue to payment</Text>
          )}
        </Pressable>
      </View>
      <LocationPicker
        initialCoordinates={activeDeliveryCoords}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(coordinates, addressLabel) =>
          void handleMapLocationConfirm(coordinates, addressLabel)
        }
        title="Delivery location"
        visible={isMapPickerVisible}
      />
      <Modal
        animationType="slide"
        onRequestClose={() => setAddressPickerVisible(false)}
        transparent
        visible={isAddressPickerVisible}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Choose delivery address</Text>
            <ScrollView>
              {(savedAddresses.data ?? []).map((address) => (
                <Pressable
                  key={address.id}
                  onPress={() => applySavedAddress(address)}
                  style={[
                    styles.pickerOption,
                    selectedSaved?.id === address.id &&
                      styles.pickerOptionSelected,
                  ]}
                >
                  <View style={styles.pickerOptionTop}>
                    <Text style={styles.pickerOptionLabel}>{address.label}</Text>
                    {address.isDefault ? (
                      <Text style={styles.defaultBadge}>Default</Text>
                    ) : null}
                  </View>
                  <Text style={styles.pickerOptionLine}>
                    {address.addressLine}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={startOneTimeAddress}
              style={styles.pickerAddButton}
            >
              <AppIcon color="#FFFFFF" name="addAddress" size="sm" />
              <Text style={styles.pickerAddText}>
                Deliver somewhere else
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAddressPickerVisible(false);
                router.push("/(customer)/(index)/addresses");
              }}
              style={styles.pickerManageButton}
            >
              <Text style={styles.pickerManageText}>
                Manage saved addresses
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setAddressPickerVisible(false)}
              style={styles.pickerClose}
            >
              <Text style={styles.pickerCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.colors.light.canvas,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    // The footer is rendered above the customer tab bar; reserving the tab
    // inset here as well created a large empty Android gap.
    paddingBottom: 96,
    backgroundColor: brand.colors.light.canvas,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 30,
    height: 76,
    justifyContent: "center",
    marginBottom: 12,
    width: 76,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: brand.colors.light.ink,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: brand.colors.light.inkMuted,
    textAlign: "center",
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: brand.colors.light.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  heading: {
    fontSize: 25,
    fontWeight: "900",
    color: brand.colors.light.ink,
    letterSpacing: -0.5,
  },
  restaurantName: {
    fontSize: 14,
    color: brand.colors.light.primary,
    fontWeight: "800",
    marginTop: 2,
  },
  checkoutHeader: {
    alignItems: "center",
    backgroundColor: "#FFF0EA",
    borderRadius: 20,
    flexDirection: "row",
    marginBottom: 20,
    padding: 14,
  },
  checkoutTitleBlock: {
    flex: 1,
    marginLeft: 11,
  },
  securePill: {
    alignItems: "center",
    backgroundColor: "#E4F6F0",
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  securePillText: {
    color: brand.colors.light.mint,
    fontSize: 11,
    fontWeight: "900",
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: 20,
    borderWidth: 1,
    padding: 13,
    marginBottom: 12,
    gap: 12,
  },
  itemImage: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  itemBody: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "900",
    color: brand.colors.light.ink,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 14,
    color: brand.colors.light.primary,
    fontWeight: "800",
    marginBottom: 8,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: brand.colors.light.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  qtyValue: {
    minWidth: 18,
    textAlign: "center",
    fontWeight: "700",
    color: brand.colors.light.ink,
  },
  removeText: {
    color: brand.colors.light.danger,
    fontWeight: "700",
    fontSize: 12,
  },
  field: {
    marginTop: 8,
    marginBottom: 16,
  },
  offerBox: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    marginBottom: 16,
    padding: 13,
  },
  offerInputRow: {
    flexDirection: "row",
    gap: 8,
  },
  offerInput: {
    backgroundColor: brand.colors.light.canvas,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.small,
    borderWidth: 1,
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  offerApplyButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.small,
    justifyContent: "center",
    minWidth: 68,
    paddingHorizontal: 10,
  },
  offerApplyText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  offerHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    marginTop: 8,
  },
  appliedOffer: {
    alignItems: "center",
    backgroundColor: "#E7F6F0",
    borderRadius: brand.radius.small,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    padding: 10,
  },
  appliedOfferCopy: {
    flex: 1,
  },
  appliedOfferTitle: {
    color: brand.colors.light.ink,
    fontSize: 12,
    fontWeight: "900",
  },
  appliedOfferDetail: {
    color: brand.colors.light.mint,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
  },
  offerSaving: {
    alignItems: "flex-end",
  },
  offerSavingLabel: {
    color: brand.colors.light.mint,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  offerSavingValue: {
    color: brand.colors.light.mint,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },
  removeOfferText: {
    color: brand.colors.light.danger,
    fontSize: 10,
    fontWeight: "900",
  },
  offerError: {
    color: brand.colors.light.danger,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  labelRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    color: brand.colors.light.ink,
  },
  input: {
    borderWidth: 1,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: brand.colors.light.surface,
    color: brand.colors.light.ink,
    minHeight: 80,
  },
  locationButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.medium,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  mapButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 10,
  },
  locationButtonText: {
    color: brand.colors.light.primaryText,
    fontSize: 14,
    fontWeight: "800",
  },
  coordsHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  billCard: {
    backgroundColor: "#25192A",
    borderRadius: 22,
    marginBottom: 8,
    padding: 16,
    ...brand.shadow,
  },
  billTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 4,
  },
  billRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  billLabel: {
    color: "#D9CDD3",
    fontSize: 14,
    fontWeight: "600",
  },
  billValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  billDiscountLabel: {
    color: brand.colors.light.mint,
    fontSize: 14,
    fontWeight: "700",
  },
  billDiscountValue: {
    color: brand.colors.light.mint,
    fontSize: 14,
    fontWeight: "800",
  },
  billFree: {
    color: brand.colors.light.mint,
    fontSize: 14,
    fontWeight: "800",
  },
  billDivider: {
    backgroundColor: brand.colors.light.border,
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
  },
  billTotalLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  billTotalValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  billNote: {
    color: "#D9CDD3",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
  },
  footer: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderTopColor: brand.colors.light.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    left: 0,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: "absolute",
    right: 0,
  },
  footerTotal: {
    flexShrink: 0,
  },
  footerTotalLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  footerTotalValue: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  placeOrderButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderRadius: 14,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 14,
  },
  placeOrderText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  placeOrderContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  savedAddressCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    padding: 14,
  },
  savedAddressTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  savedLabelPill: {
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  savedLabelText: {
    color: brand.colors.light.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  defaultBadge: {
    color: brand.colors.light.mint,
    fontSize: 12,
    fontWeight: "800",
  },
  savedAddressLine: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  savedAddressActions: {
    flexDirection: "row",
    gap: 18,
    marginTop: 12,
  },
  changeAddressText: {
    color: brand.colors.light.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  manageAddressText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  pickSavedButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  saveToggle: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
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
  saveToggleText: {
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  pickerOverlay: {
    backgroundColor: "rgba(37, 25, 42, 0.45)",
    flex: 1,
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: brand.colors.light.canvas,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "78%",
    padding: 18,
    paddingBottom: 28,
  },
  pickerTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  pickerOption: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    marginBottom: 10,
    padding: 14,
  },
  pickerOptionSelected: {
    borderColor: brand.colors.light.primary,
  },
  pickerOptionTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  pickerOptionLabel: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  pickerOptionLine: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  pickerAddButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 6,
    minHeight: 48,
  },
  pickerAddText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  pickerManageButton: {
    alignItems: "center",
    marginTop: 12,
    minHeight: 40,
    justifyContent: "center",
  },
  pickerManageText: {
    color: brand.colors.light.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  pickerClose: {
    alignItems: "center",
    marginTop: 4,
    minHeight: 40,
    justifyContent: "center",
  },
  pickerCloseText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: "700",
  },
});
