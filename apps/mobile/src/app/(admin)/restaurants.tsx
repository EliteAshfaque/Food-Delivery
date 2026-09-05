import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AccountStatus,
  RestaurantModerationStatus,
  UserRole,
  type RestaurantModerationStatus as ModerationStatus,
} from '@food-delivery/types';

import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/api-error';
import { ActionButton, ActionReasonModal, AdminHeader, AdminPagination, FilterPill, formatAdminDate, humanize, StatusPill } from '@/features/admin/components';
import type { AdminRestaurant, Paginated } from '@/features/admin/types';

type RestaurantFilter = ModerationStatus | 'ALL';
const filters: { label: string; value: RestaurantFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: RestaurantModerationStatus.PENDING_APPROVAL },
  { label: 'Approved', value: RestaurantModerationStatus.APPROVED },
  { label: 'Suspended', value: RestaurantModerationStatus.SUSPENDED },
  { label: 'Rejected', value: RestaurantModerationStatus.REJECTED },
];

export default function AdminRestaurantsScreen() {
  const [filter, setFilter] = useState<RestaurantFilter>('ALL');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<{
    item: AdminRestaurant;
    status: ModerationStatus;
  } | null>(null);
  const queryClient = useQueryClient();
  const restaurants = useQuery<Paginated<AdminRestaurant>>({
    queryKey: ['admin-restaurants', filter, page, search],
    queryFn: () => api.get('/admin/restaurants', {
      params: {
        pageSize: 50,
        page,
        moderationStatus: filter === 'ALL' ? undefined : filter,
        search: search.trim() || undefined,
      },
    }).then((res) => res.data),
  });
  const update = useMutation({
    mutationFn: ({ id, moderationStatus, moderationNote }: {
      id: string;
      moderationStatus: ModerationStatus;
      moderationNote?: string;
    }) => api.patch(`/admin/restaurants/${id}/moderation`, { moderationStatus, moderationNote }).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-restaurants'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (error) => Alert.alert('Could not moderate restaurant', getApiErrorMessage(error)),
  });

  function act(item: AdminRestaurant, status: ModerationStatus) {
    if (
      status === RestaurantModerationStatus.SUSPENDED ||
      status === RestaurantModerationStatus.REJECTED
    ) {
      setAction({ item, status });
      return;
    }
    update.mutate({ id: item.restaurant.id, moderationStatus: status });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={restaurants.isFetching} onRefresh={() => void restaurants.refetch()} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <AdminHeader eyebrow="PARTNER QUALITY" title="Restaurants" subtitle="Approve trustworthy partners and stop unsafe or inactive stores." />
        <TextInput accessibilityLabel="Search restaurants" autoCapitalize="words" onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }} placeholder="Search restaurant, cuisine, or address" placeholderTextColor={brand.colors.light.inkMuted} style={styles.search} value={search} />
        <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
          {filters.map((item) => <FilterPill key={item.value} active={filter === item.value} label={item.label} onPress={() => {
            setFilter(item.value);
            setPage(1);
          }} />)}
        </ScrollView>

        {restaurants.isLoading ? <View style={styles.loading}><ActivityIndicator color={brand.colors.light.primary} size="large" /></View> : null}
        {restaurants.isError ? <RequestErrorState error={restaurants.error} onRetry={() => void restaurants.refetch()} title="Could not load restaurants" /> : null}
        {restaurants.data ? <>
          <Text style={styles.resultText}>{restaurants.data.pagination.total} restaurant{restaurants.data.pagination.total === 1 ? '' : 's'}</Text>
          <View style={styles.list}>
            {restaurants.data.items.map((item) => {
              const restaurant = item.restaurant;
              const busy = update.isPending && update.variables?.id === restaurant.id;
              const ownerCanOperate =
                item.owner.role === UserRole.RESTAURANT_OWNER &&
                item.owner.accountStatus === AccountStatus.ACTIVE;
              return <View key={restaurant.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.iconWrap}><Text style={styles.iconText}>🍽</Text></View>
                  <View style={styles.nameCopy}>
                    <Text numberOfLines={1} style={styles.name}>{restaurant.name}</Text>
                    <Text numberOfLines={1} style={styles.address}>{restaurant.address}</Text>
                  </View>
                  <StatusPill status={restaurant.moderationStatus} />
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{restaurant.cuisineType || 'Cuisine not set'}</Text>
                  <Text style={styles.meta}>{restaurant.isOpen ? 'Open' : 'Closed'}</Text>
                  <Text style={styles.meta}>Created {formatAdminDate(restaurant.createdAt)}</Text>
                </View>
                <Text style={styles.owner}>Owner · {item.owner.firstName} {item.owner.lastName} · {item.owner.email ?? 'No email'}</Text>
                <Text style={[styles.ownerStatus, !ownerCanOperate && styles.ownerStatusWarning]}>Owner account · {humanize(item.owner.role)} · {humanize(item.owner.accountStatus)}</Text>
                {!ownerCanOperate && restaurant.moderationStatus !== RestaurantModerationStatus.APPROVED ? <Text style={styles.ownerWarning}>Activate the restaurant owner before approval.</Text> : null}
                {restaurant.moderationNote ? <Text style={styles.note}>{restaurant.moderationNote}</Text> : null}
                <View style={styles.actions}>
                  {restaurant.moderationStatus !== RestaurantModerationStatus.APPROVED ? <ActionButton disabled={busy || !ownerCanOperate} icon="check" label="Approve" onPress={() => act(item, RestaurantModerationStatus.APPROVED)} tone="success" /> : null}
                  {restaurant.moderationStatus !== RestaurantModerationStatus.PENDING_APPROVAL ? <ActionButton disabled={busy} icon="clock" label="Re-review" onPress={() => act(item, RestaurantModerationStatus.PENDING_APPROVAL)} tone="info" /> : null}
                  {restaurant.moderationStatus !== RestaurantModerationStatus.SUSPENDED ? <ActionButton disabled={busy} icon="warning" label="Suspend" onPress={() => act(item, RestaurantModerationStatus.SUSPENDED)} tone="warning" /> : null}
                  {restaurant.moderationStatus !== RestaurantModerationStatus.REJECTED ? <ActionButton disabled={busy} icon="close" label="Reject" onPress={() => act(item, RestaurantModerationStatus.REJECTED)} tone="danger" /> : null}
                </View>
              </View>;
            })}
            {restaurants.data.items.length === 0 ? <Text style={styles.empty}>No restaurants match these filters.</Text> : null}
          </View>
          <AdminPagination
            onPageChange={setPage}
            page={restaurants.data.pagination.page}
            total={restaurants.data.pagination.total}
            totalPages={restaurants.data.pagination.totalPages}
          />
        </> : null}
      </ScrollView>
      <ActionReasonModal
        confirmLabel={action?.status === RestaurantModerationStatus.SUSPENDED ? 'Suspend restaurant' : 'Reject restaurant'}
        description={action ? `Explain why ${action.item.restaurant.name} is being ${action.status === RestaurantModerationStatus.SUSPENDED ? 'suspended' : 'rejected'}. The owner sees this note.` : ''}
        onClose={() => setAction(null)}
        onConfirm={(moderationNote) => {
          if (!action) return;
          update.mutate({ id: action.item.restaurant.id, moderationStatus: action.status, moderationNote }, { onSuccess: () => setAction(null) });
        }}
        placeholder="Reason for this moderation decision"
        required
        submitting={update.isPending}
        title={action?.status === RestaurantModerationStatus.SUSPENDED ? 'Suspend restaurant' : 'Reject restaurant'}
        visible={Boolean(action)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { padding: 16, paddingBottom: 28 + BottomTabInset },
  search: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, color: brand.colors.light.ink, fontSize: 15, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12 },
  filters: { gap: 8, paddingBottom: 16 },
  loading: { minHeight: 300, justifyContent: 'center' },
  resultText: { color: brand.colors.light.inkMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  list: { gap: 10 },
  card: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, padding: 14 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  iconWrap: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  iconText: { fontSize: 17 },
  nameCopy: { flex: 1 },
  name: { color: brand.colors.light.ink, fontSize: 15, fontWeight: '900' },
  address: { color: brand.colors.light.inkMuted, fontSize: 11, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  meta: { color: brand.colors.light.inkMuted, fontSize: 11, fontWeight: '700' },
  owner: { color: brand.colors.light.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 7 },
  ownerStatus: { color: brand.colors.light.inkMuted, fontSize: 11, fontWeight: '700', lineHeight: 16, marginTop: 3 },
  ownerStatusWarning: { color: brand.colors.light.warning },
  ownerWarning: { color: brand.colors.light.warning, fontSize: 11, fontWeight: '800', lineHeight: 16, marginTop: 5 },
  note: { backgroundColor: brand.colors.light.surfaceMuted, borderRadius: 8, color: brand.colors.light.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 9, padding: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  empty: { color: brand.colors.light.inkMuted, fontSize: 14, paddingVertical: 30, textAlign: 'center' },
});
