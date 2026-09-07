import type { ComponentProps } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { brand } from "@/constants/brand";

type MaterialCommunityIconName = ComponentProps<
  typeof MaterialCommunityIcons
>["name"];

/**
 * One semantic icon vocabulary for Wasil. Screens ask for `orderReady` or
 * `deliveryRider`, not a library-specific glyph, so the visual language can be
 * changed centrally later.
 */
export const appIcons = {
  home: "home-outline",
  search: "magnify",
  favorites: "heart-outline",
  cart: "cart-outline",
  profile: "account-outline",
  menu: "menu",
  back: "arrow-left",
  close: "close",
  more: "dots-horizontal",
  notifications: "bell-outline",
  restaurant: "storefront-outline",
  restaurantLocation: "map-marker-outline",
  rating: "star-outline",
  reviews: "message-text-outline",
  deliveryTime: "clock-outline",
  distance: "map-marker-distance",
  openingHours: "calendar-clock",
  verifiedRestaurant: "check-decagram-outline",
  favoriteRestaurant: "heart-outline",
  addFood: "hamburger-plus",
  removeFood: "hamburger-minus",
  increaseQuantity: "plus-circle-outline",
  decreaseQuantity: "minus-circle-outline",
  customizeFood: "tune-variant",
  vegetarian: "leaf",
  nonVegetarian: "food-drumstick-outline",
  spicy: "chili-hot-outline",
  popular: "fire",
  recommended: "thumb-up-outline",
  shoppingCart: "cart-outline",
  addToCart: "cart-plus",
  removeFromCart: "cart-remove",
  orderHistory: "history",
  orderDetails: "receipt-text-outline",
  reorder: "repeat",
  cancelOrder: "close-circle-outline",
  orderConfirmed: "check-circle-outline",
  orderPending: "clock-alert-outline",
  orderPreparing: "chef-hat",
  orderReady: "package-variant-closed-check",
  orderPickedUp: "bike-fast",
  orderCompleted: "check-circle",
  orderFailed: "alert-circle-outline",
  deliveryRider: "bike-fast",
  scooter: "scooter",
  car: "car-outline",
  pickupLocation: "map-marker-up",
  deliveryLocation: "map-marker-down",
  currentLocation: "crosshairs-gps",
  map: "map-outline",
  navigation: "navigation-variant-outline",
  estimatedDeliveryTime: "clock-fast",
  callDriver: "phone-outline",
  chatWithDriver: "message-text-outline",
  creditCard: "credit-card-outline",
  debitCard: "credit-card-outline",
  cashOnDelivery: "cash",
  wallet: "wallet-outline",
  coupon: "ticket-percent-outline",
  discount: "tag-outline",
  paymentSuccessful: "check-circle-outline",
  paymentFailed: "alert-circle-outline",
  refund: "cash-refund",
  invoice: "file-document-outline",
  personalInformation: "card-account-details-outline",
  camera: "camera-outline",
  addresses: "map-marker-outline",
  addAddress: "map-marker-plus-outline",
  editAddress: "map-marker-radius-outline",
  deleteAddress: "map-marker-remove-outline",
  paymentMethods: "credit-card-outline",
  orders: "receipt-text-outline",
  settings: "cog-outline",
  helpSupport: "help-circle-outline",
  privacy: "shield-lock-outline",
  logout: "logout",
  plus: "plus",
  minus: "minus",
  edit: "pencil-outline",
  delete: "trash-can-outline",
  save: "content-save-outline",
  share: "share-variant-outline",
  copy: "content-copy",
  filter: "filter-variant",
  sort: "sort-variant",
  refresh: "refresh",
  calendar: "calendar-blank-outline",
  clock: "clock-outline",
  location: "map-marker-outline",
  phone: "phone-outline",
  email: "email-outline",
  lock: "lock-outline",
  eye: "eye-outline",
  eyeOff: "eye-off-outline",
  check: "check",
  warning: "alert-outline",
  error: "alert-circle-outline",
  information: "information-outline",
  loading: "loading",
} as const satisfies Record<string, MaterialCommunityIconName>;

export const foodIcons = {
  burgers: "hamburger",
  pizza: "pizza",
  asian: "noodles",
  coffee: "coffee-outline",
  sweets: "cupcake",
  healthy: "food-apple-outline",
  arabic: "silverware-fork-knife",
  indian: "food-variant",
} as const satisfies Record<string, MaterialCommunityIconName>;

export type AppIconName = keyof typeof appIcons;
export type FoodIconName = keyof typeof foodIcons;
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const iconSizes: Record<IconSize, number> = {
  xs: 14,
  sm: 18,
  md: 24,
  lg: 30,
  xl: 44,
};

type AppIconProps = Omit<
  ComponentProps<typeof MaterialCommunityIcons>,
  "name" | "size" | "color"
> & {
  name: AppIconName | FoodIconName;
  size?: IconSize | number;
  color?: string;
};

export function AppIcon({
  name,
  size = "md",
  color = brand.colors.light.ink,
  ...props
}: AppIconProps) {
  const iconName =
    (appIcons as Record<string, string>)[name] ??
    (foodIcons as Record<string, string>)[name];
  const resolvedSize = typeof size === "number" ? size : iconSizes[size];

  return (
    <MaterialCommunityIcons
      {...props}
      name={iconName as ComponentProps<typeof MaterialCommunityIcons>["name"]}
      size={resolvedSize}
      color={color}
    />
  );
}

export const iconTokens = {
  size: iconSizes,
  color: brand.colors,
} as const;
