import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import type { Restaurant } from '@food-delivery/types';

import { AppIcon } from '@/components/wasil-icon-system';
import { WasilImage } from '@/components/wasil-image';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { getApiErrorMessage } from '@/lib/api-error';
import { api } from '@/lib/axios';
import { RequestErrorState } from '@/components/request-error-state';

type FavoriteRow = {
  favorite: { id: string; restaurantId: string; createdAt: string };
  restaurant: Restaurant;
};

function rating(value: Restaurant['rating']) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed.toFixed(1) : 'New';
}

export default function FavoritesScreen() {
  const queryClient = useQueryClient();
  const favorites = useQuery<FavoriteRow[]>({
    queryKey: ['favorites'],
    queryFn: () => api.get('/engagement/favorites').then((res) => res.data),
  });
  const removeFavorite = useMutation({
    mutationFn: (restaurantId: string) =>
      api.delete(`/engagement/favorites/${restaurantId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: (error) =>
      Alert.alert('Could not update favorites', getApiErrorMessage(error)),
  });

  return (
    <View style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={favorites.data ?? []}
        keyExtractor={(item) => item.favorite.id}
        refreshControl={
          <RefreshControl
            onRefresh={() => void favorites.refetch()}
            refreshing={favorites.isFetching && !favorites.isLoading}
            tintColor={brand.colors.light.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>YOUR LIST</Text>
            <Text style={styles.title}>Favorite places</Text>
            <Text style={styles.subtitle}>
              Keep your go-to restaurants ready for your next order.
            </Text>
          </View>
        }
        ListEmptyComponent={
          favorites.isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={brand.colors.light.primary} />
              <Text style={styles.emptyCopy}>Loading favorites…</Text>
            </View>
          ) : favorites.isError ? (
            <RequestErrorState
              error={favorites.error}
              onRetry={() => void favorites.refetch()}
              title="Could not load favorites"
            />
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <AppIcon color={brand.colors.light.primary} name="favorites" size="xl" />
              </View>
              <Text style={styles.emptyTitle}>No favorites yet</Text>
              <Text style={styles.emptyCopy}>
                Tap the heart on a restaurant to save it here.
              </Text>
              <Pressable
                onPress={() => router.replace('/(customer)/(index)')}
                style={styles.browseButton}>
                <Text style={styles.browseButtonText}>Browse restaurants</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) => {
          const restaurant = item.restaurant;
          return (
            <Pressable
              accessibilityLabel={`Open ${restaurant.name}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: '/(customer)/(index)/restaurant/[id]',
                  params: { id: restaurant.id },
                })
              }
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <WasilImage contentFit="cover" style={styles.image} uri={restaurant.imageUrl} />
              <View style={styles.copy}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{restaurant.name}</Text>
                  <View style={styles.rating}>
                    <AppIcon color={brand.colors.light.accent} name="rating" size="xs" />
                    <Text style={styles.ratingText}>{rating(restaurant.rating)}</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.meta}>{restaurant.cuisineType}</Text>
                <Text style={[styles.availability, !restaurant.isOpen && styles.closed]}>
                  {restaurant.isOpen ? 'Open now' : 'Currently closed'}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={`Remove ${restaurant.name} from favorites`}
                accessibilityRole="button"
                disabled={removeFavorite.isPending}
                hitSlop={10}
                onPress={(event) => {
                  event.stopPropagation();
                  removeFavorite.mutate(restaurant.id);
                }}
                style={styles.heartButton}>
                <AppIcon color={brand.colors.light.primary} name="favoriteRestaurant" size="md" />
              </Pressable>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { flexGrow: 1, padding: 16, paddingBottom: BottomTabInset + 28 },
  header: { marginBottom: 20, marginTop: 8 },
  eyebrow: { color: brand.colors.light.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: brand.colors.light.ink, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, marginTop: 5 },
  subtitle: { color: brand.colors.light.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  card: { alignItems: 'center', backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.large, borderWidth: 1, flexDirection: 'row', marginBottom: 12, minHeight: 96, padding: 10 },
  image: { borderRadius: 14, height: 74, width: 74 },
  copy: { flex: 1, marginHorizontal: 12 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  name: { color: brand.colors.light.ink, flex: 1, fontSize: 16, fontWeight: '900' },
  meta: { color: brand.colors.light.inkMuted, fontSize: 13, marginTop: 4 },
  availability: { color: brand.colors.light.mint, fontSize: 12, fontWeight: '800', marginTop: 7 },
  closed: { color: brand.colors.light.danger },
  rating: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  ratingText: { color: brand.colors.light.ink, fontSize: 12, fontWeight: '800' },
  heartButton: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 18, height: 40, justifyContent: 'center', width: 40 },
  pressed: { opacity: 0.72 },
  empty: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 70 },
  emptyIcon: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 34, height: 68, justifyContent: 'center', width: 68 },
  emptyTitle: { color: brand.colors.light.ink, fontSize: 19, fontWeight: '900', marginTop: 15 },
  emptyCopy: { color: brand.colors.light.inkMuted, fontSize: 14, lineHeight: 20, marginTop: 7, textAlign: 'center' },
  browseButton: { backgroundColor: brand.colors.light.primary, borderRadius: brand.radius.medium, marginTop: 20, paddingHorizontal: 18, paddingVertical: 12 },
  browseButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
