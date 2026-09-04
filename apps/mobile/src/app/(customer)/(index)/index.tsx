import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from '@/lib/axios';
import { useDebounce } from '@/hooks/use-debounce';
import type { Restaurant } from '@food-delivery/types';

const CUISINE_FILTERS = ['All', 'Italian', 'Chinese', 'Indian', 'Burger', 'Pizza', 'Arabic'];

function formatRating(rating: number | string) {
  const value = typeof rating === 'number' ? rating : Number.parseFloat(rating);
  if (Number.isNaN(value) || value <= 0) return 'New';
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
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const debouncedSearch = useDebounce(search, 400);

  const querySearch =
    activeFilter !== 'All' && !debouncedSearch.trim()
      ? activeFilter
      : debouncedSearch.trim() || undefined;

  const { data: restaurants = [], isLoading, isFetching } = useQuery<Restaurant[]>({
    queryKey: ['restaurants', querySearch ?? ''],
    queryFn: () =>
      api
        .get<Restaurant[]>('/restaurants', {
          params: querySearch ? { search: querySearch } : undefined,
        })
        .then((res) => res.data),
  });

  function handleFilterPress(filter: string) {
    setActiveFilter(filter);
    if (filter === 'All') {
      setSearch('');
      return;
    }
    setSearch(filter);
  }

  function openRestaurant(id: string) {
    router.push({
      pathname: '/(customer)/(index)/restaurant/[id]',
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
            <Text style={styles.greeting}>Good evening 👋</Text>
            <Text style={styles.heading}>What are you craving?</Text>
            <Text style={styles.subheading}>Discover open restaurants near you</Text>

            <View style={styles.searchWrap}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search restaurants or cuisine..."
                placeholderTextColor="#999"
                value={search}
                onChangeText={(text) => {
                  setSearch(text);
                  if (activeFilter !== 'All' && text !== activeFilter) {
                    setActiveFilter('All');
                  }
                }}
                clearButtonMode="while-editing"
              />
              {isFetching && !isLoading ? (
                <ActivityIndicator size="small" color="#FF6B35" style={styles.searchSpinner} />
              ) : null}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filtersRow}>
              {CUISINE_FILTERS.map((filter) => {
                const active = activeFilter === filter;
                return (
                  <Pressable
                    key={filter}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => handleFilterPress(filter)}>
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {filter}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Popular near you</Text>
              <Text style={styles.sectionCount}>{restaurants.length} open</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => openRestaurant(item.id)}>
            <View style={styles.cardImageWrap}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.cardImage} />
              ) : (
                <View style={styles.cardImagePlaceholder}>
                  <Text style={styles.placeholderEmoji}>🍽️</Text>
                </View>
              )}
              <View style={styles.cardOverlay} />
            </View>

            <View style={styles.cardBody}>
              <View style={styles.cardTopRow}>
                <Text style={styles.cardName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    item.isOpen ? styles.statusOpen : styles.statusClosed,
                  ]}>
                  <Text
                    style={[
                      styles.statusText,
                      item.isOpen ? styles.statusTextOpen : styles.statusTextClosed,
                    ]}>
                    {item.isOpen ? 'Open' : 'Closed'}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardCuisine}>{item.cuisineType}</Text>
              <Text style={styles.cardAddress} numberOfLines={1}>
                {item.address}
              </Text>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>⭐</Text>
                  <Text style={styles.metaText}>{formatRating(item.rating)}</Text>
                </View>
                <Text style={styles.dot}>•</Text>
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>📍</Text>
                  <Text style={styles.metaText}>{getPlaceholderDistance(item.id)}</Text>
                </View>
                <Text style={styles.dot}>•</Text>
                <View style={styles.metaItem}>
                  <Text style={styles.metaIcon}>🕒</Text>
                  <Text style={styles.metaText}>{getPlaceholderDeliveryTime(item.id)}</Text>
                </View>
              </View>

              <Text style={styles.freeDelivery}>Free delivery</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#FF6B35" />
              <Text style={styles.loadingText}>Finding restaurants...</Text>
            </View>
          ) : (
            <View style={styles.centered}>
              <Text style={styles.emptyEmoji}>🍕</Text>
              <Text style={styles.emptyTitle}>No restaurants found</Text>
              <Text style={styles.emptyText}>Try another cuisine or search term</Text>
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
    backgroundColor: '#F8F8F8',
  },
  header: {
    paddingTop: 8,
    paddingBottom: 8,
  },
  greeting: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600',
    marginBottom: 4,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 15,
    color: '#666',
    marginBottom: 16,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ECECEC',
    paddingHorizontal: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111',
  },
  searchSpinner: {
    marginLeft: 8,
  },
  filtersRow: {
    gap: 8,
    paddingBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  filterChipActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#444',
  },
  filterTextActive: {
    color: '#fff',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
  },
  sectionCount: {
    fontSize: 13,
    color: '#888',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#666',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    backgroundColor: '#fff',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  cardImageWrap: {
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: 170,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 170,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderEmoji: {
    fontSize: 36,
  },
  cardOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 60,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  cardBody: {
    padding: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaIcon: {
    fontSize: 12,
  },
  metaText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  freeDelivery: {
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  cardName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusOpen: {
    backgroundColor: '#DCFCE7',
  },
  statusClosed: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextOpen: {
    color: '#16A34A',
  },
  statusTextClosed: {
    color: '#DC2626',
  },
  cardCuisine: {
    fontSize: 13,
    color: '#FF6B35',
    fontWeight: '600',
    marginBottom: 4,
  },
  cardAddress: {
    fontSize: 13,
    color: '#777',
    marginBottom: 8,
  },
  dot: {
    marginHorizontal: 6,
    color: '#CCC',
    fontSize: 12,
  },
});
