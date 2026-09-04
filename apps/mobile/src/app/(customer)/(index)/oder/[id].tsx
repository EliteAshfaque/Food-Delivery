import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { api } from "@/lib/axios";
import { usePaymentSheet } from "@/hooks/use-payment-sheet";
import { useOrderSocket, useDriverLocation } from "@/hooks/user-order.socket";
import { OrderTrackingMap } from "@/components/order-tracking-map";
import {
  OrderStatus,
  type MenuItem,
  type OrderStatus as OrderStatusType,
  type Restaurant,
  type Review,
} from "@food-delivery/types";
import { brand } from "@/constants/brand";
import { PaymentSuccessCelebration } from "@/components/payment-success-celebration";
import { AppIcon, type AppIconName } from "@/components/wasil-icon-system";
import { OrderReviewCard } from "@/components/order-review-card";
import { OrderStatusChip } from "@/components/wasil-ui-components";

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
  driverId: string | null;
  status: OrderStatusType;
  totalAmount: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  createdAt: string;
  items: OrderLineItem[];
};

const TRACKED_STATUSES = new Set<OrderStatusType>([
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.PICKED_UP,
]);

function shouldPollOrder(status: OrderStatusType | undefined) {
  return Boolean(status && TRACKED_STATUSES.has(status));
}

const STATUS_STEPS: {
  detail: string;
  icon: AppIconName;
  key: OrderStatusType;
  label: string;
}[] = [
  {
    key: OrderStatus.PENDING,
    label: "Payment pending",
    detail: "Complete secure payment to place your order",
    icon: "creditCard",
  },
  {
    key: OrderStatus.CONFIRMED,
    label: "Restaurant confirmed",
    detail: "Your order has reached the kitchen",
    icon: "orderConfirmed",
  },
  {
    key: OrderStatus.PREPARING,
    label: "Preparing your order",
    detail: "The kitchen is preparing your food",
    icon: "orderPreparing",
  },
  {
    key: OrderStatus.READY,
    label: "Ready for driver pickup",
    detail: "A driver can collect your order now",
    icon: "orderReady",
  },
  {
    key: OrderStatus.PICKED_UP,
    label: "Driver is on the way",
    detail: "Your driver is heading to your address",
    icon: "orderPickedUp",
  },
  {
    key: OrderStatus.DELIVERED,
    label: "Delivered",
    detail: "Your order has arrived — enjoy your meal",
    icon: "orderCompleted",
  },
];

const PROGRESS_CONNECTOR_HEIGHT = 46;

function formatPrice(price: string | number) {
  const value = typeof price === "number" ? price : Number.parseFloat(price);
  if (Number.isNaN(value)) return String(price);
  return `$${value.toFixed(2)}`;
}

function getStatusIndex(status: OrderStatusType) {
  if (status === "CANCELLED") return -1;
  return STATUS_STEPS.findIndex((step) => step.key === status);
}

function getHeaderContent(status: OrderStatusType) {
  switch (status) {
    case "PENDING":
      return {
        icon: "creditCard" as const,
        title: "Payment required",
        subtitle: "Complete payment to confirm your order",
        tone: brand.colors.light.warning,
      };
    case "CONFIRMED":
      return {
        icon: "orderConfirmed" as const,
        title: "Payment confirmed",
        subtitle: "Your order has been sent to the restaurant",
        tone: brand.colors.light.primary,
      };
    case "PREPARING":
      return {
        icon: "orderPreparing" as const,
        title: "Preparing your food",
        subtitle: "The restaurant is working on your order",
        tone: brand.colors.light.warning,
      };
    case "READY":
      return {
        icon: "orderReady" as const,
        title: "Order is ready",
        subtitle: "Waiting for driver pickup",
        tone: brand.colors.light.mint,
      };
    case "PICKED_UP":
      return {
        icon: "orderPickedUp" as const,
        title: "On the way",
        subtitle: "Your driver is heading to you",
        tone: brand.colors.light.mint,
      };
    case "DELIVERED":
      return {
        icon: "orderCompleted" as const,
        title: "Delivered",
        subtitle: "Enjoy your meal!",
        tone: brand.colors.light.mint,
      };
    case "CANCELLED":
      return {
        icon: "orderFailed" as const,
        title: "Order cancelled",
        subtitle: "This order was cancelled",
        tone: brand.colors.light.danger,
      };
    default:
      return {
        icon: "orderDetails" as const,
        title: "Order details",
        subtitle: "Track your order below",
        tone: brand.colors.light.inkMuted,
      };
  }
}

function OrderProgressConnector({
  index,
  progress,
}: {
  index: number;
  progress: SharedValue<number>;
}) {
  const fillStyle = useAnimatedStyle(() => {
    const fill = Math.max(0, Math.min(progress.value - index, 1));

    return {
      opacity: fill,
      transform: [{ translateY: -(1 - fill) * PROGRESS_CONNECTOR_HEIGHT }],
    };
  });

  return (
    <View style={styles.progressConnector}>
      <Animated.View style={[styles.progressConnectorFill, fillStyle]} />
    </View>
  );
}

function OrderProgressStep({
  currentStep,
  index,
  progress,
  reduceMotion,
  step,
  tone,
}: {
  currentStep: number;
  index: number;
  progress: SharedValue<number>;
  reduceMotion: boolean;
  step: (typeof STATUS_STEPS)[number];
  tone: string;
}) {
  const active = currentStep === index;
  const done = currentStep > index;
  const iconScale = useSharedValue(1);
  const haloProgress = useSharedValue(1);

  useEffect(() => {
    if (!active || reduceMotion) {
      iconScale.value = 1;
      haloProgress.value = 1;
      return;
    }

    iconScale.value = 0.78;
    haloProgress.value = 0;
    iconScale.value = withSpring(1, {
      damping: 13,
      mass: 0.72,
      stiffness: 235,
    });
    haloProgress.value = withTiming(1, {
      duration: 640,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, haloProgress, iconScale, reduceMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: (1 - haloProgress.value) * 0.28,
    transform: [{ scale: 0.9 + haloProgress.value * 0.66 }],
  }));

  const isLast = index === STATUS_STEPS.length - 1;
  const stateDescription = active
    ? "Current stage"
    : done
      ? "Completed"
      : "Upcoming";

  return (
    <View
      accessible
      accessibilityLabel={`${stateDescription}: ${step.label}. ${step.detail}`}
      style={[styles.progressStep, isLast && styles.progressStepLast]}
    >
      <View style={styles.progressRail}>
        {active && !reduceMotion ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.progressStepHalo,
              { backgroundColor: tone },
              haloStyle,
            ]}
          />
        ) : null}
        <Animated.View
          style={[
            styles.progressStepIcon,
            done && styles.progressStepIconDone,
            active && [
              styles.progressStepIconActive,
              { backgroundColor: tone },
            ],
            !active && !done && styles.progressStepIconUpcoming,
            iconStyle,
          ]}
        >
          <AppIcon
            color={
              active
                ? "#FFFFFF"
                : done
                  ? brand.colors.light.mint
                  : brand.colors.light.inkMuted
            }
            name={done ? "check" : step.icon}
            size="sm"
          />
        </Animated.View>
        {!isLast ? (
          <OrderProgressConnector index={index} progress={progress} />
        ) : null}
      </View>

      <View style={styles.progressStepCopy}>
        <Text
          style={[
            styles.progressStepLabel,
            done && styles.progressStepLabelDone,
            active && { color: tone },
          ]}
        >
          {step.label}
        </Text>
        <Text style={styles.progressStepDetail}>{step.detail}</Text>
        {active ? (
          <View style={styles.currentStage}>
            <View style={[styles.currentStageDot, { backgroundColor: tone }]} />
            <Text style={[styles.currentStageText, { color: tone }]}>
              Live now
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function OrderProgressStepper({ status }: { status: OrderStatusType }) {
  const reduceMotion = useReducedMotion();
  const currentStep = getStatusIndex(status);
  const progress = useSharedValue(reduceMotion ? currentStep : -0.25);
  const header = getHeaderContent(status);

  useEffect(() => {
    if (currentStep < 0) return;

    progress.value = reduceMotion
      ? currentStep
      : withTiming(currentStep, {
          duration: 680,
          easing: Easing.out(Easing.cubic),
        });
  }, [currentStep, progress, reduceMotion]);

  if (status === OrderStatus.CANCELLED) {
    return (
      <View
        accessible
        accessibilityLabel="Order cancelled. This order will not continue."
        style={styles.timelineCard}
      >
        <Text style={styles.timelineTitle}>Order journey</Text>
        <View style={styles.cancelledJourney}>
          <View style={styles.cancelledJourneyIcon}>
            <AppIcon
              color={brand.colors.light.danger}
              name="orderFailed"
              size="md"
            />
          </View>
          <View style={styles.cancelledJourneyCopy}>
            <Text style={styles.cancelledJourneyTitle}>Order cancelled</Text>
            <Text style={styles.cancelledJourneyText}>
              This order will not continue. Check your payment activity for any
              related updates.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const currentLabel = STATUS_STEPS[currentStep]?.label ?? "Order updates";

  return (
    <View
      accessible
      accessibilityLabel={`Order progress: ${currentLabel}, step ${currentStep + 1} of ${STATUS_STEPS.length}`}
      style={styles.timelineCard}
    >
      <View style={styles.progressHeader}>
        <View style={styles.progressHeading}>
          <Text style={styles.timelineTitle}>Order journey</Text>
          <Text style={styles.progressSubtitle}>
            We update this as the restaurant and driver make progress.
          </Text>
        </View>
        <View
          style={[styles.progressCount, { borderColor: `${header.tone}33` }]}
        >
          <Text style={[styles.progressCountText, { color: header.tone }]}>
            {currentStep + 1}/{STATUS_STEPS.length}
          </Text>
        </View>
      </View>

      <View style={styles.progressSteps}>
        {STATUS_STEPS.map((step, index) => (
          <OrderProgressStep
            currentStep={currentStep}
            index={index}
            key={step.key}
            progress={progress}
            reduceMotion={reduceMotion}
            step={step}
            tone={header.tone}
          />
        ))}
      </View>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const orderUpdate = useOrderSocket(id ?? null);
  const { initPaymentSheet, presentPaymentSheet, isSupported } =
    usePaymentSheet();
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const hidePaymentSuccess = useCallback(
    () => setShowPaymentSuccess(false),
    [],
  );

  const {
    data: order,
    isLoading,
    isFetching,
    refetch,
  } = useQuery<OrderDetail | null>({
    queryKey: ["order", id],
    queryFn: () => api.get(`/orders/${id}`).then((res) => res.data),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      shouldPollOrder(query.state.data?.status ?? undefined) ? 5000 : false,
  });

  const driverLocation = useDriverLocation(
    id ?? null,
    order?.status === OrderStatus.PICKED_UP,
  );

  const { data: orderReview } = useQuery<Review | null>({
    queryKey: ["order-review", id],
    queryFn: () =>
      api.get<Review | null>(`/reviews/order/${id}`).then((res) => res.data),
    enabled: Boolean(id) && order?.status === OrderStatus.DELIVERED,
  });

  useEffect(() => {
    if (!id || !orderUpdate || orderUpdate.id !== id) return;

    // Socket updates contain the persisted order row, while this detail query
    // also owns line items. Merge the live fields and deliberately retain the
    // existing items so the animated journey changes immediately without a
    // second HTTP request.
    queryClient.setQueryData<OrderDetail | null>(["order", id], (current) => {
      if (!current || current.id !== orderUpdate.id) return current;

      return {
        ...current,
        ...orderUpdate,
        items: current.items,
      };
    });

    // Keep an already-cached customer order list in sync too. This avoids a
    // stale status when the customer navigates back from the tracking screen.
    queryClient.setQueryData<Array<Omit<OrderDetail, "items">> | undefined>(
      ["my-orders"],
      (current) =>
        current?.map((cachedOrder) =>
          cachedOrder.id === orderUpdate.id
            ? { ...cachedOrder, ...orderUpdate }
            : cachedOrder,
        ),
    );
  }, [id, orderUpdate, queryClient]);

  useFocusEffect(
    useCallback(() => {
      if (id) {
        void refetch();
      }
    }, [id, refetch]),
  );

  const { data: restaurant } = useQuery<Restaurant | null>({
    queryKey: ["restaurant", order?.restaurantId],
    queryFn: () =>
      api.get(`/restaurants/${order!.restaurantId}`).then((res) => res.data),
    enabled: Boolean(order?.restaurantId),
  });

  const { data: menuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["menu-items", order?.restaurantId],
    queryFn: () =>
      api.get(`/menu/items/${order!.restaurantId}`).then((res) => res.data),
    enabled: Boolean(order?.restaurantId),
  });

  const handlePayment = useCallback(async () => {
    if (!order) return;

    if (!isSupported) {
      Alert.alert(
        "Use the mobile app",
        "Stripe payments only work on iOS/Android (not in the browser). Open the app in Expo Go or a development build.",
      );
      return;
    }

    setPaymentLoading(true);
    try {
      const { data } = await api.post<{ clientSecret: string }>(
        "/payments/intent",
        {
          orderId: order.id,
        },
      );

      if (!data.clientSecret) {
        Alert.alert(
          "Payment error",
          "Could not start payment. Please try again.",
        );
        return;
      }

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: restaurant?.name ?? "Wasil",
        paymentIntentClientSecret: data.clientSecret,
        allowsDelayedPaymentMethods: false,
        returnURL: "wasil://stripe-redirect",
      });

      if (initError) {
        Alert.alert("Payment error", initError.message);
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== "Canceled") {
          Alert.alert("Payment failed", presentError.message);
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
        if (refreshed?.status === "CONFIRMED") {
          confirmed = true;
          break;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["order", id] });

      if (confirmed) {
        setShowPaymentSuccess(true);
      } else {
        Alert.alert(
          "Payment received",
          "Your payment went through. Order confirmation may take a moment.",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      Alert.alert("Payment error", message);
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
        <ActivityIndicator size="large" color={brand.colors.light.primary} />
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
  const isPending = order.status === "PENDING";
  const isBusy = paymentLoading || confirmingPayment;
  const deliveryCoords =
    order.deliveryLatitude != null && order.deliveryLongitude != null
      ? {
          latitude: order.deliveryLatitude,
          longitude: order.deliveryLongitude,
        }
      : null;
  const showTrackingMap =
    Boolean(deliveryCoords) &&
    (order.status === OrderStatus.READY ||
      order.status === OrderStatus.PICKED_UP ||
      order.status === OrderStatus.DELIVERED);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <View style={styles.backContent}>
            <AppIcon name="back" size="sm" color={brand.colors.light.primary} />
            <Text style={styles.backText}>Back</Text>
          </View>
        </Pressable>

        <View style={[styles.successCard, { borderColor: `${header.tone}33` }]}>
          <View
            style={[
              styles.successIcon,
              { backgroundColor: `${header.tone}18` },
            ]}
          >
            <AppIcon name={header.icon} size="xl" color={header.tone} />
          </View>
          <Text style={styles.title}>{header.title}</Text>
          <Text style={styles.subtitle}>{header.subtitle}</Text>
          {isFetching && !isLoading && shouldPollOrder(order.status) ? (
            <Text style={styles.liveHint}>Updating status…</Text>
          ) : null}
        </View>

        <OrderProgressStepper status={order.status} />

        {showTrackingMap && deliveryCoords ? (
          <View style={styles.trackingCard}>
            <View style={styles.trackingHeader}>
              <Text style={styles.trackingTitle}>Delivery map</Text>
              <Text style={styles.trackingSubtitle}>
                {order.status === OrderStatus.PICKED_UP
                  ? driverLocation
                    ? "Your driver is on the way — map updates live."
                    : "Waiting for driver GPS signal…"
                  : "Your drop-off pin is saved for the driver."}
              </Text>
            </View>
            <OrderTrackingMap
              delivery={deliveryCoords}
              driver={driverLocation}
              live={order.status === OrderStatus.PICKED_UP && Boolean(driverLocation)}
            />
          </View>
        ) : null}

        {isPending ? (
          <View style={styles.paymentCard}>
            <View style={styles.paymentTitleRow}>
              <View style={styles.paymentIconWrap}>
                <AppIcon name="lock" size="sm" color="#FFFFFF" />
              </View>
              <Text style={styles.paymentTitle}>Secure checkout</Text>
            </View>
            <Text style={styles.paymentText}>
              Pay {formatPrice(order.totalAmount)} securely with Stripe to
              confirm your order.
            </Text>
            <View style={styles.paymentFeatures}>
              <View style={styles.paymentFeatureRow}>
                <AppIcon
                  name="check"
                  size="xs"
                  color={brand.colors.light.accent}
                />
                <Text style={styles.paymentFeature}>Encrypted payment</Text>
              </View>
              <View style={styles.paymentFeatureRow}>
                <AppIcon
                  name="creditCard"
                  size="xs"
                  color={brand.colors.light.accent}
                />
                <Text style={styles.paymentFeature}>
                  Card, Apple Pay & Google Pay
                </Text>
              </View>
            </View>
            <Pressable
              style={[styles.payButton, isBusy && styles.buttonDisabled]}
              onPress={() => void handlePayment()}
              disabled={isBusy}
            >
              {isBusy ? (
                <View style={styles.payButtonContent}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.payButtonText}>
                    {confirmingPayment ? "Confirming..." : "Opening payment..."}
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

        {order.status === OrderStatus.DELIVERED ? (
          <OrderReviewCard
            existingReview={orderReview ?? null}
            hasDriver={Boolean(order.driverId)}
            orderId={order.id}
            restaurantId={order.restaurantId}
            restaurantName={restaurant?.name}
          />
        ) : null}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Order ID</Text>
            <Text style={styles.value}>{order.id.slice(0, 8)}...</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <OrderStatusChip status={order.status} compact />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Restaurant</Text>
            <Text style={styles.value}>{restaurant?.name ?? "Loading..."}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Delivery</Text>
            <Text style={[styles.value, styles.address]}>
              {order.deliveryAddress}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Items</Text>
        {order.items.map((item) => {
          const menuItem = menuItems.find((m) => m.id === item.menuItemId);
          const lineTotal = parseFloat(item.price) * parseFloat(item.quantity);
          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemBody}>
                <Text style={styles.itemName}>
                  {menuItem?.name ?? "Menu item"}
                </Text>
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
            {isPending ? "Total due" : "Total paid"}
          </Text>
          <Text style={styles.totalValue}>
            {formatPrice(order.totalAmount)}
          </Text>
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.replace("/(customer)/(index)")}
        >
          <Text style={styles.secondaryButtonText}>Back to home</Text>
        </Pressable>
      </ScrollView>
      <PaymentSuccessCelebration
        amount={formatPrice(order.totalAmount)}
        onComplete={hidePaymentSuccess}
        visible={showPaymentSuccess}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.colors.light.canvas,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: brand.colors.light.canvas,
    padding: 24,
  },
  back: {
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  backContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 3,
  },
  backText: {
    fontSize: 16,
    color: brand.colors.light.primary,
    fontWeight: "800",
  },
  successCard: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: brand.radius.large,
    padding: 20,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    ...brand.shadow,
  },
  successIcon: {
    alignItems: "center",
    borderRadius: 30,
    height: 64,
    justifyContent: "center",
    marginBottom: 8,
    width: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: brand.colors.light.ink,
    letterSpacing: -0.4,
    marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: brand.colors.light.inkMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  liveHint: {
    marginTop: 8,
    fontSize: 12,
    color: brand.colors.light.primary,
    textAlign: "center",
  },
  timelineCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  trackingCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16,
    gap: 12,
  },
  trackingHeader: {
    gap: 4,
  },
  trackingTitle: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  trackingSubtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: brand.colors.light.ink,
    letterSpacing: -0.15,
  },
  progressHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 18,
  },
  progressHeading: {
    flex: 1,
  },
  progressSubtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  progressCount: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surfaceMuted,
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    justifyContent: "center",
    minWidth: 42,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  progressCountText: {
    fontSize: 12,
    fontWeight: "900",
  },
  progressSteps: {
    gap: 0,
  },
  progressStep: {
    flexDirection: "row",
    minHeight: 90,
  },
  progressStepLast: {
    minHeight: 44,
  },
  progressRail: {
    alignItems: "center",
    position: "relative",
    width: 38,
  },
  progressStepHalo: {
    borderRadius: 22,
    height: 36,
    left: 1,
    position: "absolute",
    top: 0,
    width: 36,
  },
  progressStepIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surfaceMuted,
    borderColor: brand.colors.light.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
    zIndex: 1,
  },
  progressStepIconDone: {
    backgroundColor: "#E7F6F0",
    borderColor: "#B9E7D9",
  },
  progressStepIconActive: {
    borderColor: "transparent",
    ...brand.shadow,
  },
  progressStepIconUpcoming: {
    backgroundColor: brand.colors.light.surfaceMuted,
  },
  progressConnector: {
    backgroundColor: brand.colors.light.border,
    height: PROGRESS_CONNECTOR_HEIGHT,
    marginVertical: 4,
    overflow: "hidden",
    width: 2,
  },
  progressConnectorFill: {
    backgroundColor: brand.colors.light.mint,
    height: PROGRESS_CONNECTOR_HEIGHT,
    width: 2,
  },
  progressStepCopy: {
    flex: 1,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 2,
    paddingTop: 2,
  },
  progressStepLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  progressStepLabelDone: {
    color: brand.colors.light.ink,
  },
  progressStepDetail: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  currentStage: {
    alignItems: "center",
    flexDirection: "row",
    gap: 5,
    marginTop: 6,
  },
  currentStageDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  currentStageText: {
    fontSize: 11,
    fontWeight: "900",
  },
  cancelledJourney: {
    alignItems: "flex-start",
    backgroundColor: "#FFF0F2",
    borderColor: "#F8CBD2",
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  cancelledJourneyIcon: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  cancelledJourneyCopy: {
    flex: 1,
  },
  cancelledJourneyTitle: {
    color: brand.colors.light.danger,
    fontSize: 14,
    fontWeight: "900",
  },
  cancelledJourneyText: {
    color: "#944052",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  paymentCard: {
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    padding: 18,
    marginBottom: 16,
  },
  paymentTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginBottom: 8,
  },
  paymentIconWrap: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: 12,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  paymentTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#fff",
  },
  paymentText: {
    fontSize: 14,
    color: "#D1D5DB",
    lineHeight: 20,
    marginBottom: 12,
  },
  paymentFeatures: {
    gap: 6,
    marginBottom: 16,
  },
  paymentFeatureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
  },
  paymentFeature: {
    fontSize: 13,
    color: "#9CA3AF",
  },
  payButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    paddingVertical: 16,
    alignItems: "center",
  },
  payButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  payButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  card: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  row: {
    gap: 4,
  },
  label: {
    fontSize: 12,
    color: brand.colors.light.inkMuted,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  value: {
    fontSize: 15,
    color: brand.colors.light.ink,
    fontWeight: "700",
  },
  address: {
    lineHeight: 20,
    fontWeight: "500",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: brand.colors.light.ink,
    marginBottom: 10,
  },
  itemCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  itemBody: {
    flex: 1,
    marginRight: 12,
  },
  itemName: {
    fontSize: 15,
    fontWeight: "900",
    color: brand.colors.light.ink,
    marginBottom: 4,
  },
  itemMeta: {
    fontSize: 13,
    color: brand.colors.light.inkMuted,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: "800",
    color: brand.colors.light.primary,
  },
  totalCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    padding: 16,
    marginTop: 6,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 16,
    color: brand.colors.light.inkMuted,
    fontWeight: "700",
  },
  totalValue: {
    fontSize: 22,
    fontWeight: "800",
    color: brand.colors.light.ink,
  },
  primaryButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
  },
  secondaryButtonText: {
    color: brand.colors.light.primary,
    fontSize: 16,
    fontWeight: "800",
  },
});
