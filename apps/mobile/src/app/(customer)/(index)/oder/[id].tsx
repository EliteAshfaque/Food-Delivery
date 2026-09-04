import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/axios';
import { usePaymentSheet } from '@/hooks/use-payment-sheet';
import type { MenuItem, OrderStatus, Restaurant } from '@food-delivery/types';

type OrderLineItem = {
  id: string;
  orderId: string;
  menuItemId: string;
  quantity: string;
  price: string;
};

type OrderDetail = {
  id: string;
  restaurantId: string;
  status: OrderStatus;
  totalAmount: string;
  deliveryAddress: string;
  createdAt: string;
  items: OrderLineItem[];
};

const STATUS_STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'PENDING', label: 'Payment' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'PICKED_UP', label: 'Picked up' },
  { key: 'DELIVERED', label: 'Delivered' },
];

function formatPrice(price: string | number) {
  const value = typeof price === 'number' ? price : Number.parseFloat(price);
  if (Number.isNaN(value)) return String(price);
  return `$${value.toFixed(2)}`;
}

function formatStatus(status: OrderStatus) {
  return status.replaceAll('_', ' ');
}

function statusStyle(status: OrderStatus) {
  switch (status) {
    case 'DELIVERED':
      return styles.statusDelivered;
    case 'CANCELLED':
      return styles.statusCancelled;
    case 'PENDING':
      return styles.statusPending;
    case 'CONFIRMED':
      return styles.statusConfirmed;
    default:
      return styles.statusActive;
  }
}

function getStatusIndex(status: OrderStatus) {
  if (status === 'CANCELLED') return -1;
  return STATUS_STEPS.findIndex((step) => step.key === status);
}

function getHeaderContent(status: OrderStatus) {
  switch (status) {
    case 'PENDING':
      return {
        emoji: '💳',
        title: 'Payment required',
        subtitle: 'Complete payment to confirm your order',
      };
    case 'CONFIRMED':
      return {
        emoji: '✅',
        title: 'Payment confirmed',
        subtitle: 'Your order has been sent to the restaurant',
      };
    case 'PREPARING':
      return {
        emoji: '👨‍🍳',
        title: 'Preparing your food',
        subtitle: 'The restaurant is working on your order',
      };
    case 'READY':
      return {
        emoji: '📦',
        title: 'Order is ready',
        subtitle: 'Waiting for driver pickup',
      };
    case 'PICKED_UP':
      return {
        emoji: '🛵',
        title: 'On the way',
        subtitle: 'Your driver is heading to you',
      };
    case 'DELIVERED':
      return {
        emoji: '🎉',
        title: 'Delivered',
        subtitle: 'Enjoy your meal!',
      };
    case 'CANCELLED':
      return {
        emoji: '❌',
        title: 'Order cancelled',
        subtitle: 'This order was cancelled',
      };
    default:
      return {
        emoji: '📋',
        title: 'Order details',
        subtitle: 'Track your order below',
      };
  }
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { initPaymentSheet, presentPaymentSheet, isSupported } = usePaymentSheet();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  const {
    data: order,
    isLoading,
    refetch,
  } = useQuery<OrderDetail | null>({
    queryKey: ['order', id],
    queryFn: () => api.get(`/orders/${id}`).then((res) => res.data),
    enabled: Boolean(id),
  });

  const { data: restaurant } = useQuery<Restaurant | null>({
    queryKey: ['restaurant', order?.restaurantId],
    queryFn: () => api.get(`/restaurants/${order!.restaurantId}`).then((res) => res.data),
    enabled: Boolean(order?.restaurantId),
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ['menu-items', order?.restaurantId],
    queryFn: () => api.get(`/menu/items/${order!.restaurantId}`).then((res) => res.data),
    enabled: Boolean(order?.restaurantId),
  });

  const handlePayment = useCallback(async () => {
    if (!order) return;

    if (!isSupported) {
      Alert.alert(
        'Use the mobile app',
        'Stripe payments only work on iOS/Android (not in the browser). Open the app in Expo Go or a development build.',
      );
      return;
    }

    setPaymentLoading(true);
    try {
      const { data } = await api.post<{ clientSecret: string }>('/payments/intent', {
        orderId: order.id,
      });

      if (!data.clientSecret) {
        Alert.alert('Payment error', 'Could not start payment. Please try again.');
        return;
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: restaurant?.name ?? 'Food Delivery',
        paymentIntentClientSecret: data.clientSecret,
        allowsDelayedPaymentMethods: false,
        returnURL: 'mobile://stripe-redirect',
      });

      if (initError) {
        Alert.alert('Payment error', initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message);
        }
        return;
      }

      setConfirmingPayment(true);

      // Payment sheet dismissed without error — webhook updates order async.
      // Poll up to 5 times with 1s delay until status is CONFIRMED.
      let confirmed = false;
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const { data: refreshed } = await refetch();
        if (refreshed?.status === 'CONFIRMED') {
          confirmed = true;
          break;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['order', id] });

      if (confirmed) {
        Alert.alert('Payment successful', 'Your order is confirmed!');
      } else {
        Alert.alert(
          'Payment received',
          'Your payment went through. Order confirmation may take a moment.',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong';
      Alert.alert('Payment error', message);
    } finally {
      setPaymentLoading(false);
      setConfirmingPayment(false);
    }
  }, [
    order,
    isSupported,
    restaurant?.name,
    initPaymentSheet,
    presentPaymentSheet,
    queryClient,
    id,
    refetch,
  ]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Order not found</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const header = getHeaderContent(order.status);
  const currentStep = getStatusIndex(order.status);
  const isPending = order.status === 'PENDING';
  const isCancelled = order.status === 'CANCELLED';
  const isBusy = paymentLoading || confirmingPayment;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <View style={styles.successCard}>
          <Text style={styles.successEmoji}>{header.emoji}</Text>
          <Text style={styles.title}>{header.title}</Text>
          <Text style={styles.subtitle}>{header.subtitle}</Text>
        </View>

        {!isCancelled ? (
          <View style={styles.timelineCard}>
            <Text style={styles.timelineTitle}>Order progress</Text>
            {STATUS_STEPS.map((step, index) => {
              const done = currentStep >= index;
              const active = currentStep === index;
              return (
                <View key={step.key} style={styles.timelineRow}>
                  <View
                    style={[
                      styles.timelineDot,
                      done && styles.timelineDotDone,
                      active && styles.timelineDotActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.timelineLabel,
                      done && styles.timelineLabelDone,
                      active && styles.timelineLabelActive,
                    ]}>
                    {step.label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {isPending ? (
          <View style={styles.paymentCard}>
            <Text style={styles.paymentTitle}>Secure checkout</Text>
            <Text style={styles.paymentText}>
              Pay {formatPrice(order.totalAmount)} securely with Stripe to confirm your order.
            </Text>
            <View style={styles.paymentFeatures}>
              <Text style={styles.paymentFeature}>🔒 Encrypted payment</Text>
              <Text style={styles.paymentFeature}>💳 Card, Apple Pay & Google Pay</Text>
            </View>
            <Pressable
              style={[styles.payButton, isBusy && styles.buttonDisabled]}
              onPress={() => void handlePayment()}
              disabled={isBusy}>
              {isBusy ? (
                <View style={styles.payButtonContent}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.payButtonText}>
                    {confirmingPayment ? 'Confirming...' : 'Opening payment...'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.payButtonText}>
                  Pay {formatPrice(order.totalAmount)}
                </Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Order ID</Text>
            <Text style={styles.value}>{order.id.slice(0, 8)}...</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <View style={[styles.statusBadge, statusStyle(order.status)]}>
              <Text style={styles.statusText}>{formatStatus(order.status)}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Restaurant</Text>
            <Text style={styles.value}>{restaurant?.name ?? 'Loading...'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Delivery</Text>
            <Text style={[styles.value, styles.address]}>{order.deliveryAddress}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Items</Text>
        {order.items.map((item) => {
          const menuItem = menuItems.find((m) => m.id === item.menuItemId);
          const lineTotal = parseFloat(item.price) * parseFloat(item.quantity);
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemBody}>
                <Text style={styles.itemName}>{menuItem?.name ?? 'Menu item'}</Text>
                <Text style={styles.itemMeta}>
                  {item.quantity} x {formatPrice(item.price)}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{formatPrice(lineTotal)}</Text>
            </View>
          );
        })}

        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>
            {isPending ? 'Total due' : 'Total paid'}
          </Text>
          <Text style={styles.totalValue}>{formatPrice(order.totalAmount)}</Text>
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.replace('/(customer)/(index)')}>
          <Text style={styles.secondaryButtonText}>Back to home</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  back: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 16,
    color: '#FF6B35',
    fontWeight: '600',
  },
  successCard: {
    backgroundColor: '#FFF4EF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD4C2',
  },
  successEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  timelineCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E5E5',
  },
  timelineDotDone: {
    backgroundColor: '#FF6B35',
  },
  timelineDotActive: {
    backgroundColor: '#FF6B35',
    borderWidth: 3,
    borderColor: '#FFD4C2',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  timelineLabel: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  timelineLabelDone: {
    color: '#444',
  },
  timelineLabelActive: {
    color: '#FF6B35',
    fontWeight: '700',
  },
  paymentCard: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  paymentTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  paymentText: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
    marginBottom: 12,
  },
  paymentFeatures: {
    gap: 6,
    marginBottom: 16,
  },
  paymentFeature: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  payButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  payButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  row: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 15,
    color: '#111',
    fontWeight: '600',
  },
  address: {
    lineHeight: 20,
    fontWeight: '500',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusPending: {
    backgroundColor: '#FEF3C7',
  },
  statusConfirmed: {
    backgroundColor: '#DCFCE7',
  },
  statusActive: {
    backgroundColor: '#DBEAFE',
  },
  statusDelivered: {
    backgroundColor: '#DCFCE7',
  },
  statusCancelled: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 10,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemBody: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 13,
    color: '#666',
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FF6B35',
  },
  totalCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 6,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
  },
  primaryButton: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  secondaryButtonText: {
    color: '#FF6B35',
      fontSize: 16,
    fontWeight: '700',
  },
});
