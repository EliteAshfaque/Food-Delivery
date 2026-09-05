import { useMemo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, {
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';

import { WasilLogo } from '@/components/wasil-brand';
import { AppIcon } from '@/components/wasil-icon-system';
import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { formatCurrency } from '@/lib/format';
import {
  OrderStatus,
  type OrderStatus as OrderStatusType,
  type Restaurant,
} from '@food-delivery/types';

type OwnerOrder = {
  id: string;
  status: OrderStatusType;
  totalAmount: string;
  deliveryAddress: string;
  createdAt: string;
  restaurant?: { id: string; name: string };
};

const STATUS_META: {
  key: OrderStatusType;
  label: string;
  color: string;
  soft: string;
}[] = [
  {
    key: OrderStatus.PENDING,
    label: 'Pending',
    color: '#C77A00',
    soft: '#FFF6E5',
  },
  {
    key: OrderStatus.CONFIRMED,
    label: 'Confirmed',
    color: brand.colors.light.mint,
    soft: `${brand.colors.light.mint}18`,
  },
  {
    key: OrderStatus.PREPARING,
    label: 'Preparing',
    color: brand.colors.light.accent,
    soft: '#FFF8E8',
  },
  {
    key: OrderStatus.READY,
    label: 'Ready',
    color: '#2F6FED',
    soft: '#EAF1FF',
  },
  {
    key: OrderStatus.PICKED_UP,
    label: 'Picked up',
    color: brand.colors.light.primary,
    soft: brand.colors.light.primarySoft,
  },
  {
    key: OrderStatus.DELIVERED,
    label: 'Delivered',
    color: brand.colors.light.mint,
    soft: `${brand.colors.light.mint}18`,
  },
  {
    key: OrderStatus.CANCELLED,
    label: 'Cancelled',
    color: brand.colors.light.danger,
    soft: '#FDECEC',
  },
];

function parseAmount(value: string) {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

function isSameDay(iso: string, now = new Date()) {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function buildAnalytics(orders: OwnerOrder[]) {
  const totalOrders = orders.length;
  const revenue = orders
    .filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.PENDING)
    .reduce((sum, o) => sum + parseAmount(o.totalAmount), 0);

  const delivered = orders.filter((o) => o.status === OrderStatus.DELIVERED);
  const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED);
  const active = orders.filter(
    (o) =>
      o.status === OrderStatus.CONFIRMED ||
      o.status === OrderStatus.PREPARING ||
      o.status === OrderStatus.READY ||
      o.status === OrderStatus.PICKED_UP,
  );

  const todayOrders = orders.filter((o) => isSameDay(o.createdAt));
  const todayRevenue = todayOrders
    .filter((o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.PENDING)
    .reduce((sum, o) => sum + parseAmount(o.totalAmount), 0);

  const paidOrders = orders.filter(
    (o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.PENDING,
  );
  const avgOrder =
    paidOrders.length > 0
      ? paidOrders.reduce((sum, o) => sum + parseAmount(o.totalAmount), 0) /
        paidOrders.length
      : 0;

  const statusCounts = STATUS_META.map((meta) => ({
    ...meta,
    count: orders.filter((o) => o.status === meta.key).length,
  })).filter((row) => row.count > 0);

  const maxStatus = Math.max(...statusCounts.map((s) => s.count), 1);

  const completionRate =
    totalOrders > 0 ? Math.round((delivered.length / totalOrders) * 100) : 0;

  return {
    totalOrders,
    revenue,
    delivered: delivered.length,
    cancelled: cancelled.length,
    active: active.length,
    todayOrders: todayOrders.length,
    todayRevenue,
    avgOrder,
    statusCounts,
    maxStatus,
    completionRate,
  };
}

export default function OwnerAnalyticsScreen() {
  const reduceMotion = useReducedMotion();
  const enter = (delay: number, duration = 340) =>
    reduceMotion ? undefined : FadeInDown.duration(duration).delay(delay);

  const {
    data: restaurant,
    error: restaurantError,
    isError: restaurantIsError,
    isLoading: restaurantLoading,
    refetch: refetchRestaurant,
  } = useQuery<Restaurant | null>({
    queryKey: ['my-restaurants'],
    queryFn: () => api.get('/restaurants/mine').then((res) => res.data),
  });

  const {
    data: orders = [],
    error: ordersError,
    isError: ordersIsError,
    isLoading: ordersLoading,
    isFetching,
    refetch,
  } = useQuery<OwnerOrder[]>({
    queryKey: ['restaurant-orders-analytics', restaurant?.id],
    queryFn: () =>
      api
        .get<OwnerOrder[]>(`/orders/restaurant/${restaurant!.id}`)
        .then((res) => res.data),
    enabled: !!restaurant?.id,
    refetchInterval: 20000,
  });

  const stats = useMemo(() => buildAnalytics(orders), [orders]);
  const loading = restaurantLoading || (ordersLoading && !!restaurant?.id);
  const requestError = restaurantError ?? ordersError;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !loading}
            onRefresh={() => void refetch()}
            tintColor={brand.colors.light.primary}
          />
        }>
        <Animated.View entering={enter(20, 280)} style={styles.topBar}>
          <WasilLogo size={36} />
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </Animated.View>

        <Animated.View entering={enter(70, 310)}>
          <Text style={styles.overline}>RESTAURANT INSIGHTS</Text>
          <Text style={styles.title}>Analytics</Text>
          <Text style={styles.subtitle}>
            {restaurant?.name
              ? `Order performance for ${restaurant.name}`
              : 'Order performance at a glance'}
          </Text>
        </Animated.View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color={brand.colors.light.primary} />
          </View>
        ) : restaurantIsError || ordersIsError ? (
          <RequestErrorState
            error={requestError}
            onRetry={() => {
              void refetchRestaurant();
              void refetch();
            }}
            title="Couldn’t load analytics"
          />
        ) : !restaurant ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No restaurant yet</Text>
            <Text style={styles.emptyText}>
              Create your restaurant to unlock order analytics.
            </Text>
            <Pressable
              style={styles.emptyButton}
              onPress={() =>
                router.push('/(owner)/(index)/create-restaurant')
              }>
              <Text style={styles.emptyButtonText}>Create restaurant</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Animated.View entering={enter(120, 340)}>
              <View style={styles.heroCard}>
                <View style={styles.heroGlow} />
                <Text style={styles.heroEyebrow}>TOTAL REVENUE</Text>
                <Text style={styles.heroValue}>{formatCurrency(stats.revenue)}</Text>
                <Text style={styles.heroHint}>
                  From confirmed & completed orders
                </Text>

                <View style={styles.heroStats}>
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{stats.totalOrders}</Text>
                    <Text style={styles.heroStatLabel}>Orders</Text>
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>
                      {formatCurrency(stats.avgOrder)}
                    </Text>
                    <Text style={styles.heroStatLabel}>Avg order</Text>
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>
                      {stats.completionRate}%
                    </Text>
                    <Text style={styles.heroStatLabel}>Delivered</Text>
                  </View>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={enter(170, 360)}>
              <View style={styles.todayRow}>
                <View style={styles.todayCard}>
                  <View style={styles.todayIcon}>
                    <AppIcon
                      name="orderDetails"
                      size="sm"
                      color={brand.colors.light.primary}
                    />
                  </View>
                  <Text style={styles.todayValue}>{stats.todayOrders}</Text>
                  <Text style={styles.todayLabel}>Today’s orders</Text>
                </View>
                <View style={styles.todayCard}>
                  <View style={[styles.todayIcon, styles.todayIconMint]}>
                    <AppIcon
                      name="wallet"
                      size="sm"
                      color={brand.colors.light.mint}
                    />
                  </View>
                  <Text style={styles.todayValue}>
                    {formatCurrency(stats.todayRevenue)}
                  </Text>
                  <Text style={styles.todayLabel}>Today’s sales</Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={enter(210, 380)}>
              <Text style={styles.sectionTitle}>Kitchen pulse</Text>
              <View style={styles.pulseRow}>
                <View style={[styles.pulseCard, styles.pulseActive]}>
                  <Text style={styles.pulseValue}>{stats.active}</Text>
                  <Text style={styles.pulseLabel}>Active</Text>
                </View>
                <View style={[styles.pulseCard, styles.pulseDelivered]}>
                  <Text style={styles.pulseValue}>{stats.delivered}</Text>
                  <Text style={styles.pulseLabel}>Delivered</Text>
                </View>
                <View style={[styles.pulseCard, styles.pulseCancelled]}>
                  <Text style={styles.pulseValue}>{stats.cancelled}</Text>
                  <Text style={styles.pulseLabel}>Cancelled</Text>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={enter(250, 400)}>
              <Text style={styles.sectionTitle}>Orders by status</Text>
              <View style={styles.breakdownCard}>
                {stats.statusCounts.length === 0 ? (
                  <Text style={styles.breakdownEmpty}>
                    No orders yet — analytics will fill in as customers order.
                  </Text>
                ) : (
                  stats.statusCounts.map((row) => (
                    <View key={row.key} style={styles.breakdownRow}>
                      <View style={styles.breakdownMeta}>
                        <View
                          style={[
                            styles.breakdownDot,
                            { backgroundColor: row.color },
                          ]}
                        />
                        <Text style={styles.breakdownLabel}>{row.label}</Text>
                        <Text style={styles.breakdownCount}>{row.count}</Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: row.color,
                              width: `${Math.max(
                                (row.count / stats.maxStatus) * 100,
                                8,
                              )}%`,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Animated.View>

            <Animated.View entering={enter(290, 420)}>
              <Pressable
                onPress={() => router.replace('/(owner)/(index)')}
                style={({ pressed }) => [
                  styles.cta,
                  pressed && styles.pressed,
                ]}>
                <AppIcon
                  name="orderReady"
                  size="sm"
                  color="#FFF8F4"
                />
                <Text style={styles.ctaText}>Manage live orders</Text>
              </Pressable>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: brand.colors.light.canvas,
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32 + BottomTabInset,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  liveBadge: {
    alignItems: 'center',
    backgroundColor: `${brand.colors.light.mint}14`,
    borderColor: `${brand.colors.light.mint}2B`,
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  liveDot: {
    backgroundColor: brand.colors.light.mint,
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  liveText: {
    color: brand.colors.light.mint,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  overline: {
    color: brand.colors.light.primaryText,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.9,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
    marginTop: 6,
  },
  loading: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    color: brand.colors.light.ink,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  emptyText: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: 14,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  heroCard: {
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    overflow: 'hidden',
    padding: 22,
    marginBottom: 14,
    ...brand.shadow,
  },
  heroGlow: {
    position: 'absolute',
    right: -60,
    top: -80,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(242,85,44,0.22)',
  },
  heroEyebrow: {
    color: 'rgba(255,248,244,0.55)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
  },
  heroValue: {
    color: '#FFF8F4',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.2,
    marginTop: 8,
  },
  heroHint: {
    color: 'rgba(255,248,244,0.62)',
    fontSize: 13,
    marginTop: 4,
    marginBottom: 20,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,248,244,0.08)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  heroStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroStatValue: {
    color: '#FFF8F4',
    fontSize: 16,
    fontWeight: '900',
  },
  heroStatLabel: {
    color: 'rgba(255,248,244,0.55)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  heroDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,248,244,0.12)',
  },
  todayRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  todayCard: {
    flex: 1,
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    padding: 16,
  },
  todayIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
    marginBottom: 12,
  },
  todayIconMint: {
    backgroundColor: `${brand.colors.light.mint}18`,
  },
  todayValue: {
    color: brand.colors.light.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  todayLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  sectionTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  pulseRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 22,
  },
  pulseCard: {
    flex: 1,
    borderRadius: brand.radius.medium,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  pulseActive: {
    backgroundColor: brand.colors.light.primarySoft,
  },
  pulseDelivered: {
    backgroundColor: `${brand.colors.light.mint}14`,
  },
  pulseCancelled: {
    backgroundColor: '#FDECEC',
  },
  pulseValue: {
    color: brand.colors.light.ink,
    fontSize: 24,
    fontWeight: '900',
  },
  pulseLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 4,
  },
  breakdownCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  breakdownEmpty: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    paddingVertical: 12,
  },
  breakdownRow: {
    marginBottom: 14,
  },
  breakdownMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  breakdownDot: {
    borderRadius: 4,
    height: 8,
    marginRight: 8,
    width: 8,
  },
  breakdownLabel: {
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  breakdownCount: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  barTrack: {
    backgroundColor: brand.colors.light.surfaceMuted,
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  barFill: {
    borderRadius: 999,
    height: 8,
  },
  cta: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primary,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 54,
  },
  ctaText: {
    color: '#FFF8F4',
    fontSize: 15,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
});
