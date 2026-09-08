import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { api } from "@/lib/axios";
import { getApiErrorMessage } from "@/lib/api-error";
import { formatCurrency } from "@/lib/format";
import { usePaymentSheet } from "@/hooks/use-payment-sheet";
import { useOrderSocket, useDriverLocation } from "@/hooks/user-order.socket";
import { OrderTrackingMap } from "@/components/order-tracking-map";
import { OrderStepMotion } from "@/components/order-step-motion";
import { RequestErrorState } from "@/components/request-error-state";
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
  driverAcceptedAt: string | null;
  status: OrderStatusType;
  subtotalAmount?: string;
  discountAmount?: string;
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
  shortLabel: string;
}[] = [
  {
    key: OrderStatus.PENDING,
    label: "Payment pending",
    shortLabel: "Pay",
    detail: "Complete secure payment to place your order",
    icon: "creditCard",
  },
  {
    key: OrderStatus.CONFIRMED,
    label: "Order confirmed",
    shortLabel: "Confirmed",
    detail: "Payment is confirmed — the restaurant will begin shortly",
    icon: "orderConfirmed",
  },
  {
    key: OrderStatus.PREPARING,
    label: "Preparing your order",
    shortLabel: "Kitchen",
    detail: "The kitchen is preparing your food",
    icon: "orderPreparing",
  },
  {
    key: OrderStatus.READY,
    label: "Ready for pickup",
    shortLabel: "Ready",
    detail: "A driver can collect your order now",
    icon: "orderReady",
  },
  {
    key: OrderStatus.PICKED_UP,
    label: "On the way",
    shortLabel: "En route",
    detail: "Your driver is heading to your address",
    icon: "orderPickedUp",
  },
  {
    key: OrderStatus.DELIVERED,
    label: "Delivered",
    shortLabel: "Done",
    detail: "Your order has arrived — enjoy your meal",
    icon: "orderCompleted",
  },
];

function getStatusIndex(status: OrderStatusType) {
  if (status === "CANCELLED") return -1;
  return STATUS_STEPS.findIndex((step) => step.key === status);
}

function getHeaderContent(
  status: OrderStatusType,
  driverAcceptedAt: string | null = null,
) {
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
        title: "Order confirmed",
        subtitle: "Payment is confirmed — awaiting the kitchen",
        tone: brand.colors.light.primary,
      };
    case "PREPARING":
      return {
        icon: "orderPreparing" as const,
        title: "Preparing your food",
        subtitle: "The kitchen is working on it now",
        tone: brand.colors.light.warning,
      };
    case "READY":
      return {
        icon: "orderReady" as const,
        title: driverAcceptedAt ? "Rider assigned" : "Finding a rider",
        subtitle: driverAcceptedAt
          ? "Your rider is heading to the restaurant"
          : "Your order is ready — matching a nearby rider",
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
        subtitle: "Enjoy your meal",
        tone: brand.colors.light.mint,
      };
    case "CANCELLED":
      return {
        icon: "orderFailed" as const,
        title: "Order cancelled",
        subtitle: "This order will not continue",
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

function TrackNode({
  active,
  done,
  label,
  tone,
  icon,
}: {
  active: boolean;
  done: boolean;
  label: string;
  tone: string;
  icon: AppIconName;
}) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!active || reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1.14, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [active, pulse, reduceMotion]);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: active ? pulse.value : 1 }],
  }));

  return (
    <View style={styles.trackNode}>
      <Animated.View
        style={[
          styles.trackDot,
          done && styles.trackDotDone,
          active && [
            styles.trackDotActive,
            {
              backgroundColor: tone,
              borderColor: tone,
            },
          ],
          dotStyle,
        ]}
      >
        {done || active ? (
          <AppIcon
            color="#FFFFFF"
            name={done ? "check" : icon}
            size="xs"
          />
        ) : null}
      </Animated.View>
      <Text
        numberOfLines={1}
        style={[
          styles.trackLabel,
          (done || active) && styles.trackLabelActive,
          active && { color: tone },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function OrderProgressStepper({
  status,
  driverAcceptedAt,
}: {
  status: OrderStatusType;
  driverAcceptedAt: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const currentStep = getStatusIndex(status);
  const header = getHeaderContent(status, driverAcceptedAt);
  const activeStep =
    currentStep >= 0 ? STATUS_STEPS[currentStep] : STATUS_STEPS[0];
  const progress = useSharedValue(0);
  const livePulse = useSharedValue(1);

  useEffect(() => {
    const max = Math.max(STATUS_STEPS.length - 1, 1);
    const next = Math.max(0, Math.min(currentStep / max, 1));
    progress.value = reduceMotion
      ? next
      : withTiming(next, {
          duration: 650,
          easing: Easing.out(Easing.cubic),
        });
  }, [currentStep, progress, reduceMotion]);

  useEffect(() => {
    if (status === OrderStatus.DELIVERED || reduceMotion) {
      livePulse.value = 1;
      return;
    }
    livePulse.value = withRepeat(
      withTiming(0.35, { duration: 800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [livePulse, reduceMotion, status]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(progress.value, 0) * 100}%`,
  }));

  const liveDotStyle = useAnimatedStyle(() => ({
    opacity: livePulse.value,
  }));

  if (status === OrderStatus.CANCELLED) {
    return (
      <View style={styles.trackCard}>
        <View style={styles.cancelledBanner}>
          <View style={styles.cancelledIcon}>
            <AppIcon
              color={brand.colors.light.danger}
              name="orderFailed"
              size="md"
            />
          </View>
          <View style={styles.cancelledCopy}>
            <Text style={styles.cancelledTitle}>Order cancelled</Text>
            <Text style={styles.cancelledText}>
              This order will not continue. Check your payment activity for any
              related updates.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`Order progress: ${activeStep.label}, step ${currentStep + 1} of ${STATUS_STEPS.length}`}
      style={styles.trackCard}
    >
      <View style={styles.trackHeader}>
        <Text style={styles.trackEyebrow}>ORDER STATUS</Text>
        <Text style={[styles.trackCount, { color: header.tone }]}>
          {currentStep + 1}/{STATUS_STEPS.length}
        </Text>
      </View>

      <OrderStepMotion
        key={`${status}:${driverAcceptedAt ? "assigned" : "matching"}`}
        status={status}
        tone={header.tone}
      />

      <View style={styles.trackRail}>
        <View style={styles.trackRailTrack} />
        <Animated.View
          style={[
            styles.trackRailFill,
            { backgroundColor: header.tone },
            fillStyle,
          ]}
        />
        <View style={styles.trackNodes}>
          {STATUS_STEPS.map((step, index) => (
            <TrackNode
              active={currentStep === index}
              done={currentStep > index}
              icon={step.icon}
              key={step.key}
              label={step.shortLabel}
              tone={header.tone}
            />
          ))}
        </View>
      </View>

      <View style={styles.nowCard}>
        <View
          style={[styles.nowIcon, { backgroundColor: `${header.tone}18` }]}
        >
          <AppIcon color={header.tone} name={activeStep.icon} size="md" />
        </View>
        <View style={styles.nowCopy}>
          <Text style={styles.nowTitle}>{activeStep.label}</Text>
          <Text style={styles.nowDetail}>
            {status === OrderStatus.READY && driverAcceptedAt
              ? "Your rider accepted the pickup and is heading to the restaurant"
              : activeStep.detail}
          </Text>
        </View>
        {status !== OrderStatus.DELIVERED ? (
          <View
            style={[styles.livePill, { backgroundColor: `${header.tone}18` }]}
          >
            <Animated.View
              style={[
                styles.liveDot,
                { backgroundColor: header.tone },
                liveDotStyle,
              ]}
            />
            <Text style={[styles.liveText, { color: header.tone }]}>Live</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
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
    error: orderError,
    isError: orderIsError,
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
    queryClient.setQueryData<Omit<OrderDetail, "items">[] | undefined>(
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

    if (order.status !== OrderStatus.PENDING) {
      Alert.alert('Payment unavailable', 'This order is no longer awaiting payment.');
      return;
    }

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
        Alert.alert(
          "Payment error",
          getApiErrorMessage(
            initError,
            "We couldn't prepare secure payment. Please try again.",
          ),
        );
        return;
      }

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code !== "Canceled") {
          Alert.alert(
            "Payment failed",
            getApiErrorMessage(
              presentError,
              "Your payment could not be completed. Please try again.",
            ),
          );
        }
        return;
      }

      setConfirmingPayment(true);

      // Payment sheet dismissed without error — the server/webhook updates the
      // order asynchronously. A restaurant may advance the order beyond
      // CONFIRMED before the next poll, so every non-pending fulfilment state
      // counts as a successful payment outcome.
      let confirmed = false;
      let cancelled = false;
      for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const { data: refreshed } = await refetch();
        if (refreshed?.status === OrderStatus.CANCELLED) {
          cancelled = true;
          break;
        }
        if (refreshed?.status && refreshed.status !== OrderStatus.PENDING) {
          confirmed = true;
          break;
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["order", id] });

      if (confirmed) {
        setShowPaymentSuccess(true);
      } else if (cancelled) {
        Alert.alert(
          "Order cancelled",
          "This order was cancelled before fulfilment. If a payment completed, the refund is being processed.",
        );
      } else {
        Alert.alert(
          "Payment received",
          "Your payment went through. Order confirmation may take a moment.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Payment error",
        getApiErrorMessage(
          error,
          "We couldn't start secure payment. Please try again.",
        ),
      );
    } finally {
      setPaymentLoading(false);
      setConfirmingPayment(false);
    }
  }, [
    order,
    isSupported,
    restaurant,
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

  if (orderIsError) {
    return (
      <View style={styles.centered}>
        <RequestErrorState
          error={orderError}
          onRetry={() => void refetch()}
          title="Couldn’t load this order"
        />
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

  const header = getHeaderContent(order.status, order.driverAcceptedAt);
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

  const subtotal = order.subtotalAmount ?? order.totalAmount;
  const discount = order.discountAmount ?? "0";
  const hasDiscount = Number(discount) > 0;
  const itemCount = order.items.reduce(
    (sum, item) => sum + Number(item.quantity),
    0,
  );

  if (isPending) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.checkoutScroll,
            { paddingBottom: 110 + Math.max(insets.bottom, 12) },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.back} onPress={() => router.back()}>
            <View style={styles.backContent}>
              <AppIcon name="back" size="sm" color={brand.colors.light.ink} />
              <Text style={styles.checkoutBackText}>Back</Text>
            </View>
          </Pressable>

          <Text style={styles.checkoutEyebrow}>CHECKOUT</Text>
          <Text style={styles.checkoutTitle}>Review & pay</Text>
          <Text style={styles.checkoutSubtitle}>
            Confirm delivery and pay securely to place this order.
          </Text>

          <View style={styles.checkoutSection}>
            <View style={styles.checkoutSectionHeader}>
              <AppIcon
                color={brand.colors.light.primary}
                name="deliveryLocation"
                size="sm"
              />
              <Text style={styles.checkoutSectionTitle}>Deliver to</Text>
            </View>
            <Text style={styles.checkoutAddress}>{order.deliveryAddress}</Text>
          </View>

          <View style={styles.checkoutSection}>
            <View style={styles.checkoutSectionHeader}>
              <AppIcon
                color={brand.colors.light.primary}
                name="restaurant"
                size="sm"
              />
              <Text style={styles.checkoutSectionTitle}>
                {restaurant?.name ?? "Restaurant"}
              </Text>
            </View>
            <Text style={styles.checkoutMeta}>
              {itemCount} item{itemCount === 1 ? "" : "s"} · Order #
              {order.id.slice(0, 8)}
            </Text>
            {order.items.map((item) => {
              const menuItem = menuItems.find((m) => m.id === item.menuItemId);
              const lineTotal =
                parseFloat(item.price) * parseFloat(item.quantity);
              return (
                <View key={item.id} style={styles.checkoutItemRow}>
                  <View style={styles.checkoutQtyBadge}>
                    <Text style={styles.checkoutQtyText}>{item.quantity}</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.checkoutItemName}>
                    {menuItem?.name ?? "Menu item"}
                  </Text>
                  <Text style={styles.checkoutItemPrice}>
                    {formatCurrency(lineTotal)}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.checkoutSection}>
            <Text style={styles.checkoutSectionTitle}>Bill details</Text>
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Item total</Text>
              <Text style={styles.billValue}>{formatCurrency(subtotal)}</Text>
            </View>
            {hasDiscount ? (
              <View style={styles.billRow}>
                <Text style={styles.billDiscountLabel}>Offer discount</Text>
                <Text style={styles.billDiscountValue}>
                  −{formatCurrency(discount)}
                </Text>
              </View>
            ) : null}
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Delivery fee</Text>
              <Text style={styles.billFree}>Free</Text>
            </View>
            <View style={styles.billDivider} />
            <View style={styles.billRow}>
              <Text style={styles.billTotalLabel}>To pay</Text>
              <Text style={styles.billTotalValue}>
                {formatCurrency(order.totalAmount)}
              </Text>
            </View>
          </View>

          <View style={styles.checkoutSection}>
            <Text style={styles.checkoutSectionTitle}>Payment method</Text>
            <View style={styles.paymentMethodRow}>
              <View style={styles.paymentMethodIcon}>
                <Image
                  resizeMode="contain"
                  source={require("../../../../../assets/images/payment-card-visual.png")}
                  style={styles.paymentCardVisual}
                />
              </View>
              <View style={styles.paymentMethodCopy}>
                <Text style={styles.paymentMethodTitle}>
                  Credit / Debit card
                </Text>
                <Text style={styles.paymentMethodHint}>
                  Visa, Mastercard · encrypted with Stripe
                </Text>
              </View>
              <View style={styles.selectedPill}>
                <Text style={styles.selectedPillText}>Selected</Text>
              </View>
            </View>
            <View style={styles.trustRow}>
              <AppIcon
                color={brand.colors.light.mint}
                name="lock"
                size="xs"
              />
              <Text style={styles.trustText}>
                Your payment is protected. Card details stay with Stripe.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View
          style={[
            styles.payBar,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.payBarCopy}>
            <Text style={styles.payBarLabel}>Total</Text>
            <Text style={styles.payBarAmount}>
              {formatCurrency(order.totalAmount)}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`Pay ${formatCurrency(order.totalAmount)}`}
            accessibilityRole="button"
            accessibilityState={{ busy: isBusy, disabled: isBusy }}
            disabled={isBusy}
            onPress={() => void handlePayment()}
            style={({ pressed }) => [
              styles.payBarButton,
              isBusy && styles.buttonDisabled,
              pressed && !isBusy && styles.payBarPressed,
            ]}
          >
            {isBusy ? (
              <View style={styles.payButtonContent}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.payBarButtonText}>
                  {confirmingPayment ? "Confirming…" : "Opening…"}
                </Text>
              </View>
            ) : (
              <Text style={styles.payBarButtonText}>
                Pay {formatCurrency(order.totalAmount)}
              </Text>
            )}
          </Pressable>
        </View>

        <PaymentSuccessCelebration
          amount={formatCurrency(order.totalAmount)}
          onComplete={hidePaymentSuccess}
          visible={showPaymentSuccess}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.back} onPress={() => router.back()}>
          <View style={styles.backContent}>
            <AppIcon name="back" size="sm" color={brand.colors.light.ink} />
            <Text style={styles.checkoutBackText}>Back</Text>
          </View>
        </Pressable>

        <Text style={styles.checkoutEyebrow}>TRACKING</Text>
        <Text style={styles.checkoutTitle}>{header.title}</Text>
        <Text style={styles.checkoutSubtitle}>{header.subtitle}</Text>
        {isFetching && !isLoading && shouldPollOrder(order.status) ? (
          <Text style={styles.liveHint}>Updating status…</Text>
        ) : null}

        <OrderProgressStepper
          driverAcceptedAt={order.driverAcceptedAt}
          status={order.status}
        />

        {showTrackingMap && deliveryCoords ? (
          <View style={styles.checkoutSection}>
            <View style={styles.checkoutSectionHeader}>
              <AppIcon
                color={brand.colors.light.primary}
                name="map"
                size="sm"
              />
              <Text style={styles.checkoutSectionTitle}>Delivery map</Text>
            </View>
            <Text style={styles.checkoutMeta}>
              {order.status === OrderStatus.PICKED_UP
                ? driverLocation
                  ? "Your driver is on the way — map updates live."
                  : "Waiting for driver GPS signal…"
                : "Your drop-off pin is saved for the driver."}
            </Text>
            <OrderTrackingMap
              delivery={deliveryCoords}
              driver={driverLocation}
              live={
                order.status === OrderStatus.PICKED_UP &&
                Boolean(driverLocation)
              }
            />
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

        <View style={styles.checkoutSection}>
          <View style={styles.checkoutSectionHeader}>
            <AppIcon
              color={brand.colors.light.primary}
              name="deliveryLocation"
              size="sm"
            />
            <Text style={styles.checkoutSectionTitle}>Deliver to</Text>
          </View>
          <Text style={styles.checkoutAddress}>{order.deliveryAddress}</Text>
          <Text style={styles.checkoutMeta}>
            Order #{order.id.slice(0, 8)}
          </Text>
        </View>

        <View style={styles.checkoutSection}>
          <View style={styles.checkoutSectionHeader}>
            <AppIcon
              color={brand.colors.light.primary}
              name="restaurant"
              size="sm"
            />
            <Text style={styles.checkoutSectionTitle}>
              {restaurant?.name ?? "Restaurant"}
            </Text>
          </View>
          {order.items.map((item) => {
            const menuItem = menuItems.find((m) => m.id === item.menuItemId);
            const lineTotal =
              parseFloat(item.price) * parseFloat(item.quantity);
            return (
              <View key={item.id} style={styles.checkoutItemRow}>
                <View style={styles.checkoutQtyBadge}>
                  <Text style={styles.checkoutQtyText}>{item.quantity}</Text>
                </View>
                <Text numberOfLines={2} style={styles.checkoutItemName}>
                  {menuItem?.name ?? "Menu item"}
                </Text>
                <Text style={styles.checkoutItemPrice}>
                  {formatCurrency(lineTotal)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.checkoutSection}>
          <Text style={styles.checkoutSectionTitle}>Bill details</Text>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Item total</Text>
            <Text style={styles.billValue}>{formatCurrency(subtotal)}</Text>
          </View>
          {hasDiscount ? (
            <View style={styles.billRow}>
              <Text style={styles.billDiscountLabel}>Offer discount</Text>
              <Text style={styles.billDiscountValue}>
                −{formatCurrency(discount)}
              </Text>
            </View>
          ) : null}
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery fee</Text>
            <Text style={styles.billFree}>Free</Text>
          </View>
          <View style={styles.billDivider} />
          <View style={styles.billRow}>
            <Text style={styles.billTotalLabel}>
              {order.status === OrderStatus.CANCELLED ? "Order total" : "Paid"}
            </Text>
            <Text style={styles.billTotalValue}>
              {formatCurrency(order.totalAmount)}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.homeButton}
          onPress={() => router.replace("/(customer)/(index)")}
        >
          <Text style={styles.homeButtonText}>Back to home</Text>
        </Pressable>
      </ScrollView>
      <PaymentSuccessCelebration
        amount={formatCurrency(order.totalAmount)}
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
  title: {
    color: brand.colors.light.ink,
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
    textAlign: "center",
  },
  liveHint: {
    color: brand.colors.light.primary,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10,
    marginTop: 2,
  },
  trackCard: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: 18,
    marginBottom: 12,
    padding: 16,
    ...brand.shadow,
  },
  trackHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  trackEyebrow: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  trackCount: {
    fontSize: 13,
    fontWeight: "900",
  },
  trackRail: {
    marginBottom: 16,
    paddingTop: 4,
    position: "relative",
  },
  trackRailTrack: {
    backgroundColor: brand.colors.light.border,
    borderRadius: 999,
    height: 3,
    left: 14,
    position: "absolute",
    right: 14,
    top: 14,
  },
  trackRailFill: {
    borderRadius: 999,
    height: 3,
    left: 14,
    position: "absolute",
    top: 14,
  },
  trackNodes: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  trackNode: {
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  trackDot: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: 14,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  trackDotDone: {
    backgroundColor: brand.colors.light.mint,
    borderColor: brand.colors.light.mint,
  },
  trackDotActive: {
    borderWidth: 2,
  },
  trackLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
  },
  trackLabelActive: {
    color: brand.colors.light.ink,
    fontWeight: "900",
  },
  nowCard: {
    alignItems: "center",
    backgroundColor: brand.colors.light.canvas,
    borderRadius: 14,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  nowIcon: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  nowCopy: {
    flex: 1,
  },
  nowTitle: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  nowDetail: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  livePill: {
    alignItems: "center",
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  liveDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  liveText: {
    fontSize: 11,
    fontWeight: "900",
  },
  cancelledBanner: {
    alignItems: "flex-start",
    backgroundColor: "#FFF0F2",
    borderRadius: 14,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  cancelledIcon: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  cancelledCopy: {
    flex: 1,
  },
  cancelledTitle: {
    color: brand.colors.light.danger,
    fontSize: 14,
    fontWeight: "900",
  },
  cancelledText: {
    color: "#944052",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  homeButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderRadius: 14,
    marginBottom: 8,
    marginTop: 4,
    minHeight: 52,
    justifyContent: "center",
  },
  homeButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  checkoutScroll: {
    padding: 16,
    paddingTop: 8,
  },
  checkoutBackText: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: "800",
  },
  checkoutEyebrow: {
    color: brand.colors.light.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  checkoutTitle: {
    color: brand.colors.light.ink,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6,
  },
  checkoutSubtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 18,
    marginTop: 6,
  },
  checkoutSection: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: 22,
    marginBottom: 12,
    padding: 16,
    ...brand.shadow,
  },
  checkoutSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  checkoutSectionTitle: {
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  checkoutAddress: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 22,
  },
  checkoutMeta: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12,
  },
  checkoutItemRow: {
    alignItems: "center",
    borderTopColor: brand.colors.light.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
  },
  checkoutQtyBadge: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 8,
    height: 28,
    justifyContent: "center",
    minWidth: 28,
    paddingHorizontal: 6,
  },
  checkoutQtyText: {
    color: brand.colors.light.primaryText,
    fontSize: 13,
    fontWeight: "900",
  },
  checkoutItemName: {
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  checkoutItemPrice: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  billRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  billLabel: {
    color: "#D8CBD2",
    fontSize: 14,
    fontWeight: "600",
  },
  billValue: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  billDiscountLabel: {
    color: brand.colors.light.mint,
    fontSize: 14,
    fontWeight: "700",
  },
  billDiscountValue: {
    color: brand.colors.light.mint,
    fontSize: 14,
    fontWeight: "800",
  },
  billFree: {
    color: brand.colors.light.mint,
    fontSize: 14,
    fontWeight: "800",
  },
  billDivider: {
    backgroundColor: "rgba(37,25,42,0.12)",
    height: StyleSheet.hairlineWidth,
    marginTop: 14,
  },
  billTotalLabel: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  billTotalValue: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  paymentMethodRow: {
    alignItems: "center",
    backgroundColor: "#FFF2ED",
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
    padding: 12,
  },
  paymentMethodIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    width: 68,
  },
  paymentCardVisual: {
    height: 48,
    width: 68,
  },
  paymentMethodCopy: {
    flex: 1,
  },
  paymentMethodTitle: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: "900",
  },
  paymentMethodHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  selectedPill: {
    backgroundColor: `${brand.colors.light.mint}22`,
    borderRadius: brand.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  selectedPillText: {
    color: brand.colors.light.mint,
    fontSize: 11,
    fontWeight: "900",
  },
  trustRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
  },
  trustText: {
    color: brand.colors.light.inkMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  payBar: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderTopColor: brand.colors.light.border,
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 12,
    left: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    position: "absolute",
    right: 0,
    ...brand.shadow,
  },
  payBarCopy: {
    flexShrink: 0,
  },
  payBarLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  payBarAmount: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 1,
  },
  payBarButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderRadius: 18,
    flex: 1,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 14,
  },
  payBarButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  payBarPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  payButtonContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
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
