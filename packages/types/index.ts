// Keep this as a plain object rather than a TypeScript enum. Node's native
// TypeScript "strip-only" loader cannot transform enums, but it can load this.
export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  RESTAURANT_OWNER: 'RESTAURANT_OWNER',
  DRIVER: 'DRIVER',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export interface User{
    id:string; 
    email:string;
    role:UserRole;
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
    role:string
     

}

export interface  Restaurant{
    id:string;
    name:string;
    ownerId:string;
    description:string|null;
    imageUrl:string|null;
    address:string;
    isOpen:boolean;
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
    unitPrice: string;
    createdAt: Date;
}