import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import Animated, {
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";
import { api } from "@/lib/axios";
import { useDebounce } from "@/hooks/use-debounce";
import { brand } from "@/constants/brand";
import { WasilLogo } from "@/components/wasil-brand";
import { WasilImage } from "@/components/wasil-image";
import { AppIcon, type FoodIconName } from "@/components/wasil-icon-system";
import { LocationPicker } from "@/components/location-picker";
import { useAuth } from "@/context/auth-context";
import { CategoryTile } from "@/components/wasil-ui-components";
import { RequestErrorState } from "@/components/request-error-state";
import type { Restaurant } from "@food-delivery/types";
import { distanceInKm, getCurrentCoordinates, type Coordinates } from "@/lib/location";
import { formatCurrency } from "@/lib/format";
import * as SecureStore from "expo-secure-store";

type HotOffer = {
  id: string;
  title: string;
  code: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: string;
  minimumOrderAmount: string;
  restaurant: {
    id: string;
    name: string;
    imageUrl: string | null;
    cuisineType: string | null;
    rating: string | number;
  };
};

const CUISINE_FILTERS = [
  "All",
  "Italian",
  "Chinese",
  "Indian",
  "Burger",
  "Pizza",
  "Arabic",
];
const QUICK_CATEGORIES: {
  filter: string;
  icon: FoodIconName;
  label: string;
}[] = [
  { label: "Arabic", filter: "Arabic", icon: "arabic" },
  { label: "Pizza", filter: "Pizza", icon: "pizza" },
  { label: "Burgers", filter: "Burger", icon: "burgers" },
  { label: "Indian", filter: "Indian", icon: "indian" },
  { label: "Asian", filter: "Chinese", icon: "asian" },
  { label: "Italian", filter: "Italian", icon: "healthy" },
];

function formatRating(rating: number | string) {
  const value = typeof rating === "number" ? rating : Number.parseFloat(rating);
  if (Number.isNaN(value) || value <= 0) return "New";
  return value.toFixed(1);
}

function getDistance(customer: Coordinates | null, restaurant: Restaurant) {
  if (
    !customer ||
    restaurant.latitude == null ||
    restaurant.longitude == null
  ) {
    return "Distance unavailable";
  }

  return `${distanceInKm(customer, {
    latitude: restaurant.latitude,
    longitude: restaurant.longitude,
  }).toFixed(1)} km`;
}

// Do not invent an ETA from the restaurant ID. A real ETA depends on the
// selected delivery pin, kitchen load, and an assigned driver's route.
const DELIVERY_TIME_LABEL = "ETA at checkout";

function displayText(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function formatOfferValue(offer: HotOffer) {
  if (offer.discountType === "PERCENTAGE") {
    return `${Number(offer.discountValue)}% OFF`;
  }
  return `${formatCurrency(offer.discountValue)} OFF`;
}

function locationPromptKey(userId: string) {
  // SecureStore accepts only a restricted key alphabet. User IDs normally are
  // UUIDs, but a provider-managed identifier can contain other characters.
  // Hash it instead of passing an external identifier directly to SecureStore.
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) | 0;
  }
  return `customer-location-prompted-${(hash >>> 0).toString(36)}`;
}

export default function CustomerHomeScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [hasPlayedEntrance, setHasPlayedEntrance] = useState(false);
  const [customerLocation, setCustomerLocation] = useState<Coordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isMapPickerVisible, setMapPickerVisible] = useState(false);
  const locationPromptStarted = useRef(false);
  const reduceMotion = useReducedMotion();
  const debouncedSearch = useDebounce(search, 400);

  const querySearch =
    activeFilter !== "All" && !debouncedSearch.trim()
      ? activeFilter
      : debouncedSearch.trim() || undefined;

  const {
    data: restaurants = [],
    error: restaurantsError,
    isError: restaurantsIsError,
    isLoading,
    isFetching,
    refetch: refetchRestaurants,
  } = useQuery<Restaurant[]>({
    queryKey: ["restaurants", querySearch ?? ""],
    queryFn: () =>
      api
        .get<Restaurant[]>("/restaurants", {
          params: querySearch ? { search: querySearch } : undefined,
        })
        .then((res) => res.data),
  });

  const { data: hotOffers = [] } = useQuery<HotOffer[]>({
    queryKey: ["hot-offers"],
    queryFn: () => api.get<HotOffer[]>("/offers/hot").then((res) => res.data),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (hasPlayedEntrance || restaurants.length === 0) return;

    const settled = setTimeout(() => setHasPlayedEntrance(true), 720);
    return () => clearTimeout(settled);
  }, [hasPlayedEntrance, restaurants.length]);

  useEffect(() => {
    if (!user || locationPromptStarted.current) return;

    let cancelled = false;
    const promptKey = locationPromptKey(user.id);

    void (async () => {
      const alreadyPrompted = await SecureStore.getItemAsync(promptKey).catch(
        () => null,
      );
      if (alreadyPrompted || cancelled) return;

      locationPromptStarted.current = true;
      const coordinates = await getCurrentCoordinates().catch(() => null);
      if (cancelled) return;

      if (coordinates) setCustomerLocation(coordinates);
      setMapPickerVisible(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const homeEntrance = (delay: number, duration = 320) =>
    hasPlayedEntrance || reduceMotion
      ? undefined
      : FadeInDown.duration(duration).delay(delay);

  function handleFilterPress(filter: string) {
    setActiveFilter(filter);
    if (filter === "All") {
      setSearch("");
      return;
    }
    setSearch(filter);
  }

  function openRestaurant(id: string) {
    router.push({
      pathname: "/(customer)/(index)/restaurant/[id]",
      params: { id },
    });
  }

  async function chooseLocation() {
    setIsLocating(true);
    try {
      const coords = await getCurrentCoordinates();
      if (!coords) {
        Alert.alert(
          "Location is optional",
          "Allow it only if you want to see restaurant distance.",
        );
        return;
      }
      setCustomerLocation(coords);
      setMapPickerVisible(true);
    } catch {
      Alert.alert(
        "Location unavailable",
        "You can still browse and enter a delivery address at checkout.",
      );
    } finally {
      setIsLocating(false);
    }
  }

  function completeLocationSelection(coordinates?: Coordinates) {
    if (coordinates) setCustomerLocation(coordinates);
    setMapPickerVisible(false);
    if (user) {
      void SecureStore.setItemAsync(
        locationPromptKey(user.id),
        "true",
      ).catch(() => undefined);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={restaurants}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.header}>
            <Animated.View entering={homeEntrance(30, 280)}>
              <View style={styles.topBar}>
                <WasilLogo size={38} />
                <Pressable
                  style={styles.deliveryLocation}
                  onPress={() => void chooseLocation()}
                  disabled={isLocating}
                  accessibilityRole="button"
                  accessibilityLabel="Choose location for restaurant distances"
                >
                  <AppIcon
                    name="location"
                    size="sm"
                    color={brand.colors.light.primary}
                  />
                  <View>
                    <Text style={styles.deliveryOverline}>DELIVERING TO</Text>
                    <Text style={styles.deliveryLabel}>
                      {isLocating
                        ? "Finding location…"
                        : customerLocation
                          ? "Current location"
                          : "Set location"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </Animated.View>

            <Animated.View entering={homeEntrance(80, 300)}>
              <Text style={styles.greeting}>Good evening</Text>
              <Text style={styles.heading}>What are you craving?</Text>
              <Text style={styles.subheading}>
                The best open kitchens, all in one place.
              </Text>
            </Animated.View>

            <Animated.View entering={homeEntrance(130, 320)}>
              <View style={styles.searchWrap}>
                <AppIcon
                  name="search"
                  size="sm"
                  color={brand.colors.light.inkMuted}
                />
                <TextInput
                  accessibilityLabel="Search restaurants or cuisine"
                  style={styles.searchInput}
                  placeholder="Search restaurants or cuisine..."
                  placeholderTextColor={brand.colors.light.inkMuted}
                  value={search}
                  onChangeText={(text) => {
                    setSearch(text);
                    if (activeFilter !== "All" && text !== activeFilter) {
                      setActiveFilter("All");
                    }
                  }}
                  clearButtonMode="while-editing"
                />
                {isFetching && !isLoading ? (
                  <ActivityIndicator
                    size="small"
                    color={brand.colors.light.primary}
                    style={styles.searchSpinner}
                  />
                ) : null}
              </View>
            </Animated.View>

            <Animated.View entering={homeEntrance(180, 340)}>
              <View style={styles.categoryHeading}>
                <Text style={styles.categoryTitle}>Start with a craving</Text>
                <Text style={styles.categoryHint}>Handpicked for you</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryRow}
              >
                {QUICK_CATEGORIES.map((category) => (
                  <CategoryTile
                    key={category.filter}
                    icon={category.icon}
                    title={category.label}
                    selected={activeFilter === category.filter}
                    onPress={() => handleFilterPress(category.filter)}
                  />
                ))}
              </ScrollView>
            </Animated.View>

            {hotOffers.length > 0 ? (
              <Animated.View entering={homeEntrance(205, 350)}>
                <View style={styles.offerHeading}>
                  <View>
                    <Text style={styles.categoryTitle}>Hot offers</Text>
                    <Text style={styles.offerHint}>Fresh value from open kitchens</Text>
                  </View>
                  <View style={styles.offerLivePill}>
                    <View style={styles.offerLiveDot} />
                    <Text style={styles.offerLiveText}>LIVE</Text>
                  </View>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.offerRow}
                >
                  {hotOffers.map((offer) => (
                    <Pressable
                      accessibilityHint="Open this restaurant's menu"
                      accessibilityLabel={`${formatOfferValue(offer)} at ${displayText(offer.restaurant.name, "this restaurant")}`}
                      accessibilityRole="button"
                      key={offer.id}
                      onPress={() => openRestaurant(offer.restaurant.id)}
                      style={({ pressed }) => [styles.offerCard, pressed && styles.cardPressed]}
                    >
                      <View style={styles.offerGlow} />
                      <Text style={styles.offerValue}>{formatOfferValue(offer)}</Text>
                      <Text numberOfLines={1} style={styles.offerTitle}>{offer.title}</Text>
                      <Text numberOfLines={1} style={styles.offerRestaurant}>{displayText(offer.restaurant.name, "Local kitchen")}</Text>
                      <View style={styles.offerFooter}>
                        <Text style={styles.offerCode}>{offer.code || "AUTO APPLIED"}</Text>
                        {Number(offer.minimumOrderAmount) > 0 ? <Text style={styles.offerMinimum}>Min. {formatCurrency(offer.minimumOrderAmount)}</Text> : null}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </Animated.View>
            ) : null}

            <Animated.View entering={homeEntrance(230, 360)}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filtersRow}
              >
                {CUISINE_FILTERS.map((filter) => {
                  const active = activeFilter === filter;
                  return (
                    <Pressable
                      accessibilityHint="Show restaurants in this cuisine"
                      accessibilityLabel={`${filter} cuisine`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={filter}
                      style={({ pressed }) => [
                        styles.filterChip,
                        active && styles.filterChipActive,
                        pressed && styles.filterPressed,
                      ]}
                      onPress={() => handleFilterPress(filter)}
                    >
                      <Text
                        style={[
                          styles.filterText,
                          active && styles.filterTextActive,
                        ]}
                      >
                        {filter}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Animated.View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Popular on Wasil</Text>
              <Text style={styles.sectionCount}>
                {restaurants.length} open now
              </Text>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View
            entering={
              hasPlayedEntrance || reduceMotion || index > 3
                ? undefined
                : FadeInDown.duration(360).delay(280 + index * 55)
            }
          >
            <Pressable
              accessibilityHint="View restaurant and menu"
              accessibilityLabel={`${displayText(item.name, "Local kitchen")}, ${displayText(item.cuisineType, "Open kitchen")}, ${formatRating(item.rating)} stars, ${DELIVERY_TIME_LABEL}, ${item.isOpen ? "open" : "closed"}`}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => openRestaurant(item.id)}
            >
              <View style={styles.cardImageWrap}>
                <WasilImage
                  contentFit="contain"
                  style={styles.cardImage}
                  uri={item.imageUrl}
                />
                <View
                  style={[
                    styles.cardStatusPill,
                    item.isOpen ? styles.statusOpen : styles.statusClosed,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      item.isOpen
                        ? styles.statusTextOpen
                        : styles.statusTextClosed,
                    ]}
                  >
                    {item.isOpen ? "Open" : "Closed"}
                  </Text>
                </View>
                <View style={styles.cardRatingBadge}>
                  <AppIcon
                    color={brand.colors.light.accent}
                    name="rating"
                    size="xs"
                  />
                  <Text style={styles.cardRatingText}>
                    {formatRating(item.rating)}
                  </Text>
                </View>
              </View>

              <View style={styles.cardBody}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {displayText(item.name, "Local kitchen")}
                </Text>
                <Text style={styles.cardCuisine} numberOfLines={1}>
                  {displayText(item.cuisineType, "Open kitchen")}
                </Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaChip}>
                    <AppIcon
                      name="deliveryTime"
                      size="xs"
                      color={brand.colors.light.primary}
                    />
                    <Text style={styles.metaText}>{DELIVERY_TIME_LABEL}</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <AppIcon
                      name="distance"
                      size="xs"
                      color={brand.colors.light.inkMuted}
                    />
                    <Text style={styles.metaText}>
                      {getDistance(customerLocation, item)}
                    </Text>
                  </View>
                </View>
              </View>
            </Pressable>
          </Animated.View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator
                size="large"
                color={brand.colors.light.primary}
              />
              <Text style={styles.loadingText}>Finding restaurants...</Text>
            </View>
          ) : restaurantsIsError ? (
            <RequestErrorState
              error={restaurantsError}
              onRetry={() => void refetchRestaurants()}
              title="Couldn’t load restaurants"
            />
          ) : (
            <View style={styles.centered}>
              <View style={styles.emptyIcon}>
                <AppIcon
                  name="restaurant"
                  size="xl"
                  color={brand.colors.light.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>No restaurants found</Text>
              <Text style={styles.emptyText}>
                Try another cuisine or search term
              </Text>
            </View>
          )
        }
      />
      <LocationPicker
        initialCoordinates={customerLocation}
        onClose={() => completeLocationSelection()}
        onConfirm={(coordinates) => completeLocationSelection(coordinates)}
        title="Choose your delivery area"
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
  header: {
    paddingBottom: 12,
    paddingTop: 6,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  deliveryLocation: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: "47%",
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  deliveryOverline: {
    color: brand.colors.light.inkMuted,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  deliveryLabel: {
    color: brand.colors.light.ink,
    fontSize: 11,
    fontWeight: "800",
  },
  greeting: {
    color: brand.colors.light.primaryText,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  heading: {
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.7,
    color: brand.colors.light.ink,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 15,
    color: brand.colors.light.inkMuted,
    marginBottom: 18,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: brand.colors.light.border,
    gap: 9,
    marginBottom: 21,
    paddingHorizontal: 15,
    ...brand.shadow,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: brand.colors.light.ink,
  },
  searchSpinner: {
    marginLeft: 8,
  },
  categoryHeading: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  categoryTitle: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  categoryHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  categoryRow: {
    gap: 14,
    paddingBottom: 24,
  },
  offerHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 11,
  },
  offerHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  offerLivePill: {
    alignItems: "center",
    backgroundColor: "#E7F6F0",
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  offerLiveDot: {
    backgroundColor: brand.colors.light.mint,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  offerLiveText: {
    color: brand.colors.light.mint,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  offerRow: {
    gap: 10,
    paddingBottom: 22,
  },
  offerCard: {
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.medium,
    minHeight: 150,
    overflow: "hidden",
    padding: 15,
    width: 218,
  },
  offerGlow: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: 80,
    height: 145,
    opacity: 0.2,
    position: "absolute",
    right: -55,
    top: -65,
    width: 145,
  },
  offerValue: {
    color: brand.colors.light.accent,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  offerTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    marginTop: 8,
  },
  offerRestaurant: {
    color: "#DCCDD4",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 3,
  },
  offerFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: "auto",
  },
  offerCode: {
    color: "#FFB09D",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  offerMinimum: {
    color: "#DCCDD4",
    fontSize: 9,
    fontWeight: "700",
  },
  filtersRow: {
    gap: 8,
    paddingBottom: 20,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: brand.radius.pill,
    backgroundColor: brand.colors.light.surface,
    borderWidth: 1,
    borderColor: brand.colors.light.border,
  },
  filterChipActive: {
    backgroundColor: brand.colors.light.ink,
    borderColor: brand.colors.light.ink,
  },
  filterPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.97 }],
  },
  filterText: {
    fontSize: 13,
    fontWeight: "700",
    color: brand.colors.light.inkMuted,
  },
  filterTextActive: {
    color: "#fff",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: brand.colors.light.ink,
    letterSpacing: -0.2,
  },
  sectionCount: {
    fontSize: 13,
    color: brand.colors.light.inkMuted,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    // Modest scroll room under the last card. Android NativeTabs already
    // insets the screen for the tab bar — do not add BottomTabInset again.
    paddingBottom: 36,
    flexGrow: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: brand.colors.light.inkMuted,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 28,
    height: 72,
    justifyContent: "center",
    marginBottom: 12,
    width: 72,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: brand.colors.light.ink,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 15,
    color: brand.colors.light.inkMuted,
    textAlign: "center",
  },
  card: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: 22,
    marginBottom: 18,
    overflow: "hidden",
    ...brand.shadow,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  cardImageWrap: {
    aspectRatio: 16 / 10,
    backgroundColor: brand.colors.light.surfaceMuted,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  cardImage: {
    height: "100%",
    width: "100%",
  },
  cardStatusPill: {
    borderRadius: brand.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    position: "absolute",
    right: 12,
    top: 12,
  },
  cardRatingBadge: {
    alignItems: "center",
    backgroundColor: "rgba(37,25,42,0.88)",
    borderRadius: brand.radius.pill,
    bottom: 12,
    flexDirection: "row",
    gap: 4,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
  },
  cardRatingText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  cardBody: {
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  metaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  metaChip: {
    alignItems: "center",
    backgroundColor: brand.colors.light.canvas,
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  metaText: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "800",
  },
  cardName: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  statusOpen: {
    backgroundColor: "rgba(228,246,240,0.96)",
  },
  statusClosed: {
    backgroundColor: "rgba(253,236,238,0.96)",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusTextOpen: {
    color: brand.colors.light.mint,
  },
  statusTextClosed: {
    color: brand.colors.light.danger,
  },
  cardCuisine: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 3,
  },
});
