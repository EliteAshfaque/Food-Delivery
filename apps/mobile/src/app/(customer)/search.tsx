import { useState } from "react";
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
import type { Restaurant } from "@food-delivery/types";

import { WasilLogo } from "@/components/wasil-brand";
import { AppIcon, type FoodIconName } from "@/components/wasil-icon-system";
import { WasilImage } from "@/components/wasil-image";
import { brand } from "@/constants/brand";
import { BottomTabInset } from "@/constants/theme";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@/lib/axios";

const DISCOVERY_CATEGORIES: {
  filter: string;
  icon: FoodIconName;
  label: string;
}[] = [
  { label: "Arabic", filter: "Arabic", icon: "arabic" },
  { label: "Pizza", filter: "Pizza", icon: "pizza" },
  { label: "Burgers", filter: "Burger", icon: "burgers" },
  { label: "Indian", filter: "Indian", icon: "indian" },
  { label: "Asian", filter: "Chinese", icon: "asian" },
  { label: "Coffee", filter: "Coffee", icon: "coffee" },
];

function formatRating(rating: number | string) {
  const value = typeof rating === "number" ? rating : Number.parseFloat(rating);
  return Number.isNaN(value) || value <= 0 ? "New" : value.toFixed(1);
}

function getDeliveryTime(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index)) % 100;
  }

  const start = 22 + (hash % 16);
  return `${start}-${start + 9} min`;
}

function RestaurantResultCard({ item }: { item: Restaurant }) {
  return (
    <Pressable
      accessibilityHint="View restaurant and menu"
      accessibilityLabel={`${item.name}, ${item.cuisineType}, ${formatRating(item.rating)} stars`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/(customer)/(index)/restaurant/[id]",
          params: { id: item.id },
        })
      }
      style={({ pressed }) => [
        styles.resultCard,
        pressed && styles.resultCardPressed,
      ]}
    >
      <View style={styles.resultImageWrap}>
        <WasilImage
          contentFit="contain"
          style={styles.resultImage}
          uri={item.imageUrl}
        />
        <View
          style={[
            styles.openBadge,
            item.isOpen ? styles.openBadgeActive : styles.openBadgeInactive,
          ]}
        >
          <Text
            style={[
              styles.openBadgeText,
              item.isOpen
                ? styles.openBadgeTextActive
                : styles.openBadgeTextInactive,
            ]}
          >
            {item.isOpen ? "Open" : "Closed"}
          </Text>
        </View>
      </View>

      <View style={styles.resultBody}>
        <Text numberOfLines={1} style={styles.resultName}>
          {item.name}
        </Text>
        <Text numberOfLines={1} style={styles.resultCuisine}>
          {item.cuisineType}
        </Text>
        <View style={styles.resultMeta}>
          <View style={styles.metaItem}>
            <AppIcon
              color={brand.colors.light.accent}
              name="rating"
              size="xs"
            />
            <Text style={styles.metaText}>{formatRating(item.rating)}</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <AppIcon
              color={brand.colors.light.inkMuted}
              name="deliveryTime"
              size="xs"
            />
            <Text style={styles.metaText}>{getDeliveryTime(item.id)}</Text>
          </View>
          <AppIcon
            color={brand.colors.light.primary}
            name="navigation"
            size="sm"
            style={styles.resultArrow}
          />
        </View>
      </View>
    </Pressable>
  );
}

export default function CustomerSearchScreen() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const query = debouncedSearch.trim();
  const hasTypedSearch = search.trim().length > 0;
  const isSearchSettling = hasTypedSearch && query !== search.trim();

  const {
    data: restaurants = [],
    isFetching,
    isLoading,
  } = useQuery<Restaurant[]>({
    enabled: Boolean(query),
    queryKey: ["restaurant-search", query],
    queryFn: () =>
      api
        .get<Restaurant[]>("/restaurants", { params: { search: query } })
        .then((response) => response.data),
  });

  function handleCategoryPress(filter: string) {
    setSearch(filter);
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={hasTypedSearch && !isSearchSettling ? restaurants : []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.header}>
            <WasilLogo size={36} />

            <View style={styles.intro}>
              <Text style={styles.eyebrow}>DISCOVER NEARBY</Text>
              <Text style={styles.title}>Find a new favourite.</Text>
              <Text style={styles.subtitle}>
                Search restaurants, dishes, or the craving on your mind.
              </Text>
            </View>

            <View style={styles.searchShell}>
              <AppIcon
                color={brand.colors.light.primary}
                name="search"
                size="md"
              />
              <TextInput
                accessibilityLabel="Search restaurants or cuisines"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                onChangeText={setSearch}
                placeholder="Try “shawarma” or “pizza”"
                placeholderTextColor={brand.colors.light.inkMuted}
                returnKeyType="search"
                style={styles.searchInput}
                value={search}
              />
              {hasTypedSearch ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setSearch("")}
                  style={({ pressed }) => [
                    styles.clearButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <AppIcon
                    color={brand.colors.light.inkMuted}
                    name="close"
                    size="sm"
                  />
                </Pressable>
              ) : null}
              {isFetching || isSearchSettling ? (
                <ActivityIndicator
                  color={brand.colors.light.primary}
                  size="small"
                />
              ) : null}
            </View>

            {hasTypedSearch ? (
              <View style={styles.resultHeading}>
                <Text style={styles.sectionTitle}>Search results</Text>
                <Text style={styles.resultCount}>
                  {isLoading || isSearchSettling
                    ? "Searching…"
                    : `${restaurants.length} found`}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionTitle}>Browse by craving</Text>
                  <Text style={styles.sectionCaption}>Made for tonight</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.categoryRow}
                >
                  {DISCOVERY_CATEGORIES.map((category) => (
                    <Pressable
                      accessibilityHint="Search this cuisine"
                      accessibilityLabel={`Search ${category.label}`}
                      accessibilityRole="button"
                      key={category.filter}
                      onPress={() => handleCategoryPress(category.filter)}
                      style={({ pressed }) => [
                        styles.categoryPill,
                        pressed && styles.categoryPillPressed,
                      ]}
                    >
                      <View style={styles.categoryIcon}>
                        <AppIcon
                          color={brand.colors.light.primary}
                          name={category.icon}
                          size="sm"
                        />
                      </View>
                      <Text style={styles.categoryLabel}>{category.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                <View style={styles.inspirationCard}>
                  <View style={styles.inspirationIcon}>
                    <AppIcon
                      color={brand.colors.light.mint}
                      name="recommended"
                      size="md"
                    />
                  </View>
                  <View style={styles.inspirationCopy}>
                    <Text style={styles.inspirationTitle}>Not sure yet?</Text>
                    <Text style={styles.inspirationText}>
                      Explore the open kitchens selected for your area.
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Browse restaurants"
                    accessibilityRole="button"
                    onPress={() => router.push("/(customer)/(index)")}
                    style={({ pressed }) => [
                      styles.inspirationAction,
                      pressed && styles.pressed,
                    ]}
                  >
                    <AppIcon color="#FFFFFF" name="navigation" size="sm" />
                  </Pressable>
                </View>
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          hasTypedSearch && !isSearchSettling && !isLoading && !isFetching ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <AppIcon
                  color={brand.colors.light.primary}
                  name="search"
                  size="xl"
                />
              </View>
              <Text style={styles.emptyTitle}>Nothing matched that search</Text>
              <Text style={styles.emptyText}>
                Try a cuisine, restaurant name, or something more general.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSearch("")}
                style={({ pressed }) => [
                  styles.resetButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.resetButtonText}>Show all cravings</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderItem={({ item }) => <RestaurantResultCard item={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: brand.colors.light.canvas,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: BottomTabInset + 30,
  },
  header: {
    paddingTop: 6,
  },
  intro: {
    marginTop: 26,
  },
  eyebrow: {
    color: brand.colors.light.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.9,
    marginTop: 6,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 7,
    maxWidth: 320,
  },
  searchShell: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
    minHeight: 58,
    paddingHorizontal: 15,
    ...brand.shadow,
  },
  searchInput: {
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    minHeight: 56,
  },
  clearButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surfaceMuted,
    borderRadius: 14,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  sectionHeading: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
  },
  sectionTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  sectionCaption: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  categoryRow: {
    gap: 9,
    paddingBottom: 3,
    paddingTop: 13,
  },
  categoryPill: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 13,
    paddingTop: 10,
  },
  categoryPillPressed: {
    backgroundColor: brand.colors.light.primarySoft,
    transform: [{ scale: 0.97 }],
  },
  categoryIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 12,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  categoryLabel: {
    color: brand.colors.light.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  inspirationCard: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    flexDirection: "row",
    gap: 12,
    marginTop: 22,
    overflow: "hidden",
    padding: 16,
  },
  inspirationIcon: {
    alignItems: "center",
    backgroundColor: "rgba(98, 199, 174, 0.16)",
    borderRadius: 16,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  inspirationCopy: {
    flex: 1,
  },
  inspirationTitle: {
    color: "#FFF8F4",
    fontSize: 15,
    fontWeight: "900",
  },
  inspirationText: {
    color: "rgba(255, 248, 244, 0.72)",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  inspirationAction: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderRadius: 16,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  resultHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 13,
    marginTop: 27,
  },
  resultCount: {
    color: brand.colors.light.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  resultCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 12,
    minHeight: 124,
    overflow: "hidden",
    ...brand.shadow,
  },
  resultCardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  resultImageWrap: {
    backgroundColor: brand.colors.light.primarySoft,
    height: 124,
    overflow: "hidden",
    position: "relative",
    width: 124,
  },
  resultImage: {
    height: "100%",
    width: "100%",
  },
  openBadge: {
    borderRadius: brand.radius.pill,
    left: 9,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    top: 9,
  },
  openBadgeActive: {
    backgroundColor: "rgba(255, 255, 255, 0.93)",
  },
  openBadgeInactive: {
    backgroundColor: "rgba(37, 25, 42, 0.8)",
  },
  openBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },
  openBadgeTextActive: {
    color: brand.colors.light.mint,
  },
  openBadgeTextInactive: {
    color: "#FFF8F4",
  },
  resultBody: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  resultName: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  resultCuisine: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    marginTop: 3,
  },
  resultMeta: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 12,
  },
  metaItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  metaText: {
    color: brand.colors.light.ink,
    fontSize: 12,
    fontWeight: "800",
  },
  metaDivider: {
    backgroundColor: brand.colors.light.border,
    height: 15,
    marginHorizontal: 8,
    width: 1,
  },
  resultArrow: {
    marginLeft: "auto",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 30,
    paddingTop: 34,
  },
  emptyIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 32,
    height: 78,
    justifyContent: "center",
    width: 78,
  },
  emptyTitle: {
    color: brand.colors.light.ink,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 16,
    textAlign: "center",
  },
  emptyText: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    textAlign: "center",
  },
  resetButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    marginTop: 19,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  resetButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.72,
  },
});
