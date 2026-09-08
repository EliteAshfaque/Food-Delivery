import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useAuth } from '@/context/auth-context';
import { useDriverSocket } from '@/hooks/user-order.socket';
import { api } from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/api-error';
import { formatCurrency } from '@/lib/format';
import { OrderStatus, type OrderStatus as OrderStatusType } from '@food-delivery/types';

type DriverOrder = {
  id: string;
  status: OrderStatusType;
  totalAmount: string;
  deliveryAddress: string;
  restaurantId: string;
  createdAt: string;
  restaurant?: {
    id: string;
    name: string;
    address: string;
    imageUrl: string | null;
  };
};

export default function DriverHomeScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const firstName = user?.firstName?.trim() || 'there';
  const enter = (delay: number, duration = 340) =>
    reduceMotion ? undefined : FadeInDown.duration(duration).delay(delay);

  const {
    incomingOrder,
    clearIncomingOrder,
    revokedOffer,
    clearRevokedOffer,
  } = useDriverSocket(user?.id ?? null);
  const [dismissedIncomingOrderId, setDismissedIncomingOrderId] = useState<
    string | null
  >(null);

  const {
    data: status,
    error: statusError,
    isError: statusIsError,
    isLoading: statusLoading,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: ['driver-status'],
    queryFn: () =>
      api.get<{ isOnline: boolean }>('/driver/status').then((res) => res.data),
  });

  const {
    data: activeOrders = [],
    error: activeOrdersError,
    isError: activeOrdersIsError,
    isLoading: ordersLoading,
    refetch: refetchActive,
  } = useQuery<DriverOrder[]>({
    queryKey: ['driver-active-orders'],
    queryFn: () => api.get('/driver/orders/active').then((res) => res.data),
    refetchInterval: 10000,
  });

  // A driver can miss a socket event while the app is closed. Keep pending
  // offers server-backed so the driver can still accept or decline them after
  // reopening the app; otherwise that offer would reserve the driver forever.
  const {
    data: pendingOffers = [],
    error: pendingOffersError,
    isError: pendingOffersIsError,
    refetch: refetchPendingOffers,
  } = useQuery<DriverOrder[]>({
    queryKey: ['driver-pending-offers'],
    queryFn: () => api.get('/driver/orders/offers').then((res) => res.data),
    refetchInterval: 8000,
  });

  const { mutate: toggleOnline, isPending: togglingOnline } = useMutation({
    mutationFn: () =>
      api.patch<{ isOnline: boolean }>('/driver/online').then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-status'] });
    },
    onError: (error) => {
      Alert.alert('Could not update availability', getApiErrorMessage(error));
    },
  });

  const { mutate: declineOrder, isPending: declining } = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/driver/orders/${orderId}/decline`).then((res) => res.data),
    onSuccess: (_data, orderId) => {
      setDismissedIncomingOrderId(orderId);
      clearIncomingOrder();
      queryClient.invalidateQueries({ queryKey: ['driver-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['driver-pending-offers'] });
    },
    onError: (error) => {
      Alert.alert('Could not decline delivery', getApiErrorMessage(error));
    },
  });

  const { mutate: acceptOrder, isPending: accepting } = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/driver/orders/${orderId}/accept`).then((res) => res.data),
    onSuccess: () => {
      if (pendingOrder) setDismissedIncomingOrderId(pendingOrder.id);
      clearIncomingOrder();
      queryClient.invalidateQueries({ queryKey: ['driver-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['driver-pending-offers'] });
      router.push('/(driver)/active');
    },
    onError: (error) => {
      Alert.alert('Could not accept delivery', getApiErrorMessage(error));
      void refetchActive();
    },
  });

  useEffect(() => {
    if (!incomingOrder?.id) return;
    void refetchActive();
    void refetchPendingOffers();
  }, [incomingOrder, refetchActive, refetchPendingOffers]);

  // Operations can reassign an unanswered offer, or the driver can release it
  // by going offline. Drop the modal immediately instead of letting a stale
  // Accept action fail after the rider has already made a decision.
  useEffect(() => {
    if (!revokedOffer?.orderId) return;
    // useDriverSocket has already removed only the revoked offer. Do not mark
    // its id permanently dismissed here: dispatch may legitimately issue a
    // fresh lease for the same order to this rider after the timeout.
    clearRevokedOffer();
    void refetchActive();
    void refetchPendingOffers();
  }, [
    clearRevokedOffer,
    refetchActive,
    refetchPendingOffers,
    revokedOffer,
  ]);

  const socketOffer =
    incomingOrder?.id && incomingOrder.id !== dismissedIncomingOrderId
      ? (incomingOrder as unknown as DriverOrder)
      : null;
  const recoveredOffer = pendingOffers.find(
    (offer) => offer.id !== dismissedIncomingOrderId,
  );
  const pendingOrder = socketOffer ?? recoveredOffer ?? null;

  const isOnline = status?.isOnline ?? false;
  const activeOrder = activeOrders[0] ?? null;

  function handleAccept() {
    if (!pendingOrder) return;
    acceptOrder(pendingOrder.id);
  }

  function handleDecline() {
    if (!pendingOrder) return;
    Alert.alert('Decline delivery?', 'We will offer this order to another driver.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () => declineOrder(pendingOrder.id),
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={enter(30, 280)} style={styles.topBar}>
          <WasilLogo size={38} />
          <Pressable
            accessibilityRole="button"
            disabled={togglingOnline || statusLoading}
            onPress={() => toggleOnline()}
            style={[
              styles.availability,
              isOnline ? styles.availabilityOnline : styles.availabilityOffline,
            ]}>
            {togglingOnline ? (
              <ActivityIndicator size="small" color={brand.colors.light.mint} />
            ) : (
              <>
                <View
                  style={[
                    styles.availabilityDot,
                    !isOnline && styles.availabilityDotOffline,
                  ]}
                />
                <Text
                  style={[
                    styles.availabilityText,
                    !isOnline && styles.availabilityTextOffline,
                  ]}>
                  {isOnline ? 'Online' : 'Offline'}
                </Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        <Animated.View entering={enter(80, 310)}>
          <Text style={styles.overline}>DRIVER WORKSPACE</Text>
          <Text style={styles.greeting}>Good evening, {firstName}</Text>
          <Text style={styles.subheading}>
            {isOnline
              ? 'You are online — new deliveries will be offered to you.'
              : 'Go online to start receiving delivery requests.'}
          </Text>
        </Animated.View>

        <Animated.View entering={enter(140, 340)}>
          <View style={styles.routeCard}>
            <View style={styles.routeCardTop}>
              <View>
                <Text style={styles.routeEyebrow}>ACTIVE ROUTE</Text>
                <Text style={styles.routeTitle}>
                  {activeOrder
                    ? activeOrder.status === OrderStatus.PICKED_UP
                      ? 'On the way'
                      : 'Pickup ready'
                    : 'Your route is clear'}
                </Text>
              </View>
              <View style={styles.routeIcon}>
                <AppIcon
                  color={brand.colors.light.accent}
                  name="deliveryRider"
                  size="lg"
                />
              </View>
            </View>

            {ordersLoading ? (
              <ActivityIndicator color="#FFF8F4" style={{ marginTop: 20 }} />
            ) : activeOrder ? (
              <>
                <Text style={styles.routeCopy}>
                  {activeOrder.restaurant?.name
                    ? `Pickup from ${activeOrder.restaurant.name}`
                    : 'Restaurant pickup'}
                  {'\n'}
                  Deliver to {activeOrder.deliveryAddress}
                </Text>
                <Text style={styles.routeTotal}>
                  {formatCurrency(activeOrder.totalAmount)}
                </Text>
              </>
            ) : (
              <Text style={styles.routeCopy}>
                No delivery is assigned yet. When one arrives, the restaurant,
                customer address, and next action will appear here.
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(driver)/active')}
              style={({ pressed }) => [
                styles.routeButton,
                pressed && styles.pressed,
              ]}>
              <Text style={styles.routeButtonText}>
                {activeOrder ? 'Open delivery task' : 'View delivery tasks'}
              </Text>
              <AppIcon color="#FFF8F4" name="navigation" size="sm" />
            </Pressable>
          </View>
        </Animated.View>

        {!isOnline ? (
          <Animated.View entering={enter(200, 360)}>
            <Pressable
              onPress={() => toggleOnline()}
              disabled={togglingOnline}
              style={styles.goOnlineButton}>
              <Text style={styles.goOnlineText}>Go online</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {statusIsError || activeOrdersIsError || pendingOffersIsError ? (
          <RequestErrorState
            error={statusError ?? activeOrdersError ?? pendingOffersError}
            onRetry={() => {
              void refetchStatus();
              void refetchActive();
              void refetchPendingOffers();
            }}
            title="Some delivery information is unavailable"
          />
        ) : null}
      </ScrollView>

      <Modal visible={!!pendingOrder} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>NEW DELIVERY</Text>
            <Text style={styles.modalTitle}>Incoming order</Text>
            <Text style={styles.modalAddress}>
              {pendingOrder?.deliveryAddress ?? 'Delivery address'}
            </Text>
            <Text style={styles.modalTotal}>
              {pendingOrder ? formatCurrency(pendingOrder.totalAmount) : ''}
            </Text>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalButton, styles.modalDecline]}
                onPress={handleDecline}
                disabled={declining || accepting}>
                {declining ? (
                  <ActivityIndicator color="#DC2626" />
                ) : (
                  <Text style={styles.modalDeclineText}>Decline</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalAccept]}
                onPress={handleAccept}
                disabled={declining || accepting}>
                {accepting ? (
                  <ActivityIndicator color="#FFF8F4" />
                ) : (
                  <Text style={styles.modalAcceptText}>Accept</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 28 + BottomTabInset,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  availability: {
    alignItems: 'center',
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 96,
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  availabilityOnline: {
    backgroundColor: `${brand.colors.light.mint}14`,
    borderColor: `${brand.colors.light.mint}2B`,
  },
  availabilityOffline: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  availabilityDot: {
    backgroundColor: brand.colors.light.mint,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  availabilityDotOffline: {
    backgroundColor: '#9CA3AF',
  },
  availabilityText: {
    color: brand.colors.light.mint,
    fontSize: 12,
    fontWeight: '900',
  },
  availabilityTextOffline: {
    color: '#6B7280',
  },
  overline: {
    color: brand.colors.light.primaryText,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  greeting: {
    color: brand.colors.light.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subheading: {
    color: brand.colors.light.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
    marginTop: 5,
  },
  routeCard: {
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    overflow: 'hidden',
    padding: 20,
    ...brand.shadow,
  },
  routeCardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  routeEyebrow: {
    color: 'rgba(255,248,244,0.58)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  routeTitle: {
    color: '#FFF8F4',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.55,
    marginTop: 4,
  },
  routeIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,185,59,0.16)',
    borderColor: 'rgba(246,185,59,0.34)',
    borderRadius: 18,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  routeCopy: {
    color: 'rgba(255,248,244,0.74)',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 16,
    marginBottom: 12,
  },
  routeTotal: {
    color: brand.colors.light.accent,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 16,
  },
  routeButton: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primary,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  routeButtonText: {
    color: '#FFF8F4',
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }],
  },
  goOnlineButton: {
    marginTop: 16,
    backgroundColor: brand.colors.light.primary,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 16,
  },
  goOnlineText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalEyebrow: {
    color: brand.colors.light.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: brand.colors.light.ink,
    marginBottom: 8,
  },
  modalAddress: {
    fontSize: 15,
    color: brand.colors.light.inkMuted,
    lineHeight: 22,
    marginBottom: 12,
  },
  modalTotal: {
    fontSize: 22,
    fontWeight: '900',
    color: brand.colors.light.primary,
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    borderRadius: 14,
  },
  modalDecline: {
    backgroundColor: '#FEE2E2',
  },
  modalAccept: {
    backgroundColor: brand.colors.light.primary,
  },
  modalDeclineText: {
    color: '#DC2626',
    fontWeight: '900',
  },
  modalAcceptText: {
    color: '#fff',
    fontWeight: '900',
  },
});
