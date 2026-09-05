import { useState } from "react";
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
import { useMutation, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import * as Location from "expo-location";
import { api } from "@/lib/axios";
import { useCartStore } from "@/store/cart-store";
import { BottomTabInset } from "@/constants/theme";
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
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [isMapPickerVisible, setMapPickerVisible] = useState(false);
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
    totalItems,
    totalPrice,
  } = useCartStore();
  const subtotal = totalPrice();
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
        deliveryAddress: deliveryAddress.trim(),
        deliveryLatitude: coords.latitude,
        deliveryLongitude: coords.longitude,
        items: items.map((item) => ({
          menuItemId: item.id,
          quantity: String(item.quantity),
        })),
        offerCode: appliedOfferCode ?? undefined,
      });
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
      address: deliveryAddress,
      coordinates: deliveryCoords,
    });
    if (deliveryError) {
      Alert.alert("Delivery details needed", deliveryError);
      return;
    }

    // validateDeliveryDetails has confirmed the pin, and this guard narrows
    // the value for the request payload as well.
    if (!deliveryCoords) return;
    if (appliedOfferCode && offerQuote.isError) {
      Alert.alert(
        "Offer needs attention",
        "This offer is no longer valid for the current cart. Remove it or apply it again before continuing.",
      );
      return;
    }

    placeOrder(deliveryCoords);
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
  }) {
    setDeliveryCoords(coordinates);
    setMapPickerVisible(false);

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
            <Text style={styles.label}>Delivery address and map pin</Text>
          </View>
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
            <Text style={styles.locationButtonText}>Search or choose delivery pin on map</Text>
          </Pressable>
          <Pressable
            style={[styles.locationButton, locating && styles.buttonDisabled]}
            disabled={locating}
            onPress={() => void locateEnteredAddress()}>
            <AppIcon name="map" size="sm" color={brand.colors.light.primary} />
            <Text style={styles.locationButtonText}>Locate entered address</Text>
          </Pressable>
          {deliveryCoords ? (
            <Text style={styles.coordsHint}>
              GPS locked · {deliveryCoords.latitude.toFixed(5)},{" "}
              {deliveryCoords.longitude.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.coordsHint}>
              Use current GPS, search a city/address on the map, or type an address. The exact pin is shared only with your driver for this order.
            </Text>
          )}
        </View>

        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.summaryLabel}>{totalItems()} items</Text>
            <Text style={styles.summaryNote}>
              Payment is confirmed securely in the next step.
            </Text>
            {Number(quotedDiscount) > 0 ? <Text style={styles.summarySaving}>You save {formatCurrency(quotedDiscount)}</Text> : null}
          </View>
          <View style={styles.totalCopy}>
            {Number(quotedDiscount) > 0 ? <Text style={styles.summarySubtotal}>{formatCurrency(subtotal)}</Text> : null}
            <Text style={styles.summaryTotal}>{formatCurrency(quotedTotal)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
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
            <View style={styles.placeOrderContent}>
              <AppIcon name="shoppingCart" size="sm" color="#FFFFFF" />
              <Text style={styles.placeOrderText}>
                Continue to payment · {formatCurrency(quotedTotal)}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
      <LocationPicker
        initialCoordinates={deliveryCoords}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(coordinates) => void handleMapLocationConfirm(coordinates)}
        title="Delivery location"
        visible={isMapPickerVisible}
      />
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
    paddingBottom: BottomTabInset,
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
    flexDirection: "row",
    marginBottom: 20,
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
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    padding: 12,
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
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    padding: 16,
  },
  summaryLabel: {
    fontSize: 15,
    color: brand.colors.light.ink,
    fontWeight: "800",
  },
  summaryNote: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    marginTop: 3,
  },
  summaryTotal: {
    fontSize: 20,
    fontWeight: "800",
    color: brand.colors.light.ink,
  },
  totalCopy: {
    alignItems: "flex-end",
  },
  summarySubtotal: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    textDecorationLine: "line-through",
  },
  summarySaving: {
    color: brand.colors.light.mint,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 4,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 16 + BottomTabInset,
    backgroundColor: brand.colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: brand.colors.light.border,
  },
  placeOrderButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    paddingVertical: 16,
    alignItems: "center",
  },
  placeOrderText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  placeOrderContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
});
