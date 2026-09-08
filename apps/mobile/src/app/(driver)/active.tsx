import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { io, type Socket } from 'socket.io-client';
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
import { useOrderSocket } from '@/hooks/user-order.socket';
import { getServerUrl } from '@/lib/api-config';
import { getApiErrorMessage } from '@/lib/api-error';
import { api } from '@/lib/axios';
import { formatCurrency } from '@/lib/format';
import { OrderStatus, type OrderStatus as OrderStatusType } from '@food-delivery/types';
import { getToken } from '../../../lib/auth';

type DriverOrder = {
  id: string;
  status: OrderStatusType;
  totalAmount: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  restaurantId: string;
  createdAt: string;
  restaurant?: {
    id: string;
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
    imageUrl: string | null;
  };
};

type LiveCoords = {
  latitude: number;
  longitude: number;
};

function formatStatus(status: OrderStatusType) {
  return status.replaceAll('_', ' ');
}

function openMaps({
  address,
  latitude,
  longitude,
}: {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  const destination =
    latitude != null && longitude != null ? `${latitude},${longitude}` : address;
  const encoded = encodeURIComponent(destination);
  const url =
    Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${encoded}`
      : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  void Linking.openURL(url).catch(() =>
    Alert.alert(
      'Navigation unavailable',
      'We could not open your maps app. Please try again.',
    ),
  );
}

export default function DriverActiveScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const enter = (delay: number, duration = 340) =>
    reduceMotion ? undefined : FadeInDown.duration(duration).delay(delay);

  const socketRef = useRef<Socket | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const lastInterventionNoticeRef = useRef<string | null>(null);
  const [isTrackingReady, setTrackingReady] = useState(false);
  const [sharingOrderId, setSharingOrderId] = useState<string | null>(null);
  const [liveCoords, setLiveCoords] = useState<LiveCoords | null>(null);

  function stopNativeTracking() {
    locationWatchRef.current?.remove();
    socketRef.current?.disconnect();
    locationWatchRef.current = null;
    socketRef.current = null;
  }

  const {
    data: activeOrders = [],
    error: activeOrdersError,
    isError: activeOrdersIsError,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<DriverOrder[]>({
    queryKey: ['driver-active-orders'],
    queryFn: () => api.get('/driver/orders/active').then((res) => res.data),
    refetchInterval: 8000,
  });
  const order = activeOrders[0] ?? null;
  const activeOrderUpdate = useOrderSocket(order?.id ?? null);

  // Polling remains the offline fallback, but cancellation or an operations
  // reassignment must remove the old task immediately while the driver is in
  // the active-delivery screen.
  useEffect(() => {
    if (!activeOrderUpdate?.id) return;
    const nextStatus =
      typeof activeOrderUpdate.status === 'string'
        ? activeOrderUpdate.status
        : undefined;
    const nextDriverId =
      typeof activeOrderUpdate.driverId === 'string'
        ? activeOrderUpdate.driverId
        : null;
    const assignmentWasRemoved =
      nextStatus === OrderStatus.CANCELLED || nextDriverId !== user?.id;
    const noticeKey = `${activeOrderUpdate.id}:${nextStatus ?? ''}:${nextDriverId ?? ''}`;
    if (assignmentWasRemoved && lastInterventionNoticeRef.current !== noticeKey) {
      lastInterventionNoticeRef.current = noticeKey;
      Alert.alert(
        'Delivery updated',
        nextStatus === OrderStatus.CANCELLED
          ? 'This order was cancelled, so the delivery task has been closed.'
          : 'This delivery is no longer assigned to you.',
      );
    }
    queryClient.invalidateQueries({ queryKey: ['driver-active-orders'] });
    queryClient.invalidateQueries({ queryKey: ['driver-orders'] });
  }, [activeOrderUpdate, queryClient, user?.id]);

  const {
    mutate: updateStatus,
    isPending: updating,
    variables: updatingVars,
  } = useMutation({
    mutationFn: ({
      orderId,
      status,
    }: {
      orderId: string;
      status: OrderStatusType;
    }) =>
      api.patch(`/orders/${orderId}/status`, { status }).then((res) => res.data),
    onSuccess: (_data, vars) => {
      if (vars.status === OrderStatus.DELIVERED) {
        setSharingOrderId(null);
        setTrackingReady(false);
        setLiveCoords(null);
        stopNativeTracking();
      }
      queryClient.invalidateQueries({ queryKey: ['driver-active-orders'] });
      queryClient.invalidateQueries({ queryKey: ['driver-orders'] });
    },
    onError: (error) => {
      Alert.alert('Could not update delivery', getApiErrorMessage(error));
    },
  });

  const busy = updating;
  const isEnRoute = order?.status === OrderStatus.PICKED_UP;
  const isOnActiveRoute =
    order?.status === OrderStatus.READY ||
    order?.status === OrderStatus.PICKED_UP;
  // Location-sharing permission is intentionally bound to one delivery. A
  // completed or replaced order cannot silently carry this choice forward.
  const sharingEnabled = Boolean(
    isOnActiveRoute && order?.id && sharingOrderId === order.id,
  );
  const isSharing = sharingEnabled && isTrackingReady;

  useEffect(() => {
    let cancelled = false;

    if (!sharingEnabled || !order || !user?.id) {
      stopNativeTracking();
      return () => {
        cancelled = true;
        stopNativeTracking();
      };
    }
    const driverId = user.id;

    async function beginTracking() {
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) {
            setSharingOrderId(null);
            setTrackingReady(false);
            Alert.alert('Sign in required', 'Sign in again before sharing your location.');
          }
          return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status !== 'granted') {
          setSharingOrderId(null);
          setTrackingReady(false);
          Alert.alert(
            'Permission needed',
            'Allow location access to share your position during this delivery.',
          );
          return;
        }

        stopNativeTracking();

        const socket = io(`${getServerUrl()}/orders`, {
          auth: { token },
          transports: ['websocket'],
        });
        socketRef.current = socket;
        let socketReady = false;
        let watchStarted = false;

        const startLocationWatch = async () => {
          if (cancelled || watchStarted) return;
          watchStarted = true;

          const watch = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 3000,
              distanceInterval: 10,
            },
            (location) => {
              const coords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              };
              setLiveCoords(coords);
              // Do not queue a GPS update before the server has finished
              // authenticating this socket (or while it is reconnecting).
              if (!socketReady) return;
              socketRef.current?.emit('driver:location', {
                driverId,
                orderId: order.id,
                restaurantId: order.restaurantId,
                ...coords,
              });
            },
          );

          if (cancelled) {
            watch.remove();
            return;
          }

          locationWatchRef.current = watch;
          setTrackingReady(true);
        };

        socket.on('connect_error', () => {
          if (cancelled) return;
          setSharingOrderId(null);
          setTrackingReady(false);
          setLiveCoords(null);
          stopNativeTracking();
          Alert.alert(
            'Live location unavailable',
            'We could not start secure location sharing. Check your connection and try again.',
          );
        });
        socket.on('disconnect', () => {
          socketReady = false;
          if (!cancelled) setTrackingReady(false);
        });
        socket.on('socket:ready', () => {
          socketReady = true;
          void startLocationWatch().catch((error) => {
            if (cancelled) return;
            stopNativeTracking();
            setSharingOrderId(null);
            setTrackingReady(false);
            setLiveCoords(null);
            Alert.alert(
              'Live location unavailable',
              getApiErrorMessage(
                error,
                'We could not start location sharing. Check your location settings and try again.',
              ),
            );
          });
        });
        socket.on(
          'driver:location:error',
          (event: { code?: string }) => {
            if (cancelled) return;
            setSharingOrderId(null);
            setTrackingReady(false);
            setLiveCoords(null);
            stopNativeTracking();
            const message =
              event.code === 'LOCATION_NOT_ALLOWED'
                ? 'This delivery is no longer active, so location sharing has stopped.'
                : 'We could not share your location. Please try again.';
            Alert.alert('Live location paused', message);
          },
        );
      } catch (error) {
        if (cancelled) return;
        stopNativeTracking();
        setSharingOrderId(null);
        setTrackingReady(false);
        setLiveCoords(null);
        Alert.alert(
          'Live location unavailable',
          getApiErrorMessage(
            error,
            'We could not start location sharing. Check your location settings and try again.',
          ),
        );
      }
    }

    void beginTracking();

    return () => {
      cancelled = true;
      stopNativeTracking();
    };
    // Tracking must restart only when the delivery or deliberate sharing
    // choice changes. The socket and location subscription are external
    // systems owned by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.restaurantId, sharingEnabled, user?.id]);

  function nextAction(
    status: OrderStatusType,
  ): { label: string; status: OrderStatusType } | null {
    if (status === OrderStatus.READY) {
      return { label: 'Confirm pickup', status: OrderStatus.PICKED_UP };
    }
    if (status === OrderStatus.PICKED_UP) {
      return { label: 'Mark delivered', status: OrderStatus.DELIVERED };
    }
    return null;
  }

  const action = order ? nextAction(order.status) : null;

  function handleStatusAction(
    orderId: string,
    nextStatus: OrderStatusType,
  ) {
    if (nextStatus !== OrderStatus.DELIVERED) {
      updateStatus({ orderId, status: nextStatus });
      return;
    }

    Alert.alert(
      'Mark as delivered?',
      'Only confirm after the customer has received the order.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark delivered',
          onPress: () => updateStatus({ orderId, status: nextStatus }),
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={enter(30, 280)} style={styles.topBar}>
          <WasilLogo size={36} />
          <View style={styles.tasksBadge}>
            <Text style={styles.tasksBadgeText}>
              {isFetching && !isLoading
                ? 'UPDATING'
                : isSharing
                  ? 'LIVE'
                  : 'TASKS'}
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={enter(80, 310)}>
          <Text style={styles.overline}>ACTIVE DELIVERY</Text>
          <Text style={styles.title}>
            {order
              ? isEnRoute
                ? 'Heading to customer'
                : 'Pickup ready'
              : 'Your next route'}
          </Text>
          <Text style={styles.subtitle}>
            {order
              ? isEnRoute
                ? sharingEnabled
                  ? 'Your live location is shared with the customer until delivery.'
                  : 'Choose whether to share your live location with the customer.'
                : sharingEnabled
                  ? 'Your live GPS is shared while you head to the restaurant.'
                  : 'Navigate to the restaurant, then choose whether to share live GPS.'
              : 'Stay online on Home. Ready orders land here for you.'}
          </Text>
        </Animated.View>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={brand.colors.light.primary} />
          </View>
        ) : activeOrdersIsError ? (
          <RequestErrorState
            error={activeOrdersError}
            onRetry={() => void refetch()}
            title="Couldn’t load your active delivery"
          />
        ) : !order ? (
          <Animated.View entering={enter(140, 340)}>
            <View style={styles.routeCanvas}>
              <AppIcon color="#FFF8F4" name="scooter" size="lg" />
              <Text style={styles.canvasTitle}>No active delivery</Text>
              <Text style={styles.canvasCopy}>
                When a restaurant marks an order ready, it will be offered to you
                here.
              </Text>
              <Pressable
                style={styles.refreshButton}
                onPress={() => void refetch()}>
                <Text style={styles.refreshButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : (
          <Animated.View entering={enter(140, 340)} style={styles.stack}>
            {/* Trip progress — Talabat-style stages */}
            <View style={styles.progressCard}>
              <View style={styles.progressStep}>
                <View
                  style={[
                    styles.progressDot,
                    order.status !== OrderStatus.READY && styles.progressDotDone,
                  ]}
                />
                <Text style={styles.progressLabel}>Pickup</Text>
              </View>
              <View
                style={[
                  styles.progressLine,
                  isEnRoute && styles.progressLineActive,
                ]}
              />
              <View style={styles.progressStep}>
                <View
                  style={[
                    styles.progressDot,
                    isEnRoute && styles.progressDotActive,
                  ]}
                />
                <Text style={styles.progressLabel}>Deliver</Text>
              </View>
            </View>

            {isOnActiveRoute ? (
              <View style={styles.liveCard}>
                <View style={styles.liveHeader}>
                  <View style={styles.livePulse}>
                    <View style={styles.livePulseInner} />
                  </View>
                  <View style={styles.liveCopy}>
                    <Text style={styles.liveTitle}>
                      {isSharing
                        ? isEnRoute
                          ? 'Sharing live location'
                          : 'Sharing GPS on the way to pickup'
                        : sharingEnabled
                          ? 'Starting GPS…'
                          : 'Location sharing is off'}
                    </Text>
                    <Text style={styles.liveSubtitle}>
                      {sharingEnabled
                        ? isEnRoute
                          ? 'Customer can track you on their order screen'
                          : 'Your live GPS is active while you travel to pickup'
                        : 'Only you can see your location until you turn this on'}
                    </Text>
                  </View>
                  <AppIcon
                    color={brand.colors.light.mint}
                    name="currentLocation"
                    size="md"
                  />
                </View>
                {liveCoords ? (
                  <Text style={styles.coordsText}>
                    {liveCoords.latitude.toFixed(5)},{' '}
                    {liveCoords.longitude.toFixed(5)}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.orderCard}>
              <View style={styles.statusRow}>
                <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>
                    {formatStatus(order.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.stopRow}>
                <View style={styles.stopIcon}>
                  <AppIcon
                    color={brand.colors.light.primary}
                    name="pickupLocation"
                    size="sm"
                  />
                </View>
                <View style={styles.stopBody}>
                  <Text style={styles.sectionLabel}>Pickup</Text>
                  <Text style={styles.sectionValue}>
                    {order.restaurant?.name ?? 'Restaurant'}
                  </Text>
                  <Text style={styles.sectionMuted}>
                    {order.restaurant?.address ?? 'Address unavailable'}
                  </Text>
                </View>
              </View>

              <View style={styles.routeDivider} />

              <View style={styles.stopRow}>
                <View style={[styles.stopIcon, styles.stopIconDeliver]}>
                  <AppIcon
                    color={brand.colors.light.mint}
                    name="deliveryLocation"
                    size="sm"
                  />
                </View>
                <View style={styles.stopBody}>
                  <Text style={styles.sectionLabel}>Deliver to</Text>
                  <Text style={styles.sectionValue}>{order.deliveryAddress}</Text>
                </View>
              </View>

              <Text style={styles.total}>{formatCurrency(order.totalAmount)}</Text>

              <View style={styles.navRow}>
                <Pressable
                  style={styles.navButton}
                  onPress={() =>
                    openMaps(
                      {
                        address:
                          order.restaurant?.address ||
                          order.restaurant?.name ||
                          'Restaurant',
                        latitude: order.restaurant?.latitude,
                        longitude: order.restaurant?.longitude,
                      },
                    )
                  }>
                  <AppIcon
                    color={brand.colors.light.ink}
                    name="navigation"
                    size="sm"
                  />
                  <Text style={styles.navButtonText}>Navigate to pickup</Text>
                </Pressable>
                <Pressable
                  style={styles.navButton}
                  onPress={() =>
                    openMaps({
                      address: order.deliveryAddress,
                      latitude: order.deliveryLatitude,
                      longitude: order.deliveryLongitude,
                    })
                  }>
                  <AppIcon
                    color={brand.colors.light.ink}
                    name="map"
                    size="sm"
                  />
                  <Text style={styles.navButtonText}>To customer</Text>
                </Pressable>
              </View>

              {action ? (
                <Pressable
                  style={[
                    styles.primaryButton,
                    isEnRoute && styles.deliverButton,
                    busy && styles.disabled,
                  ]}
                  disabled={busy}
                  onPress={() => handleStatusAction(order.id, action.status)}>
                  {updating && updatingVars?.orderId === order.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>{action.label}</Text>
                  )}
                </Pressable>
              ) : null}

              {isOnActiveRoute ? (
                <Pressable
                  style={[
                    styles.stopTrackButton,
                    !sharingEnabled && styles.startTrackButton,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy, selected: sharingEnabled }}
                  disabled={busy}
                  onPress={() => {
                    if (sharingEnabled) {
                      setSharingOrderId(null);
                      setTrackingReady(false);
                      setLiveCoords(null);
                      stopNativeTracking();
                      return;
                    }
                    setTrackingReady(false);
                    setLiveCoords(null);
                    setSharingOrderId(order.id);
                  }}>
                  <Text style={[
                    styles.stopTrackText,
                    !sharingEnabled && styles.startTrackText,
                  ]}>
                    {sharingEnabled
                      ? 'Pause location sharing'
                      : isEnRoute
                        ? 'Share live location'
                        : 'Share GPS while heading to pickup'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={enter(250, 380)}>
          <Pressable
            onPress={() => router.replace('/(driver)')}
            style={({ pressed }) => [
              styles.homeButton,
              pressed && styles.pressed,
            ]}>
            <AppIcon color={brand.colors.light.primary} name="home" size="sm" />
            <Text style={styles.homeButtonText}>Back to dashboard</Text>
          </Pressable>
        </Animated.View>
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
    paddingBottom: 28 + BottomTabInset,
  },
  stack: {
    gap: 12,
  },
  centered: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  tasksBadge: {
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  tasksBadgeText: {
    color: brand.colors.light.primaryText,
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
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
    marginTop: 5,
  },
  routeCanvas: {
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  canvasTitle: {
    color: '#FFF8F4',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 8,
  },
  canvasCopy: {
    color: 'rgba(255,248,244,0.72)',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,248,244,0.12)',
  },
  refreshButtonText: {
    color: '#FFF8F4',
    fontWeight: '800',
  },
  progressCard: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 16,
  },
  progressStep: {
    alignItems: 'center',
    gap: 6,
  },
  progressDot: {
    backgroundColor: brand.colors.light.border,
    borderRadius: 999,
    height: 14,
    width: 14,
  },
  progressDotDone: {
    backgroundColor: brand.colors.light.mint,
  },
  progressDotActive: {
    backgroundColor: brand.colors.light.primary,
  },
  progressLine: {
    backgroundColor: brand.colors.light.border,
    flex: 1,
    height: 3,
    marginBottom: 18,
    marginHorizontal: 10,
  },
  progressLineActive: {
    backgroundColor: brand.colors.light.mint,
  },
  progressLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  liveCard: {
    backgroundColor: '#E8F7F2',
    borderColor: '#B7E5D6',
    borderRadius: brand.radius.large,
    borderWidth: 1,
    padding: 16,
  },
  liveHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  livePulse: {
    alignItems: 'center',
    backgroundColor: 'rgba(22,133,107,0.15)',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  livePulseInner: {
    backgroundColor: brand.colors.light.mint,
    borderRadius: 999,
    height: 10,
    width: 10,
  },
  liveCopy: {
    flex: 1,
  },
  liveTitle: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  liveSubtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  coordsText: {
    color: brand.colors.light.mint,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 11,
    marginTop: 10,
  },
  orderCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    padding: 18,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  orderId: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  statusBadge: {
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusBadgeText: {
    color: brand.colors.light.primaryText,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'capitalize',
  },
  stopRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stopIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 14,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  stopIconDeliver: {
    backgroundColor: '#E8F7F2',
  },
  stopBody: {
    flex: 1,
  },
  routeDivider: {
    alignSelf: 'flex-start',
    backgroundColor: brand.colors.light.border,
    height: 18,
    marginLeft: 19,
    marginVertical: 6,
    width: 2,
  },
  sectionLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionValue: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionMuted: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    marginTop: 2,
  },
  total: {
    color: brand.colors.light.primary,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 14,
    marginTop: 18,
  },
  navRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  navButton: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surfaceMuted,
    borderColor: brand.colors.light.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 10,
  },
  navButtonText: {
    color: brand.colors.light.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primary,
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 52,
  },
  deliverButton: {
    backgroundColor: brand.colors.light.mint,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  declineButton: {
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 48,
  },
  declineButtonText: {
    color: '#DC2626',
    fontWeight: '800',
  },
  stopTrackButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 10,
  },
  startTrackButton: {
    backgroundColor: brand.colors.light.primary,
    borderColor: brand.colors.light.primary,
  },
  stopTrackText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  startTrackText: {
    color: '#FFFFFF',
  },
  disabled: {
    opacity: 0.7,
  },
  homeButton: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  homeButtonText: {
    color: brand.colors.light.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.98 }],
  },
});
