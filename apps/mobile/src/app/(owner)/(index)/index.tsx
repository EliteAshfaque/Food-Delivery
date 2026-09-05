import { useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { api } from "@/lib/axios";
import { getApiErrorMessage } from "@/lib/api-error";
import { formatCurrency } from "@/lib/format";
import {
  useRestaurantDriverLocation,
  useRestaurantSocket,
} from "@/hooks/user-order.socket";
import { OrderTrackingMap } from "@/components/order-tracking-map";
import {
  OrderStatus,
  type OrderStatus as OrderStatusType,
  type Restaurant,
} from "@food-delivery/types";

type OwnerOrder = {
  id: string;
  customerId: string;
  restaurantId: string;
  status: OrderStatusType;
  totalAmount: string;
  deliveryAddress: string;
  createdAt: string;
  updatedAt: string;
};

type StatusAction = {
  label: string;
  status: OrderStatusType;
  tone: "primary" | "danger";
};

type DriverAvailability = {
  available: boolean;
  availableDrivers: number;
};

function formatPrice(price: string) {
  const value = Number.parseFloat(price);
  if (Number.isNaN(value)) return price;
  return formatCurrency(value);
}

function formatStatus(status: OrderStatusType) {
  return status.replaceAll("_", " ");
}

function formatTime(iso: string) {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusBadgeStyle(status: OrderStatusType) {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return styles.badgeConfirmed;
    case OrderStatus.PREPARING:
      return styles.badgePreparing;
    case OrderStatus.READY:
      return styles.badgeReady;
    case OrderStatus.CANCELLED:
      return styles.badgeCancelled;
    case OrderStatus.DELIVERED:
      return styles.badgeDelivered;
    case OrderStatus.PENDING:
      return styles.badgePending;
    default:
      return styles.badgeActive;
  }
}

function getOwnerActions(status: OrderStatusType): StatusAction[] {
  switch (status) {
    case OrderStatus.CONFIRMED:
      return [
        {
          label: "Start preparing",
          status: OrderStatus.PREPARING,
          tone: "primary",
        },
        { label: "Cancel", status: OrderStatus.CANCELLED, tone: "danger" },
      ];
    case OrderStatus.PREPARING:
      return [
        { label: "Mark ready", status: OrderStatus.READY, tone: "primary" },
        { label: "Cancel", status: OrderStatus.CANCELLED, tone: "danger" },
      ];
    default:
      return [];
  }
}

function isActiveOrder(status: OrderStatusType) {
  return (
    status === OrderStatus.CONFIRMED ||
    status === OrderStatus.PREPARING ||
    status === OrderStatus.READY ||
    status === OrderStatus.PENDING
  );
}

function sortOrders(orders: OwnerOrder[]) {
  const priority: Record<OrderStatusType, number> = {
    [OrderStatus.CONFIRMED]: 0,
    [OrderStatus.PREPARING]: 1,
    [OrderStatus.READY]: 2,
    [OrderStatus.PENDING]: 3,
    [OrderStatus.PICKED_UP]: 4,
    [OrderStatus.DELIVERED]: 5,
    [OrderStatus.CANCELLED]: 6,
  };

  return [...orders].sort((a, b) => {
    const byPriority = priority[a.status] - priority[b.status];
    if (byPriority !== 0) return byPriority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export default function OwnerHomeScreen() {
  const queryClient = useQueryClient();

  const {
    data: restaurant,
    isLoading,
    isFetching,
  } = useQuery<Restaurant | null>({
    queryKey: ["my-restaurants"],
    queryFn: () => api.get("/restaurants/mine").then((res) => res.data),
  });

  const restaurantOrderUpdate = useRestaurantSocket<OwnerOrder>(
    restaurant?.id ?? null,
  );
  const approachingDriverLocation = useRestaurantDriverLocation(
    restaurant?.id ?? null,
  );

  const {
    data: orders = [],
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    refetch: refetchOrders,
  } = useQuery<OwnerOrder[]>({
    queryKey: ["restaurant-orders", restaurant?.id],
    queryFn: () =>
      api
        .get<OwnerOrder[]>(`/orders/restaurant/${restaurant!.id}`)
        .then((res) => res.data),
    enabled: !!restaurant?.id,
    refetchInterval: 15000,
  });

  const { data: driverAvailability, isLoading: availabilityLoading } =
    useQuery<DriverAvailability>({
      queryKey: ["driver-availability"],
      queryFn: () =>
        api.get("/orders/driver-availability").then((res) => res.data),
      refetchInterval: 10000,
    });

  useEffect(() => {
    if (!restaurantOrderUpdate || !restaurant?.id) return;

    queryClient.setQueryData<OwnerOrder[]>(
      ["restaurant-orders", restaurant.id],
      (current) => {
        if (!current) return current;

        const existing = current.some(
          (order) => order.id === restaurantOrderUpdate.id,
        );
        if (!existing) {
          return [restaurantOrderUpdate, ...current];
        }

        return current.map((order) =>
          order.id === restaurantOrderUpdate.id
            ? { ...order, ...restaurantOrderUpdate }
            : order,
        );
      },
    );
  }, [queryClient, restaurant?.id, restaurantOrderUpdate]);

  const { mutate: toggleOpen, isPending: togglingOpen } = useMutation({
    mutationFn: () =>
      api
        .patch(`/restaurants/${restaurant?.id}`, {
          isOpen: !restaurant?.isOpen,
        })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-restaurants"] });
    },
    onError: (error) => {
      Alert.alert("Could not update restaurant", getApiErrorMessage(error));
    },
  });

  const {
    mutate: updateStatus,
    isPending: updatingStatus,
    variables: updatingOrder,
  } = useMutation({
    mutationFn: ({
      orderId,
      status,
    }: {
      orderId: string;
      status: OrderStatusType;
    }) =>
      api
        .patch(`/orders/${orderId}/status`, { status })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["restaurant-orders", restaurant?.id],
      });
    },
    onError: (error) => {
      Alert.alert("Could not update order", getApiErrorMessage(error));
    },
  });

  useEffect(() => {
    if (isLoading || isFetching) return;
    if (!restaurant) {
      router.replace("/(owner)/(index)/create-restaurant");
    }
  }, [restaurant, isLoading, isFetching]);

  function handleStatusAction(orderId: string, action: StatusAction) {
    if (action.status === OrderStatus.CANCELLED) {
      Alert.alert(
        "Cancel order",
        "Are you sure you want to cancel this order?",
        [
          { text: "Keep order", style: "cancel" },
          {
            text: "Cancel order",
            style: "destructive",
            onPress: () => updateStatus({ orderId, status: action.status }),
          },
        ],
      );
      return;
    }

    updateStatus({ orderId, status: action.status });
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const sortedOrders = sortOrders(orders);
  const activeCount = orders.filter((order) =>
    isActiveOrder(order.status),
  ).length;
  const driverHeadingToPickup = orders.some(
    (order) => order.status === OrderStatus.READY,
  );
  const restaurantCoordinates =
    restaurant?.latitude != null && restaurant.longitude != null
      ? { latitude: restaurant.latitude, longitude: restaurant.longitude }
      : null;

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedOrders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={ordersFetching && !ordersLoading}
            onRefresh={() => void refetchOrders()}
            tintColor="#FF6B35"
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.greeting}>Owner dashboard</Text>
            <Text style={styles.name}>{restaurant?.name}</Text>

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{activeCount}</Text>
                <Text style={styles.statLabel}>Active orders</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{orders.length}</Text>
                <Text style={styles.statLabel}>Total today</Text>
              </View>
            </View>

            <Pressable
              style={[
                styles.toggleButton,
                restaurant?.isOpen ? styles.open : styles.closed,
                togglingOpen && styles.buttonDisabled,
              ]}
              onPress={() => toggleOpen()}
              disabled={togglingOpen}
            >
              {togglingOpen ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.toggleText}>
                  {restaurant?.isOpen
                    ? "Open — tap to close"
                    : "Closed — tap to open"}
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.editButton}
              onPress={() => router.push("/(owner)/(index)/update-restaurant")}
            >
              <Text style={styles.editButtonText}>Edit restaurant</Text>
            </Pressable>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Orders</Text>
              {ordersFetching && !ordersLoading ? (
                <ActivityIndicator size="small" color="#FF6B35" />
              ) : null}
            </View>
            <View
              style={[
                styles.driverAvailability,
                driverAvailability?.available
                  ? styles.driverAvailable
                  : styles.driverUnavailable,
              ]}
            >
              <Text style={styles.driverAvailabilityText}>
                {availabilityLoading
                  ? "Checking delivery drivers…"
                  : driverAvailability?.available
                    ? `${driverAvailability.availableDrivers} driver${driverAvailability.availableDrivers === 1 ? "" : "s"} available`
                    : "No delivery drivers available — keep orders preparing"}
              </Text>
            </View>
            {driverHeadingToPickup &&
            restaurantCoordinates &&
            approachingDriverLocation ? (
              <View style={styles.driverMapCard}>
                <Text style={styles.driverMapTitle}>Driver approaching pickup</Text>
                <Text style={styles.driverMapHint}>
                  Live location shared by the driver
                </Text>
                <OrderTrackingMap
                  delivery={restaurantCoordinates}
                  destinationTitle={restaurant?.name ?? "Restaurant"}
                  destinationDescription="Restaurant pickup point"
                  driver={approachingDriverLocation}
                  live
                />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          ordersLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#FF6B35" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyTitle}>No orders yet</Text>
              <Text style={styles.emptySubtitle}>
                New orders will appear here once customers place and pay.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const actions = getOwnerActions(item.status);
          const isUpdating =
            updatingStatus && updatingOrder?.orderId === item.id;

          return (
            <View style={styles.orderCard}>
              <View style={styles.orderTopRow}>
                <View>
                  <Text style={styles.orderId}>
                    Order #{item.id.slice(0, 8)}
                  </Text>
                  <Text style={styles.orderTime}>
                    {formatTime(item.createdAt)}
                  </Text>
                </View>
                <View
                  style={[styles.statusBadge, statusBadgeStyle(item.status)]}
                >
                  <Text style={styles.statusBadgeText}>
                    {formatStatus(item.status)}
                  </Text>
                </View>
              </View>

              <Text style={styles.orderAddress} numberOfLines={2}>
                {item.deliveryAddress}
              </Text>

              <Text style={styles.orderTotal}>
                {formatPrice(item.totalAmount)}
              </Text>

              {actions.length > 0 ? (
                <View style={styles.actionsRow}>
                  {actions.map((action) => {
                      const requiresDriver = action.status === OrderStatus.READY;
                      const unavailable =
                        requiresDriver &&
                        (availabilityLoading || !driverAvailability?.available);

                      return (
                        <Pressable
                          key={action.status}
                          style={[
                            styles.actionButton,
                            action.tone === "primary"
                              ? styles.actionPrimary
                              : styles.actionDanger,
                            (isUpdating || unavailable) && styles.buttonDisabled,
                          ]}
                          onPress={() => handleStatusAction(item.id, action)}
                          disabled={isUpdating || unavailable}
                        >
                          {isUpdating ? (
                            <ActivityIndicator
                              color={action.tone === "primary" ? "#fff" : "#DC2626"}
                              size="small"
                            />
                          ) : (
                            <Text
                              style={[
                                styles.actionText,
                                action.tone === "primary"
                                  ? styles.actionTextPrimary
                                  : styles.actionTextDanger,
                              ]}
                            >
                              {action.label}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                </View>
              ) : (
                <Text style={styles.noActionText}>
                  {item.status === OrderStatus.READY
                    ? "Waiting for driver pickup"
                    : item.status === OrderStatus.PENDING
                      ? "Waiting for customer payment"
                      : "No action needed"}
                </Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F8F8",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 8,
  },
  greeting: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  name: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111",
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#EEE",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FF6B35",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: "#666",
  },
  toggleButton: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  open: {
    backgroundColor: "#22C55E",
  },
  closed: {
    backgroundColor: "#EF4444",
  },
  toggleText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  editButton: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
    marginBottom: 24,
  },
  editButtonText: {
    color: "#111",
    fontWeight: "600",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111",
  },
  driverAvailability: {
    borderRadius: 10,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  driverAvailable: {
    backgroundColor: "#DCFCE7",
  },
  driverUnavailable: {
    backgroundColor: "#FEF3C7",
  },
  driverAvailabilityText: {
    color: "#444",
    fontSize: 13,
    fontWeight: "600",
  },
  driverMapCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#EEE",
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
    padding: 12,
  },
  driverMapTitle: { color: "#111", fontSize: 16, fontWeight: "800" },
  driverMapHint: { color: "#666", fontSize: 13, marginBottom: 10, marginTop: 3 },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  orderCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#EEE",
  },
  orderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  orderId: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  orderTime: {
    fontSize: 13,
    color: "#888",
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111",
    textTransform: "capitalize",
  },
  badgeConfirmed: { backgroundColor: "#DCFCE7" },
  badgePreparing: { backgroundColor: "#FEF3C7" },
  badgeReady: { backgroundColor: "#DBEAFE" },
  badgeCancelled: { backgroundColor: "#FEE2E2" },
  badgeDelivered: { backgroundColor: "#E5E7EB" },
  badgePending: { backgroundColor: "#FEF9C3" },
  badgeActive: { backgroundColor: "#F3F4F6" },
  orderAddress: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
    marginBottom: 10,
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FF6B35",
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  actionPrimary: {
    backgroundColor: "#FF6B35",
  },
  actionDanger: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  actionText: {
    fontWeight: "600",
    fontSize: 14,
  },
  actionTextPrimary: {
    color: "#fff",
  },
  actionTextDanger: {
    color: "#DC2626",
  },
  noActionText: {
    fontSize: 13,
    color: "#888",
    fontStyle: "italic",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
