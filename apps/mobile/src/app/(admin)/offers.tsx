import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OfferStatus, type OfferStatus as OfferStatusType } from '@food-delivery/types';

import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/api-error';
import { formatCurrency } from '@/lib/format';
import { ActionButton, AdminHeader, AdminPagination, FilterPill, formatAdminDate, StatusPill } from '@/features/admin/components';
import type { AdminOffer, Paginated } from '@/features/admin/types';

type OfferFilter = OfferStatusType | 'ALL' | 'FEATURED';
const filters: { label: string; value: OfferFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Featured', value: 'FEATURED' },
  { label: 'Draft', value: OfferStatus.DRAFT },
  { label: 'Active', value: OfferStatus.ACTIVE },
  { label: 'Scheduled', value: OfferStatus.SCHEDULED },
  { label: 'Paused', value: OfferStatus.PAUSED },
  { label: 'Archived', value: OfferStatus.ARCHIVED },
];

type AdminOfferUpdate = {
  status?: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  isFeatured?: boolean;
  sortOrder?: number;
};

function discountLabel(offer: AdminOffer) {
  return offer.discountType === 'PERCENTAGE'
    ? `${Number(offer.discountValue)}% off`
    : `${formatCurrency(offer.discountValue)} off`;
}

export default function AdminOffersScreen() {
  const [filter, setFilter] = useState<OfferFilter>('ALL');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const offers = useQuery<Paginated<AdminOffer>>({
    queryKey: ['admin-offers', filter, page, search],
    queryFn: () => api.get('/admin/offers', {
      params: {
        pageSize: 50,
        page,
        featured: filter === 'FEATURED' ? true : undefined,
        status: filter !== 'ALL' && filter !== 'FEATURED' ? filter : undefined,
        search: search.trim() || undefined,
      },
    }).then((res) => res.data),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AdminOfferUpdate }) =>
      api.patch(`/admin/offers/${id}`, payload).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-offers'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (error) => Alert.alert('Could not update offer', getApiErrorMessage(error)),
  });

  function confirmArchive(offer: AdminOffer) {
    Alert.alert(
      'Archive offer?',
      `${offer.title} will no longer be available to customers. This cannot be undone through the owner workspace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => update.mutate({ id: offer.id, payload: { status: 'ARCHIVED' } }) },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={offers.isFetching} onRefresh={() => void offers.refetch()} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <AdminHeader eyebrow="CAMPAIGN CONTROL" title="Hot Offers" subtitle="Feature the best value, pause risky promotions, and keep campaign capacity accurate." />
        <TextInput accessibilityLabel="Search offers" autoCapitalize="characters" autoCorrect={false} onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }} placeholder="Search offer, code, or restaurant" placeholderTextColor={brand.colors.light.inkMuted} style={styles.search} value={search} />
        <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
          {filters.map((item) => <FilterPill key={item.value} active={filter === item.value} label={item.label} onPress={() => {
            setFilter(item.value);
            setPage(1);
          }} />)}
        </ScrollView>
        {offers.isLoading ? <View style={styles.loading}><ActivityIndicator color={brand.colors.light.primary} size="large" /></View> : null}
        {offers.isError ? <RequestErrorState error={offers.error} onRetry={() => void offers.refetch()} title="Could not load campaigns" /> : null}
        {offers.data ? <>
          <Text style={styles.resultText}>{offers.data.pagination.total} campaign{offers.data.pagination.total === 1 ? '' : 's'}</Text>
          <View style={styles.list}>
            {offers.data.items.map((offer) => {
              const busy = update.isPending && update.variables?.id === offer.id;
              const canActivate = !['ACTIVE', 'ARCHIVED', 'EXPIRED'].includes(offer.effectiveStatus);
              const canPause = ['ACTIVE', 'SCHEDULED'].includes(offer.effectiveStatus);
              const canFeature = ['ACTIVE', 'SCHEDULED'].includes(offer.effectiveStatus);
              return <View key={offer.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={[styles.offerIcon, offer.isFeatured && styles.offerIconFeatured]}><Text style={styles.offerIconText}>{offer.isFeatured ? '★' : '%'}</Text></View>
                  <View style={styles.copy}>
                    <Text numberOfLines={1} style={styles.title}>{offer.title}</Text>
                    <Text numberOfLines={1} style={styles.restaurant}>{offer.restaurant.name}</Text>
                  </View>
                  <StatusPill status={offer.effectiveStatus} />
                </View>
                <View style={styles.dealRow}>
                  <Text style={styles.deal}>{discountLabel(offer)}</Text>
                  <Text style={styles.code}>{offer.code ? offer.code : 'AUTO APPLIED'}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>Uses {offer.usageCount}{offer.usageLimit ? ` / ${offer.usageLimit}` : ''}</Text>
                  <Text style={styles.meta}>Priority {offer.sortOrder}</Text>
                  <Text style={styles.meta}>Ends {formatAdminDate(offer.endsAt)}</Text>
                </View>
                <View style={styles.actions}>
                  <ActionButton disabled={busy || !canFeature} icon="popular" label={offer.isFeatured ? 'Unfeature' : 'Feature'} onPress={() => update.mutate({ id: offer.id, payload: { isFeatured: !offer.isFeatured } })} tone={offer.isFeatured ? 'warning' : 'info'} />
                  {canActivate ? <ActionButton disabled={busy} icon="check" label="Activate" onPress={() => update.mutate({ id: offer.id, payload: { status: 'ACTIVE' } })} tone="success" /> : null}
                  {canPause ? <ActionButton disabled={busy} icon="clock" label="Pause" onPress={() => update.mutate({ id: offer.id, payload: { status: 'PAUSED' } })} tone="warning" /> : null}
                  {offer.effectiveStatus !== 'ARCHIVED' ? <ActionButton disabled={busy} icon="delete" label="Archive" onPress={() => confirmArchive(offer)} tone="danger" /> : null}
                  {offer.isFeatured ? <ActionButton disabled={busy} icon="sort" label="Earlier" onPress={() => update.mutate({ id: offer.id, payload: { sortOrder: Math.max(0, offer.sortOrder - 10) } })} tone="muted" /> : null}
                </View>
              </View>;
            })}
            {offers.data.items.length === 0 ? <Text style={styles.empty}>No campaigns match these filters.</Text> : null}
          </View>
          <AdminPagination
            onPageChange={setPage}
            page={offers.data.pagination.page}
            total={offers.data.pagination.total}
            totalPages={offers.data.pagination.totalPages}
          />
        </> : null}
      </ScrollView>
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
  offerIcon: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  offerIconFeatured: { backgroundColor: '#FFF5DF' },
  offerIconText: { color: brand.colors.light.primary, fontSize: 18, fontWeight: '900' },
  copy: { flex: 1 },
  title: { color: brand.colors.light.ink, fontSize: 15, fontWeight: '900' },
  restaurant: { color: brand.colors.light.inkMuted, fontSize: 11, marginTop: 2 },
  dealRow: { alignItems: 'center', borderTopColor: brand.colors.light.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 11, paddingTop: 10 },
  deal: { color: brand.colors.light.mint, fontSize: 18, fontWeight: '900' },
  code: { color: brand.colors.light.primaryText, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  meta: { color: brand.colors.light.inkMuted, fontSize: 11, fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  empty: { color: brand.colors.light.inkMuted, fontSize: 14, paddingVertical: 30, textAlign: 'center' },
});
