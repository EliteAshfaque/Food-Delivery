import type { PropsWithChildren } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import {
  OrderStatus as ApiOrderStatus,
  type OrderStatus as ApiOrderStatusType,
} from "@food-delivery/types";

import { brand } from "@/constants/brand";
import {
  AppIcon,
  type AppIconName,
  type FoodIconName,
} from "./wasil-icon-system";

type IconButtonProps = {
  icon: AppIconName | FoodIconName;
  label: string;
  onPress?: () => void;
  selected?: boolean;
  destructive?: boolean;
};

/** Every icon-only control keeps a 44pt hit target and a screen-reader label. */
export function IconButton({
  icon,
  label,
  onPress,
  selected,
  destructive,
}: IconButtonProps) {
  const dark = useColorScheme() === "dark";
  const colors = dark ? brand.colors.dark : brand.colors.light;
  const color = destructive
    ? colors.danger
    : selected
      ? colors.primary
      : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        selected && { backgroundColor: colors.primarySoft },
        pressed && styles.pressed,
      ]}
    >
      <AppIcon name={icon} color={color} />
    </Pressable>
  );
}

export function CategoryTile({
  icon,
  title,
  onPress,
  selected = false,
}: {
  icon: FoodIconName;
  title: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} category`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.category, pressed && styles.pressed]}
    >
      <View
        style={[styles.categoryIcon, selected && styles.categoryIconSelected]}
      >
        <AppIcon
          name={icon}
          color={selected ? "#FFFFFF" : brand.colors.light.primary}
        />
      </View>
      <Text
        numberOfLines={1}
        style={[styles.categoryText, selected && styles.categoryTextSelected]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

const orderStatus = {
  [ApiOrderStatus.PENDING]: {
    icon: "orderPending",
    label: "Payment needed",
    color: brand.colors.light.warning,
  },
  [ApiOrderStatus.CONFIRMED]: {
    icon: "orderConfirmed",
    label: "Confirmed",
    color: brand.colors.light.primaryText,
  },
  [ApiOrderStatus.PREPARING]: {
    icon: "orderPreparing",
    label: "Preparing",
    color: brand.colors.light.warning,
  },
  [ApiOrderStatus.READY]: {
    icon: "orderReady",
    label: "Ready for pickup",
    color: brand.colors.light.mint,
  },
  [ApiOrderStatus.PICKED_UP]: {
    icon: "orderPickedUp",
    label: "On the way",
    color: brand.colors.light.mint,
  },
  [ApiOrderStatus.DELIVERED]: {
    icon: "orderCompleted",
    label: "Delivered",
    color: brand.colors.light.mint,
  },
  [ApiOrderStatus.CANCELLED]: {
    icon: "orderFailed",
    label: "Cancelled",
    color: brand.colors.light.danger,
  },
} as const satisfies Record<
  ApiOrderStatusType,
  { icon: AppIconName; label: string; color: string }
>;

export function OrderStatusChip({
  status,
  compact = false,
}: {
  status: ApiOrderStatusType;
  compact?: boolean;
}) {
  const item = orderStatus[status];

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Order status: ${item.label}`}
      style={[
        styles.status,
        compact && styles.statusCompact,
        { borderColor: `${item.color}33`, backgroundColor: `${item.color}14` },
      ]}
    >
      <AppIcon name={item.icon} size="sm" color={item.color} />
      <Text
        numberOfLines={1}
        style={[styles.statusText, { color: item.color }]}
      >
        {item.label}
      </Text>
    </View>
  );
}

export function Card({ children }: PropsWithChildren) {
  return <View style={styles.card}>{children}</View>;
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: "center",
    borderRadius: 14,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  selected: {
    backgroundColor: brand.colors.light.primarySoft,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  category: {
    alignItems: "center",
    gap: 8,
    width: 82,
  },
  categoryIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 18,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  categoryIconSelected: {
    backgroundColor: brand.colors.light.ink,
  },
  categoryText: {
    color: brand.colors.light.ink,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  categoryTextSelected: {
    color: brand.colors.light.ink,
    fontWeight: "900",
  },
  status: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
  },
  statusCompact: {
    minHeight: 30,
    paddingHorizontal: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "800",
  },
  card: {
    backgroundColor: brand.colors.light.surface,
    borderRadius: brand.radius.large,
    padding: 16,
    ...brand.shadow,
  },
});
