import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import {
  OrderStatus,
  type OrderStatus as OrderStatusType,
} from '@food-delivery/types';

import { WasilLogo } from '@/components/wasil-brand';
import { AppIcon } from '@/components/wasil-icon-system';
import { OrderStatusChip } from '@/components/wasil-ui-components';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';

type OrderItem = {
  id: string;
  orderId: string;
  quantity: string;
  price: string;
};

type DriverOrder = {
  id: string;
  status: OrderStatusType;
  totalAmount: string;
  deliveryAddress: string;
  createdAt: string;
  restaurant?: { id: string; name: string };
  items?: OrderItem[];
};

function formatPrice(price: string) {
  const value = Number.parseFloat(price);
  return Number.isNaN(value) ? price : `$${value.toFixed(2)}`;
}

function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DriverHistoryScreen() {
  const {
    data: orders = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<DriverOrder[]>({
    queryKey: ['driver-orders-history'],
    queryFn: () =>
      api.get<DriverOrder[]>('/orders/mine').then((response) => response.data),
    refetchInterval: 20000,
  });

  const completed = orders.filter(
    (order) =>
      order.status === OrderStatus.DELIVERED ||
      order.status === OrderStatus.CANCELLED,
  );
  const active = orders.filter(
    (order) =>
      order.status === OrderStatus.READY ||
      order.status === OrderStatus.PICKED_UP,
  );

  const deliveredCount = completed.filter(
    (order) => order.status === OrderStatus.DELIVERED,
  ).length;

  return (
    <View style={styles.container}>
      <FlatList
        data={completed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => void refetch()}
            tintColor={brand.colors.light.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topBar}>
              <WasilLogo size={36} />
              <View style={styles.logBadge}>
                <AppIcon
                  color={brand.colors.light.primary}
                  name="orderHistory"
                  size="xs"
                />
                <Text style={styles.logBadgeText}>DELIVERY LOG</Text>
              </View>
            </View>

            <Text style={styles.overline}>YOUR RECORD</Text>
            <Text style={styles.title}>Delivery history</Text>
            <Text style={styles.subtitle}>
              Completed handoffs stay organized in one place.
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{deliveredCount}</Text>
                <Text style={styles.statLabel}>Delivered</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{active.length}</Text>
                <Text style={styles.statLabel}>Active now</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{orders.length}</Text>
                <Text style={styles.statLabel}>Assigned</Text>
              </View>
            </View>

            {active.length > 0 ? (
              <Pressable
                onPress={() => router.push('/(driver)/active')}
                style={styles.activeBanner}>
                <AppIcon
                  name="deliveryRider"
                  size="sm"
                  color={brand.colors.light.primary}
                />
                <Text style={styles.activeBannerText}>
                  {active.length} active delivery
                  {active.length === 1 ? '' : 's'} — open tasks
                </Text>
                <AppIcon
                  name="navigation"
                  size="sm"
                  color={brand.colors.light.primary}
                />
              </Pressable>
            ) : null}

            <Text style={styles.sectionTitle}>Completed</Text>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator
                color={brand.colors.light.primary}
                size="large"
              />
              <Text style={styles.emptyText}>Loading history…</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyOrbOuter}>
                <View style={styles.emptyOrbInner}>
                  <AppIcon
                    color={brand.colors.light.primary}
                    name="orderHistory"
                    size="xl"
                  />
                </View>
              </View>
              <Text style={styles.emptyTitle}>No completed deliveries</Text>
              <Text style={styles.emptyText}>
                When you finish a delivery, it will show up here with restaurant
                and address details.
              </Text>
              <Pressable
                onPress={() => router.replace('/(driver)')}
                style={styles.homeButton}>
                <Text style={styles.homeButtonText}>Go to dashboard</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.orderCard}>
            <View style={styles.orderTopRow}>
              <View style={styles.orderIdentity}>
                <View
                  style={[
                    styles.orderIcon,
                    item.status === OrderStatus.CANCELLED &&
                      styles.orderIconCancelled,
                  ]}>
                  <AppIcon
                    name={
                      item.status === OrderStatus.DELIVERED
                        ? 'orderCompleted'
                        : 'orderDetails'
                    }
                    size="md"
                    color={
                      item.status === OrderStatus.DELIVERED
                        ? brand.colors.light.mint
                        : brand.colors.light.danger
                    }
                  />
                </View>
                <View style={styles.orderCopy}>
                  <Text style={styles.restaurantName} numberOfLines={1}>
                    {item.restaurant?.name ?? 'Restaurant'}
                  </Text>
                  <Text style={styles.orderMeta}>
                    #{item.id.slice(0, 8)} · {formatOrderDate(item.createdAt)}
                  </Text>
                </View>
              </View>
              <OrderStatusChip compact status={item.status} />
            </View>

            <View style={styles.addressRow}>
              <AppIcon
                name="deliveryLocation"
                size="xs"
                color={brand.colors.light.inkMuted}
              />
              <Text numberOfLines={2} style={styles.address}>
                {item.deliveryAddress}
              </Text>
            </View>

            <View style={styles.cardFooter}>
              <Text style={styles.footerLabel}>Order total</Text>
              <Text style={styles.total}>{formatPrice(item.totalAmount)}</Text>
            </View>
          </View>
        )}
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
    paddingBottom: 28 + BottomTabInset,
  },
  header: {
    marginBottom: 8,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  logBadge: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  logBadgeText: {
    color: brand.colors.light.primaryText,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
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
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
    marginTop: 5,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flex: 1,
    padding: 12,
  },
  statValue: {
    color: brand.colors.light.primary,
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  activeBanner: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.medium,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  activeBannerText: {
    color: brand.colors.light.primaryText,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  orderCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    marginBottom: 12,
    padding: 15,
    ...brand.shadow,
  },
  orderTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderIdentity: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    marginRight: 8,
  },
  orderIcon: {
    alignItems: 'center',
    backgroundColor: `${brand.colors.light.mint}18`,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  orderIconCancelled: {
    backgroundColor: '#FEE2E2',
  },
  orderCopy: {
    flex: 1,
  },
  restaurantName: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  orderMeta: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    marginTop: 3,
  },
  addressRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 5,
    marginTop: 14,
  },
  address: {
    color: brand.colors.light.inkMuted,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  cardFooter: {
    alignItems: 'center',
    borderTopColor: brand.colors.light.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
  },
  footerLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  total: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    paddingHorizontal: 30,
    paddingVertical: 34,
    ...brand.shadow,
  },
  emptyOrbOuter: {
    alignItems: 'center',
    backgroundColor: `${brand.colors.light.primary}12`,
    borderRadius: 48,
    height: 96,
    justifyContent: 'center',
    width: 96,
  },
  emptyOrbInner: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 34,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  emptyTitle: {
    color: brand.colors.light.ink,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.35,
    marginTop: 18,
    textAlign: 'center',
  },
  emptyText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    textAlign: 'center',
  },
  homeButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: 14,
    marginTop: 18,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  homeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
});
