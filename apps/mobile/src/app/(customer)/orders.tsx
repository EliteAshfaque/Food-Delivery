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

import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { WasilLogo } from '@/components/wasil-brand';
import { AppIcon } from '@/components/wasil-icon-system';
import { OrderStatusChip } from '@/components/wasil-ui-components';

type OrderItem = {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: string;
  price: string;
};

type CustomerOrder = {
  id: string;
  restaurantId: string;
  status: OrderStatusType;
  totalAmount: string;
  deliveryAddress: string;
  createdAt: string;
  restaurant?: { id: string; name: string };
  items?: OrderItem[];
};

const statusRank: Record<OrderStatusType, number> = {
  [OrderStatus.PENDING]: 0,
  [OrderStatus.CONFIRMED]: 1,
  [OrderStatus.PREPARING]: 2,
  [OrderStatus.READY]: 3,
  [OrderStatus.PICKED_UP]: 4,
  [OrderStatus.DELIVERED]: 5,
  [OrderStatus.CANCELLED]: 6,
};

const terminalStatuses: readonly OrderStatusType[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

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

function itemCountLabel(items?: OrderItem[]) {
  if (!items?.length) return null;
  const count = items.reduce(
    (sum, item) => sum + (Number.parseFloat(item.quantity) || 0),
    0,
  );
  return `${count} item${count === 1 ? '' : 's'}`;
}

function sortOrders(orders: CustomerOrder[]) {
  return [...orders].sort((a, b) => {
    const aDone = terminalStatuses.includes(a.status);
    const bDone = terminalStatuses.includes(b.status);
    if (aDone !== bDone) return aDone ? 1 : -1;

    const rank = statusRank[a.status] - statusRank[b.status];
    return (
      rank || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
}

export default function CustomerOrdersScreen() {
  const {
    data: orders = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery<CustomerOrder[]>({
    queryKey: ['my-orders'],
    queryFn: () =>
      api.get<CustomerOrder[]>('/orders/mine').then((response) => response.data),
    refetchInterval: 15000,
  });

  const sortedOrders = sortOrders(orders);
  const activeCount = orders.filter(
    (order) => !terminalStatuses.includes(order.status),
  ).length;

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedOrders}
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
            <WasilLogo size={36} />
            <View style={styles.titleRow}>
              <View style={styles.titleCopy}>
                <Text style={styles.title}>Your orders</Text>
                <Text style={styles.subtitle}>
                  {activeCount > 0
                    ? `${activeCount} order${activeCount === 1 ? '' : 's'} in progress`
                    : 'Track every craving from here.'}
                </Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countText}>{orders.length}</Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}>
              <ActivityIndicator
                color={brand.colors.light.primary}
                size="large"
              />
              <Text style={styles.emptyText}>Loading your orders…</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <AppIcon
                  name="orderHistory"
                  size="xl"
                  color={brand.colors.light.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptyText}>
                Your next Wasil order will appear here.
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
          const itemsLabel = itemCountLabel(item.items);

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open order ${item.id.slice(0, 8)}`}
              onPress={() =>
                router.push({
                  pathname: '/(customer)/(index)/oder/[id]',
                  params: { id: item.id },
                })
              }
              style={({ pressed }) => [
                styles.orderCard,
                pressed && styles.pressed,
              ]}>
              <View style={styles.orderTopRow}>
                <View style={styles.orderIdentity}>
                  <View style={styles.orderIcon}>
                    <AppIcon
                      name="restaurant"
                      size="md"
                      color={brand.colors.light.primary}
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
                <Text numberOfLines={1} style={styles.address}>
                  {item.deliveryAddress}
                </Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.footerLeft}>
                  {item.status === OrderStatus.DELIVERED
                    ? 'Tap to rate your order'
                    : itemsLabel ?? 'View details'}
                </Text>
                <Text style={styles.total}>{formatPrice(item.totalAmount)}</Text>
                <AppIcon
                  name="navigation"
                  size="sm"
                  color={brand.colors.light.primary}
                />
              </View>
            </Pressable>
          );
        }}
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
    paddingBottom: 32 + BottomTabInset,
  },
  header: {
    marginBottom: 22,
  },
  titleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 22,
  },
  titleCopy: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 29,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    marginTop: 4,
  },
  countPill: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    height: 34,
    justifyContent: 'center',
    minWidth: 34,
    paddingHorizontal: 10,
  },
  countText: {
    color: brand.colors.light.primary,
    fontSize: 13,
    fontWeight: '900',
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
  pressed: {
    opacity: 0.74,
  },
  orderTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  orderIdentity: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 10,
    marginRight: 8,
  },
  orderIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    width: 44,
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
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    marginTop: 15,
  },
  address: {
    color: brand.colors.light.inkMuted,
    flex: 1,
    fontSize: 13,
  },
  cardFooter: {
    alignItems: 'center',
    borderTopColor: brand.colors.light.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 14,
    paddingTop: 12,
  },
  footerLeft: {
    color: brand.colors.light.inkMuted,
    flex: 1,
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
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 42,
  },
  emptyIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 32,
    height: 80,
    justifyContent: 'center',
    marginBottom: 14,
    width: 80,
  },
  emptyTitle: {
    color: brand.colors.light.ink,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyText: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  browseButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    marginTop: 20,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  browseButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
