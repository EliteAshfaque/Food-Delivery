import type {
  AccountStatus,
  OfferDiscountType,
  OfferStatus,
  OrderStatus,
  RestaurantModerationStatus,
  UserRole,
} from '@food-delivery/types';

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = {
  items: T[];
  pagination: Pagination;
};

export type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: UserRole;
  accountStatus: AccountStatus;
  accountStatusReason: string | null;
  accountStatusUpdatedAt: string;
  isOnline: boolean;
  createdAt: string;
};

export type AdminRestaurant = {
  restaurant: {
    id: string;
    name: string;
    address: string;
    cuisineType: string | null;
    isOpen: boolean;
    moderationStatus: RestaurantModerationStatus;
    moderationNote: string | null;
    createdAt: string;
  };
  owner: Pick<
    AdminUser,
    'id' | 'firstName' | 'lastName' | 'email' | 'role' | 'accountStatus'
  >;
};

export type AdminOrder = {
  id: string;
  status: OrderStatus;
  totalAmount: string;
  subtotalAmount?: string;
  discountAmount?: string;
  deliveryAddress: string;
  createdAt: string;
  restaurant: { id: string; name: string } | null;
  customer: Pick<AdminUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  driver: Pick<AdminUser, 'id' | 'firstName' | 'lastName' | 'email'> | null;
  cancellationRequestedAt?: string | null;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  refundedAt?: string | null;
  stripeRefundId?: string | null;
};

export type AdminOffer = {
  id: string;
  title: string;
  code: string | null;
  discountType: OfferDiscountType;
  discountValue: string;
  status: OfferStatus;
  effectiveStatus: OfferStatus;
  isFeatured: boolean;
  sortOrder: number;
  usageLimit: number | null;
  usageCount: number;
  startsAt: string;
  endsAt: string;
  restaurant: {
    id: string;
    name: string;
    moderationStatus: RestaurantModerationStatus;
  };
};

export type AdminAuditLog = {
  log: {
    id: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  };
  actor: Pick<AdminUser, 'id' | 'firstName' | 'lastName' | 'email'>;
};

export type AdminDashboard = {
  generatedAt: string;
  users: {
    byRole: Partial<Record<UserRole, number>>;
    byAccountStatus: Partial<Record<AccountStatus, number>>;
    pendingApproval: number;
  };
  restaurants: {
    byModerationStatus: Partial<Record<RestaurantModerationStatus, number>>;
    pendingApproval: number;
  };
  orders: {
    byStatus: Partial<Record<OrderStatus, number>>;
    completedRevenue: string;
  };
};
