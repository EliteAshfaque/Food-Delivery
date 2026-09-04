import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { CategoryTile } from "@/components/wasil-ui-components";
import type { Restaurant } from "@food-delivery/types";

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

// Placeholder until customer location + restaurant coordinates are wired up.
function getPlaceholderDistance(restaurantId: string) {
  let hash = 0;
  for (let i = 0; i < restaurantId.length; i += 1) {
    hash = (hash + restaurantId.charCodeAt(i)) % 100;
  }
  const km = ((hash % 40) / 10 + 1.5).toFixed(1);
  return `${km} km`;
}

// Placeholder until real delivery ETA is calculated.
function getPlaceholderDeliveryTime(restaurantId: string) {
  let hash = 0;
  for (let i = 0; i < restaurantId.length; i += 1) {
    hash = (hash + restaurantId.charCodeAt(i)) % 100;
  }
  const min = 20 + (hash % 20);
  return `${min}-${min + 10} min`;
}

export default function CustomerHomeScreen() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [hasPlayedEntrance, setHasPlayedEntrance] = useState(false);
  const reduceMotion = useReducedMotion();
  const debouncedSearch = useDebounce(search, 400);

  const querySearch =
    activeFilter !== "All" && !debouncedSearch.trim()
      ? activeFilter
      : debouncedSearch.trim() || undefined;

  const {
    data: restaurants = [],
    isLoading,
    isFetching,
  } = useQuery<Restaurant[]>({
    queryKey: ["restaurants", querySearch ?? ""],
    queryFn: () =>
      api
        .get<Restaurant[]>("/restaurants", {
          params: querySearch ? { search: querySearch } : undefined,
        })
        .then((res) => res.data),
  });

  useEffect(() => {
    if (hasPlayedEntrance || restaurants.length === 0) return;

    const settled = setTimeout(() => setHasPlayedEntrance(true), 720);
    return () => clearTimeout(settled);
  }, [hasPlayedEntrance, restaurants.length]);

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
                <View style={styles.deliveryLocation}>
                  <AppIcon
                    name="location"
                    size="sm"
                    color={brand.colors.light.primary}
                  />
                  <View>
                    <Text style={styles.deliveryOverline}>DELIVERING TO</Text>
                    <Text style={styles.deliveryLabel}>Your saved address</Text>
                  </View>
                </View>
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
              accessibilityLabel={`${item.name.trim() || "Local kitchen"}, ${item.cuisineType.trim() || "Open kitchen"}, ${formatRating(item.rating)} stars, ${getPlaceholderDeliveryTime(item.id)} delivery, ${item.isOpen ? "open" : "closed"}`}
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
              </View>

              <View style={styles.cardBody}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name.trim() || "Local kitchen"}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
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
                </View>

                <Text style={styles.cardCuisine}>
                  {item.cuisineType.trim() || "Open kitchen"}
                </Text>
                <Text style={styles.cardAddress} numberOfLines={1}>
                  {item.address.trim() || "Delivery available"}
                </Text>

                <View style={styles.metaRow}>
                  <View style={styles.metaItem}>
                    <AppIcon
                      name="rating"
                      size="xs"
                      color={brand.colors.light.accent}
                    />
                    <Text style={styles.metaText}>
                      {formatRating(item.rating)}
                    </Text>
                  </View>
                  <Text style={styles.dot}>•</Text>
                  <View style={styles.metaItem}>
                    <AppIcon
                      name="distance"
                      size="xs"
                      color={brand.colors.light.inkMuted}
                    />
                    <Text style={styles.metaText}>
                      {getPlaceholderDistance(item.id)}
                    </Text>
                  </View>
                  <Text style={styles.dot}>•</Text>
                  <View style={styles.metaItem}>
                    <AppIcon
                      name="deliveryTime"
                      size="xs"
                      color={brand.colors.light.inkMuted}
                    />
                    <Text style={styles.metaText}>
                      {getPlaceholderDeliveryTime(item.id)}
                    </Text>
                  </View>
                </View>

                <View style={styles.recommendationRow}>
                  <AppIcon
                    name="recommended"
                    size="xs"
                    color={brand.colors.light.mint}
                  />
                  <Text style={styles.freeDelivery}>A top local pick</Text>
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
    paddingBottom: 24,
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
    borderRadius: brand.radius.large,
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
    ...brand.shadow,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.99 }],
  },
  cardImageWrap: {
    position: "relative",
  },
  cardImage: {
    height: 174,
    width: "100%",
  },
  cardBody: {
    backgroundColor: brand.colors.light.surface,
    elevation: 1,
    padding: 14,
    position: "relative",
    zIndex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 4,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaIcon: {
    fontSize: 12,
  },
  metaText: {
    fontSize: 13,
    color: brand.colors.light.inkMuted,
    fontWeight: "700",
  },
  recommendationRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  freeDelivery: {
    fontSize: 12,
    color: brand.colors.light.mint,
    fontWeight: "800",
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  cardName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "900",
    color: brand.colors.light.ink,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOpen: {
    backgroundColor: "#E4F6F0",
  },
  statusClosed: {
    backgroundColor: "#FDECEE",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusTextOpen: {
    color: brand.colors.light.mint,
  },
  statusTextClosed: {
    color: brand.colors.light.danger,
  },
  cardCuisine: {
    fontSize: 13,
    color: brand.colors.light.primaryText,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardAddress: {
    fontSize: 13,
    color: brand.colors.light.inkMuted,
    marginBottom: 8,
  },
  dot: {
    marginHorizontal: 6,
    color: brand.colors.light.border,
    fontSize: 12,
  },
});
