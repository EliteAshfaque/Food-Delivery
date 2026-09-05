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
import { useMutation } from "@tanstack/react-query";
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
import {
  getAddressForCoordinates,
  getCoordinatesForAddress,
} from "@/lib/location";

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`;
}

export default function CustomerCartScreen() {
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryCoords, setDeliveryCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [isMapPickerVisible, setMapPickerVisible] = useState(false);
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
    onError: (error: Error) => {
      Alert.alert("Order failed", error.message);
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
    if (!deliveryAddress.trim()) {
      Alert.alert(
        "Delivery address required",
        "Please enter your delivery address.",
      );
      return;
    }
    if (items.length === 0) {
      Alert.alert("Cart is empty", "Add items from a restaurant menu first.");
      return;
    }

    if (!deliveryCoords) {
      Alert.alert(
        "Delivery pin required",
        "Use your current location or locate the address you entered so the driver can find you.",
      );
      return;
    }

    placeOrder(deliveryCoords);
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
                {formatPrice(parseFloat(item.price) * item.quantity)}
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
            onChangeText={setDeliveryAddress}
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
              Final payment is confirmed securely.
            </Text>
          </View>
          <Text style={styles.summaryTotal}>{formatPrice(totalPrice())}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.placeOrderButton, isPending && styles.buttonDisabled]}
          onPress={handlePlaceOrder}
          disabled={isPending}
        >
          {isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.placeOrderContent}>
              <AppIcon name="shoppingCart" size="sm" color="#FFFFFF" />
              <Text style={styles.placeOrderText}>
                Place order · {formatPrice(totalPrice())}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
      <LocationPicker
        initialCoordinates={deliveryCoords}
        onClose={() => setMapPickerVisible(false)}
        onConfirm={(coordinates) => {
          setDeliveryCoords(coordinates);
          setMapPickerVisible(false);
          void getAddressForCoordinates(coordinates)
            .then((detectedAddress) => {
              if (detectedAddress) setDeliveryAddress(detectedAddress);
            })
            .catch(() => undefined);
        }}
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
