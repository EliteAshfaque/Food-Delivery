// Keep this as a plain object rather than a TypeScript enum. Node's native
// TypeScript "strip-only" loader cannot transform enums, but it can load this.
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  RESTAURANT_OWNER: 'RESTAURANT_OWNER',
  DRIVER: 'DRIVER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const AccountStatus = {
  ACTIVE: 'ACTIVE',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
} as const;

export type AccountStatus =
  (typeof AccountStatus)[keyof typeof AccountStatus];

export const RestaurantModerationStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
} as const;

export type RestaurantModerationStatus =
  (typeof RestaurantModerationStatus)[keyof typeof RestaurantModerationStatus];

export const OfferStatus = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  EXPIRED: 'EXPIRED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const OfferDiscountType = {
  PERCENTAGE: 'PERCENTAGE',
  FIXED_AMOUNT: 'FIXED_AMOUNT',
} as const;

export type OfferDiscountType =
  (typeof OfferDiscountType)[keyof typeof OfferDiscountType];

export interface User{
    id:string; 
    email:string;
    role:UserRole;
    accountStatus: AccountStatus;
    firstName:string;
    lastName:string;
    createdAt:Date;
}
export interface HealthCheckResponse{
    status:string; 
    timestamp:Date;

}
export interface JwtPayload{
    sub:string 
    email:string
    role:UserRole
}

export interface  Restaurant{
    id:string;
    name:string;
    ownerId:string;
    description:string|null;
    imageUrl:string|null;
    address:string;
    latitude: number | null;
    longitude: number | null;
    isOpen:boolean;
    moderationStatus: RestaurantModerationStatus;
    cuisineType:string;
    rating: number | string;
    createdAt:Date;
    updatedAt:Date;

}
export interface MenuCategory{
    id:string;
    name:string;
    restaurantId:string;
    createdAt:Date;
}
export interface MenuItem{
    id:string;
    name:string;
    description:string|null;
    price:string;
    imageUrl:string|null;
    restaurantId:string;
    categoryId:string;
    isAvailable:boolean;
    createdAt:Date;
    updatedAt:Date;
}
export interface RestaurantWithMenu {
    restaurant: Restaurant;
    categories: MenuCategory[];
    items: MenuItem[];
}
export const OrderStatus = {
    PENDING: 'PENDING',
    CONFIRMED: 'CONFIRMED',
    PREPARING: 'PREPARING', 
    READY: 'READY',
    PICKED_UP: 'PICKED_UP',
    DELIVERED: 'DELIVERED',
    CANCELLED: 'CANCELLED',
  } as const;

  export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];
  export interface CartItem {
    id: string; // menuItem id
    name: string;
    price: string;
    imageUrl: string | null;
    restaurantId: string;
    restaurantName: string;
    quantity: number;
}
export interface OrderItem {
    id: string;
    orderId: string;
    menuItemId: string;
    quantity: number;
    price: string;
    createdAt: Date;
}

export interface Order {
    id: string;
    customerId: string;
    restaurantId: string;
    driverId: string | null;
    status: OrderStatus;
    subtotalAmount: string;
    discountAmount: string;
    offerId: string | null;
    totalAmount: string;
    deliveryAddress: string;
    deliveryLatitude: number | null;
    deliveryLongitude: number | null;
    stripePaymentIntentId: string | null;
    stripeRefundId: string | null;
    cancellationRequestedAt: Date | null;
    cancellationReason: string | null;
    cancelledAt: Date | null;
    refundedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface Review {
    id: string;
    customerId: string;
    restaurantId: string;
    orderId: string;
    driverId: string | null;
    restaurantRating: number;
    driverRating: number | null;
    comment: string | null;
    createdAt: Date;
}

export interface RestaurantReview {
    id: string;
    restaurantRating: number;
    driverRating: number | null;
    comment: string | null;
    createdAt: Date;
    customerFirstName: string;
    customerLastName: string;
}
