import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OrderStatus, type OrderStatus as OrderStatusType } from '@food-delivery/types';

import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/api-error';
import { formatCurrency } from '@/lib/format';
import { ActionButton, ActionReasonModal, AdminHeader, AdminPagination, FilterPill, formatAdminDate, StatusPill } from '@/features/admin/components';
import type { AdminOrder, Paginated } from '@/features/admin/types';

type OrderFilter = OrderStatusType | 'ALL';
const filters: { label: string; value: OrderFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Payment pending', value: OrderStatus.PENDING },
  { label: 'Confirmed', value: OrderStatus.CONFIRMED },
  { label: 'Preparing', value: OrderStatus.PREPARING },
  { label: 'Ready', value: OrderStatus.READY },
  { label: 'On delivery', value: OrderStatus.PICKED_UP },
  { label: 'Delivered', value: OrderStatus.DELIVERED },
  { label: 'Cancelled', value: OrderStatus.CANCELLED },
];

export default function AdminOrdersScreen() {
  const [filter, setFilter] = useState<OrderFilter>('ALL');
  const [page, setPage] = useState(1);
  const [cancelOrder, setCancelOrder] = useState<AdminOrder | null>(null);
  const queryClient = useQueryClient();
  const orders = useQuery<Paginated<AdminOrder>>({
    queryKey: ['admin-orders', filter, page],
    queryFn: () => api.get('/admin/orders', {
      params: { pageSize: 50, page, status: filter === 'ALL' ? undefined : filter },
    }).then((res) => res.data),
    refetchInterval: 15_000,
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/admin/orders/${id}/status`, { status: OrderStatus.CANCELLED, reason }).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (error) => Alert.alert('Could not cancel order', getApiErrorMessage(error)),
  });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={orders.isFetching} onRefresh={() => void orders.refetch()} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <AdminHeader eyebrow="LIVE OPERATIONS" title="Orders" subtitle="Monitor each order, resolve exceptions, and protect fulfilment quality." />
        <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
          {filters.map((item) => <FilterPill key={item.value} active={filter === item.value} label={item.label} onPress={() => {
            setFilter(item.value);
            setPage(1);
          }} />)}
        </ScrollView>
        {orders.isLoading ? <View style={styles.loading}><ActivityIndicator color={brand.colors.light.primary} size="large" /></View> : null}
        {orders.isError ? <RequestErrorState error={orders.error} onRetry={() => void orders.refetch()} title="Could not load order operations" /> : null}
        {orders.data ? <>
          <Text style={styles.resultText}>{orders.data.pagination.total} order{orders.data.pagination.total === 1 ? '' : 's'}</Text>
          <View style={styles.list}>
            {orders.data.items.map((order) => {
              const cancellationInProgress =
                order.status !== OrderStatus.CANCELLED &&
                Boolean(order.cancellationRequestedAt);
              const cancelable =
                order.status !== OrderStatus.CANCELLED &&
                order.status !== OrderStatus.DELIVERED &&
                !cancellationInProgress;
              const busy = cancel.isPending && cancel.variables?.id === order.id;
              return <View key={order.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.orderMark}><Text style={styles.orderMarkText}>#{order.id.slice(0, 5).toUpperCase()}</Text></View>
                  <View style={styles.orderCopy}>
                    <Text numberOfLines={1} style={styles.restaurant}>{order.restaurant?.name ?? 'Restaurant removed'}</Text>
                    <Text style={styles.date}>{formatAdminDate(order.createdAt)}</Text>
                  </View>
                  <StatusPill status={order.status} />
                </View>
                <View style={styles.moneyRow}>
                  <View><Text style={styles.moneyLabel}>TOTAL</Text><Text style={styles.total}>{formatCurrency(order.totalAmount)}</Text></View>
                  {Number(order.discountAmount ?? 0) > 0 ? <View style={styles.discountWrap}><Text style={styles.discountLabel}>OFFER SAVING</Text><Text style={styles.discount}>−{formatCurrency(order.discountAmount ?? '0')}</Text></View> : null}
                </View>
                <Text numberOfLines={2} style={styles.address}>{order.deliveryAddress}</Text>
                <View style={styles.peopleRow}>
                  <Text style={styles.person}>Customer · {order.customer ? `${order.customer.firstName} ${order.customer.lastName}` : 'Unknown'}</Text>
                  <Text style={styles.person}>Driver · {order.driver ? `${order.driver.firstName} ${order.driver.lastName}` : 'Unassigned'}</Text>
                </View>
                {cancellationInProgress ? <View style={styles.cancellationPending}><StatusPill status="CANCELLATION_IN_PROGRESS" /><Text style={styles.cancellationPendingText}>Cancellation and payment reversal are in progress. Do not retry this action.</Text></View> : null}
                {order.cancellationReason ? <Text style={styles.cancellationReason}>Cancellation note · {order.cancellationReason}</Text> : null}
                {cancelable ? <View style={styles.actions}><ActionButton disabled={busy} icon="cancelOrder" label="Cancel order" onPress={() => setCancelOrder(order)} tone="danger" /></View> : null}
              </View>;
            })}
            {orders.data.items.length === 0 ? <Text style={styles.empty}>No orders match these filters.</Text> : null}
          </View>
          <AdminPagination
            onPageChange={setPage}
            page={orders.data.pagination.page}
            total={orders.data.pagination.total}
            totalPages={orders.data.pagination.totalPages}
          />
        </> : null}
      </ScrollView>
      <ActionReasonModal
        confirmLabel="Cancel order"
        description={cancelOrder ? `Cancelling #${cancelOrder.id.slice(0, 8)} stops normal fulfilment and releases an unredeemed offer reservation. The system cancels an uncaptured payment intent or starts a Stripe refund for a successful payment.` : ''}
        onClose={() => setCancelOrder(null)}
        onConfirm={(reason) => {
          if (!cancelOrder) return;
          cancel.mutate({ id: cancelOrder.id, reason }, { onSuccess: () => setCancelOrder(null) });
        }}
        placeholder="Reason for operational cancellation"
        required
        submitting={cancel.isPending}
        title="Cancel this order?"
        visible={Boolean(cancelOrder)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { padding: 16, paddingBottom: 28 + BottomTabInset },
  filters: { gap: 8, paddingBottom: 16 },
  loading: { minHeight: 300, justifyContent: 'center' },
  resultText: { color: brand.colors.light.inkMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  list: { gap: 10 },
  card: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, padding: 14 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  orderMark: { alignItems: 'center', backgroundColor: brand.colors.light.ink, borderRadius: 11, height: 34, justifyContent: 'center', width: 52 },
  orderMarkText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  orderCopy: { flex: 1 },
  restaurant: { color: brand.colors.light.ink, fontSize: 15, fontWeight: '900' },
  date: { color: brand.colors.light.inkMuted, fontSize: 11, marginTop: 2 },
  moneyRow: { alignItems: 'flex-end', borderTopColor: brand.colors.light.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 11 },
  moneyLabel: { color: brand.colors.light.inkMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  total: { color: brand.colors.light.ink, fontSize: 18, fontWeight: '900', marginTop: 3 },
  discountWrap: { alignItems: 'flex-end' },
  discountLabel: { color: brand.colors.light.mint, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  discount: { color: brand.colors.light.mint, fontSize: 13, fontWeight: '900', marginTop: 3 },
  address: { color: brand.colors.light.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 11 },
  peopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  person: { color: brand.colors.light.inkMuted, fontSize: 11, fontWeight: '700' },
  cancellationPending: { alignItems: 'center', backgroundColor: '#FFF5DF', borderRadius: 9, flexDirection: 'row', gap: 8, marginTop: 11, padding: 9 },
  cancellationPendingText: { color: brand.colors.light.warning, flex: 1, fontSize: 11, fontWeight: '800', lineHeight: 16 },
  cancellationReason: { backgroundColor: brand.colors.light.surfaceMuted, borderRadius: 8, color: brand.colors.light.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 10, padding: 8 },
  actions: { marginTop: 12, alignItems: 'flex-start' },
  empty: { color: brand.colors.light.inkMuted, fontSize: 14, paddingVertical: 30, textAlign: 'center' },
});
