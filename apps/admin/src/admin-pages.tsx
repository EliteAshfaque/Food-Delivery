import { type FormEvent, useCallback, useMemo, useState } from 'react';

import {
  CreateOfferDialog,
  CreateRestaurantDialog,
  CreateUserDialog,
  EditRestaurantDialog,
  ManageCategoriesDialog,
  OfferRedemptionsDialog,
} from './admin-create-forms';
import type { AdminRequest } from './api';
import { queryString } from './api';
import type {
  AccountStatus,
  AdminAuditLog,
  AdminDashboard,
  AdminOffer,
  AdminOrder,
  AdminRestaurant,
  AdminUser,
  AuthUser,
  OfferStatus,
  OrderStatus,
  Paginated,
  RestaurantModerationStatus,
  UserRole,
} from './domain';
import { useRemote } from './hooks';
import {
  ActionDialog,
  EmptyState,
  ErrorPanel,
  formatCurrency,
  formatDate,
  formatDateTime,
  fullName,
  getErrorMessage,
  humanize,
  LoadingPanel,
  Notice,
  PageHeader,
  Pagination,
  statusLabel,
  StatusPill,
  StatusSelect,
} from './ui';

export type PortalView =
  | 'dashboard'
  | 'operations'
  | 'notifications'
  | 'users'
  | 'restaurants'
  | 'orders'
  | 'offers'
  | 'audit';

export type PageProps = {
  request: AdminRequest;
  currentUser: AuthUser;
  navigate: (view: PortalView) => void;
};

type NoticeState = { type: 'success' | 'error'; message: string } | null;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function PageNotice({
  notice,
  clear,
}: {
  notice: NoticeState;
  clear: () => void;
}) {
  return notice ? <Notice onDismiss={clear} type={notice.type}>{notice.message}</Notice> : null;
}

function RefreshButton({ onClick, busy = false }: { onClick: () => void; busy?: boolean }) {
  return (
    <button className="button button--secondary" disabled={busy} onClick={onClick} type="button">
      <span aria-hidden="true">↻</span> {busy ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'success';
}) {
  return (
    <article className={`metric-card metric-card--${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function pendingOrderCount(dashboard: AdminDashboard) {
  return Object.entries(dashboard.orders.byStatus)
    .filter(([status]) => !['DELIVERED', 'CANCELLED'].includes(status))
    .reduce((sum, [, value]) => sum + Number(value ?? 0), 0);
}

export function DashboardPage({ request, navigate }: PageProps) {
  const dashboardLoader = useCallback(
    () => request<AdminDashboard>('/admin/dashboard'),
    [request],
  );
  const auditLoader = useCallback(
    () => request<Paginated<AdminAuditLog>>('/admin/audit-logs?pageSize=5'),
    [request],
  );
  const dashboard = useRemote(dashboardLoader, 30_000);
  const audit = useRemote(auditLoader, 30_000);

  const refresh = () => {
    dashboard.reload();
    audit.reload();
  };

  if (dashboard.loading && audit.loading) {
    return <LoadingPanel label="Loading your operations snapshot…" />;
  }

  if (!dashboard.data || !audit.data) {
    return <ErrorPanel error={dashboard.error ?? audit.error} onRetry={refresh} />;
  }

  const activeOrders = pendingOrderCount(dashboard.data);
  const pendingAccounts = dashboard.data.users.pendingApproval;
  const pendingRestaurants = dashboard.data.restaurants.pendingApproval;

  return (
    <>
      <PageHeader
        actions={<RefreshButton busy={dashboard.refreshing || audit.refreshing} onClick={refresh} />}
        description="See what needs attention across people, partners, fulfilment, and campaigns."
        eyebrow="OPERATIONS CONTROL"
        title="Command center"
      />
      <section className="revenue-banner">
        <div>
          <p className="eyebrow">DELIVERED ORDER REVENUE</p>
          <strong>{formatCurrency(dashboard.data.orders.completedRevenue)}</strong>
          <p>Live totals · refreshed {formatDateTime(dashboard.data.generatedAt)}</p>
        </div>
        <div className="revenue-banner__glow" aria-hidden="true" />
      </section>
      <section className="metric-grid" aria-label="Operations metrics">
        <MetricCard detail="Orders not yet completed" label="Open orders" tone="accent" value={activeOrders} />
        <MetricCard detail="Drivers and owners needing a decision" label="Pending people" tone="warning" value={pendingAccounts} />
        <MetricCard detail="Partner stores awaiting moderation" label="Pending stores" tone="warning" value={pendingRestaurants} />
        <MetricCard detail="Active customer accounts" label="Customers" tone="success" value={dashboard.data.users.byRole.CUSTOMER ?? 0} />
      </section>
      <section className="priority-grid" aria-label="Priority actions">
        <button className="priority-card priority-card--accounts" onClick={() => navigate('users')} type="button">
          <span aria-hidden="true">◌</span>
          <div><strong>{pendingAccounts} accounts need review</strong><p>Approve, suspend, or set safe access roles.</p></div>
          <b aria-hidden="true">→</b>
        </button>
        <button className="priority-card priority-card--restaurants" onClick={() => navigate('restaurants')} type="button">
          <span aria-hidden="true">⌂</span>
          <div><strong>{pendingRestaurants} restaurants need review</strong><p>Check owner status before approving a partner.</p></div>
          <b aria-hidden="true">→</b>
        </button>
      </section>
      <section className="content-card audit-preview">
        <div className="section-heading">
          <div><p className="eyebrow">SECURITY TRAIL</p><h2>Recent admin activity</h2></div>
          <button className="text-button" onClick={() => navigate('audit')} type="button">View audit log →</button>
        </div>
        {audit.data.items.length === 0 ? (
          <EmptyState detail="Privileged actions will appear here as soon as operations begins." title="No activity yet" />
        ) : (
          <div className="audit-list">
            {audit.data.items.map(({ actor, log }) => (
              <article className="audit-row" key={log.id}>
                <span className="audit-row__mark" aria-hidden="true">✓</span>
                <div><strong>{humanize(log.action)}</strong><p>{fullName(actor)} · {humanize(log.targetType)}</p></div>
                <time dateTime={log.createdAt}>{formatDateTime(log.createdAt)}</time>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

const accountFilters: Array<{ label: string; value: AccountStatus | 'ALL' }> = [
  { label: 'All accounts', value: 'ALL' },
  { label: 'Pending', value: 'PENDING_APPROVAL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Suspended', value: 'SUSPENDED' },
  { label: 'Rejected', value: 'REJECTED' },
];

type UserAction =
  | { kind: 'status'; user: AdminUser; status: AccountStatus }
  | { kind: 'role'; user: AdminUser; role: UserRole };

function roleOptions() {
  return ['CUSTOMER', 'RESTAURANT_OWNER', 'DRIVER', 'ADMIN'] as UserRole[];
}

export function UsersPage({ request, currentUser }: PageProps) {
  const [filter, setFilter] = useState<AccountStatus | 'ALL'>('ALL');
  const [role, setRole] = useState<UserRole | 'ALL'>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<UserAction | null>(null);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  const usersUrl = useMemo(
    () => `/admin/users${queryString({
      accountStatus: filter === 'ALL' ? undefined : filter,
      page,
      pageSize: 25,
      role: role === 'ALL' ? undefined : role,
      search: search || undefined,
    })}`,
    [filter, page, role, search],
  );
  const loader = useCallback(
    () => request<Paginated<AdminUser>>(usersUrl),
    [request, usersUrl],
  );
  const users = useRemote(loader);

  function changeFilter(next: AccountStatus | 'ALL') {
    setFilter(next);
    setPage(1);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  async function updateUser(id: string, payload: Record<string, string>) {
    await request<AdminUser>(`/admin/users/${id}`, { method: 'PATCH', body: payload });
    setAction(null);
    setNotice({ type: 'success', message: 'Account updated. The access change takes effect immediately.' });
    users.reload();
  }

  const data = users.data;
  return (
    <>
      <PageHeader
        actions={
          <div className="header-actions">
            <button className="button button--primary" onClick={() => setCreating(true)} type="button">
              Create account
            </button>
            <RefreshButton busy={users.refreshing} onClick={users.reload} />
          </div>
        }
        description="Create accounts, approve operational access, and keep delivery roles healthy."
        eyebrow="ACCOUNT SAFETY"
        title="People & access"
      />
      <PageNotice clear={() => setNotice(null)} notice={notice} />
      <section className="toolbar content-card">
        <form className="search-form" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="user-search">Search accounts</label>
          <input id="user-search" maxLength={100} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name or email" value={searchInput} />
          <button className="button button--secondary" type="submit">Search</button>
        </form>
        <label className="select-field">Role
          <select onChange={(event) => { setRole(event.target.value as UserRole | 'ALL'); setPage(1); }} value={role}>
            <option value="ALL">All roles</option>
            {roleOptions().map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </select>
        </label>
      </section>
      <div className="filter-row" aria-label="Account status filter">
        {accountFilters.map((item) => <button className={`filter-pill ${filter === item.value ? 'filter-pill--active' : ''}`} key={item.value} onClick={() => changeFilter(item.value)} type="button">{item.label}</button>)}
      </div>
      {users.loading ? <LoadingPanel label="Loading accounts…" /> : null}
      {!users.loading && users.error && !data ? <ErrorPanel error={users.error} onRetry={users.reload} /> : null}
      {data ? (
        <section className="content-card table-card">
          <div className="table-card__header"><span>{data.pagination.total.toLocaleString()} account{data.pagination.total === 1 ? '' : 's'}</span>{users.error ? <span className="subtle-error">Showing last loaded results. {getErrorMessage(users.error)}</span> : null}</div>
          {data.items.length === 0 ? <EmptyState detail="Try another status, role, or search term." title="No accounts found" /> : (
            <div className="table-scroll"><table>
              <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{data.items.map((user) => {
                const self = user.id === currentUser.id;
                return <tr key={user.id}>
                  <td data-label="Account"><div className="person-cell"><span className="avatar" aria-hidden="true">{user.firstName.charAt(0).toUpperCase() || '?'}</span><div><strong>{fullName(user)}</strong><small>{user.email ?? 'No email on record'}</small>{user.accountStatusReason ? <small className="reason-text">{user.accountStatusReason}</small> : null}</div></div></td>
                  <td data-label="Role">{humanize(user.role)}{user.role === 'DRIVER' ? <small className={user.isOnline ? 'online-text' : ''}>{user.isOnline ? 'Online' : 'Offline'}</small> : null}</td>
                  <td data-label="Status"><StatusPill status={user.accountStatus} /></td>
                  <td data-label="Joined">{formatDate(user.createdAt)}</td>
                  <td className="actions-cell" data-label="Actions">
                    {self ? (
                      <span className="protected-copy">Your account</span>
                    ) : (
                      <div className="action-menu">
                        <StatusSelect
                          label="Account status"
                          onChange={(status) =>
                            setAction({
                              kind: 'status',
                              user,
                              status: status as AccountStatus,
                            })
                          }
                          options={[
                            { value: 'ACTIVE', label: 'Active' },
                            { value: 'PENDING_APPROVAL', label: 'Pending' },
                            { value: 'SUSPENDED', label: 'Suspended' },
                            { value: 'REJECTED', label: 'Rejected' },
                          ]}
                          value={user.accountStatus}
                        />
                        <button
                          className="button button--small button--secondary"
                          onClick={() =>
                            setAction({
                              kind: 'role',
                              user,
                              role: user.role === 'ADMIN' ? 'CUSTOMER' : user.role,
                            })
                          }
                          type="button">
                          {user.role === 'ADMIN' ? 'Remove admin' : 'Role'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>;
              })}</tbody>
            </table></div>
          )}
          <Pagination onPageChange={setPage} pagination={data.pagination} />
        </section>
      ) : null}
      {action?.kind === 'status' ? <ActionDialog
        confirmLabel={statusLabel(action.status)}
        danger={action.status !== 'ACTIVE'}
        description={`${fullName(action.user)} will become ${statusLabel(action.status).toLowerCase()}.`}
        onClose={() => setAction(null)}
        onConfirm={(reason) => updateUser(action.user.id, {
          accountStatus: action.status,
          ...(reason ? { accountStatusReason: reason } : {}),
        })}
        reasonLabel="Reason"
        reasonPlaceholder={action.status === 'ACTIVE' ? 'Optional note' : 'Why is this account changing?'}
        reasonRequired={action.status === 'SUSPENDED' || action.status === 'REJECTED'}
        title={`${statusLabel(action.status)} account`}
      /> : null}
      {action?.kind === 'role' ? <ActionDialog
        confirmLabel="Save role"
        danger={action.role === 'ADMIN' || action.user.role === 'ADMIN'}
        description="Role changes alter what this person can access."
        onClose={() => setAction(null)}
        onConfirm={() => updateUser(action.user.id, { role: action.role })}
        reasonPlaceholder=""
        title={`Change ${fullName(action.user)}’s role?`}
      >
        <label className="field">New role
          <select onChange={(event) => setAction((current) => current?.kind === 'role' ? { ...current, role: event.target.value as UserRole } : current)} value={action.role}>
            {roleOptions().map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </select>
        </label>
      </ActionDialog> : null}
      {creating ? (
        <CreateUserDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setNotice({
              type: 'success',
              message: 'Account created successfully.',
            });
            users.reload();
          }}
          request={request}
        />
      ) : null}
    </>
  );
}

const restaurantFilters: Array<{ label: string; value: RestaurantModerationStatus | 'ALL' }> = [
  { label: 'All restaurants', value: 'ALL' },
  { label: 'Pending review', value: 'PENDING_APPROVAL' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Suspended', value: 'SUSPENDED' },
  { label: 'Rejected', value: 'REJECTED' },
];

type RestaurantAction = {
  item: AdminRestaurant;
  status: RestaurantModerationStatus;
};

export function RestaurantsPage({ request }: PageProps) {
  const [filter, setFilter] = useState<RestaurantModerationStatus | 'ALL'>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<RestaurantAction | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminRestaurant | null>(null);
  const [managingCategories, setManagingCategories] =
    useState<AdminRestaurant | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const restaurantsUrl = useMemo(
    () => `/admin/restaurants${queryString({ moderationStatus: filter === 'ALL' ? undefined : filter, page, pageSize: 25, search: search || undefined })}`,
    [filter, page, search],
  );
  const loader = useCallback(
    () => request<Paginated<AdminRestaurant>>(restaurantsUrl),
    [request, restaurantsUrl],
  );
  const restaurants = useRemote(loader);

  async function updateRestaurant(item: AdminRestaurant, status: RestaurantModerationStatus, moderationNote: string) {
    await request(`/admin/restaurants/${item.restaurant.id}/moderation`, {
      body: {
        moderationStatus: status,
        ...(moderationNote ? { moderationNote } : {}),
      },
      method: 'PATCH',
    });
    setAction(null);
    setNotice({ type: 'success', message: `${item.restaurant.name} is now ${humanize(status).toLowerCase()}.` });
    restaurants.reload();
  }

  function searchRestaurants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  const data = restaurants.data;
  return (
    <>
      <PageHeader
        actions={
          <div className="header-actions">
            <button className="button button--primary" onClick={() => setCreating(true)} type="button">
              Create restaurant
            </button>
            <RefreshButton busy={restaurants.refreshing} onClick={restaurants.reload} />
          </div>
        }
        description="Create partner stores, moderate quality, and approve discovery after the owner account is active."
        eyebrow="PARTNER QUALITY"
        title="Restaurants"
      />
      <PageNotice clear={() => setNotice(null)} notice={notice} />
      <section className="toolbar content-card">
        <form className="search-form" onSubmit={searchRestaurants}><label className="sr-only" htmlFor="restaurant-search">Search restaurants</label><input id="restaurant-search" maxLength={100} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search name, cuisine, or address" value={searchInput} /><button className="button button--secondary" type="submit">Search</button></form>
      </section>
      <div className="filter-row" aria-label="Restaurant moderation filter">
        {restaurantFilters.map((item) => <button className={`filter-pill ${filter === item.value ? 'filter-pill--active' : ''}`} key={item.value} onClick={() => { setFilter(item.value); setPage(1); }} type="button">{item.label}</button>)}
      </div>
      {restaurants.loading ? <LoadingPanel label="Loading restaurant partners…" /> : null}
      {!restaurants.loading && restaurants.error && !data ? <ErrorPanel error={restaurants.error} onRetry={restaurants.reload} /> : null}
      {data ? <section className="content-card table-card">
        <div className="table-card__header"><span>{data.pagination.total.toLocaleString()} restaurant{data.pagination.total === 1 ? '' : 's'}</span>{restaurants.error ? <span className="subtle-error">Showing last loaded results. {getErrorMessage(restaurants.error)}</span> : null}</div>
        {data.items.length === 0 ? <EmptyState detail="Try another moderation status or search term." title="No restaurants found" /> : <div className="table-scroll"><table>
          <thead><tr><th>Restaurant</th><th>Owner</th><th>Moderation</th><th>Store state</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.items.map((item) => {
            const canApprove = item.owner.role === 'RESTAURANT_OWNER' && item.owner.accountStatus === 'ACTIVE';
            return <tr key={item.restaurant.id}>
              <td data-label="Restaurant"><strong>{item.restaurant.name}</strong><small>{item.restaurant.cuisineType || 'Cuisine not set'} · {item.restaurant.address}</small>{item.restaurant.moderationNote ? <small className="reason-text">{item.restaurant.moderationNote}</small> : null}</td>
              <td data-label="Owner"><strong>{fullName(item.owner)}</strong><small>{item.owner.email ?? 'No email on record'}</small><small>{humanize(item.owner.role)} · <span className={item.owner.accountStatus === 'ACTIVE' ? 'online-text' : 'warning-text'}>{humanize(item.owner.accountStatus)}</span></small></td>
              <td data-label="Moderation"><StatusPill status={item.restaurant.moderationStatus} /></td>
              <td data-label="Store state">
                <StatusPill status={item.restaurant.isOpen ? 'OPEN' : 'CLOSED'} />
              </td>
              <td className="actions-cell" data-label="Actions">
                <div className="action-menu">
                  <button
                    className="button button--small button--secondary"
                    onClick={() => setEditing(item)}
                    type="button">
                    Edit
                  </button>
                  <button
                    className="button button--small button--secondary"
                    onClick={() => setManagingCategories(item)}
                    type="button">
                    Menu
                  </button>
                  <StatusSelect
                    label="Moderation status"
                    onChange={(status) => {
                      const next = status as RestaurantModerationStatus;
                      if (next === 'APPROVED' && !canApprove) {
                        window.alert(
                          'Activate the restaurant owner before approving this store.',
                        );
                        return;
                      }
                      setAction({ item, status: next });
                    }}
                    options={[
                      { value: 'PENDING_APPROVAL', label: 'Pending' },
                      { value: 'APPROVED', label: 'Approved' },
                      { value: 'SUSPENDED', label: 'Suspended' },
                      { value: 'REJECTED', label: 'Rejected' },
                    ]}
                    value={item.restaurant.moderationStatus}
                  />
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table></div>}
        <Pagination onPageChange={setPage} pagination={data.pagination} />
      </section> : null}
      {action ? <ActionDialog
        confirmLabel={statusLabel(action.status)}
        danger={action.status === 'SUSPENDED' || action.status === 'REJECTED'}
        description={
          action.status === 'APPROVED'
            ? `Approve ${action.item.restaurant.name} for discovery and orders?`
            : `Set ${action.item.restaurant.name} to ${statusLabel(action.status).toLowerCase()}?`
        }
        onClose={() => setAction(null)}
        onConfirm={(reason) => updateRestaurant(action.item, action.status, reason)}
        reasonLabel="Note"
        reasonPlaceholder={
          action.status === 'SUSPENDED' || action.status === 'REJECTED'
            ? 'Why is this store being limited?'
            : 'Optional note'
        }
        reasonRequired={action.status === 'SUSPENDED' || action.status === 'REJECTED'}
        title={`${statusLabel(action.status)} restaurant`}
      /> : null}
      {creating ? (
        <CreateRestaurantDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setNotice({
              type: 'success',
              message: 'Restaurant created successfully.',
            });
            restaurants.reload();
          }}
          request={request}
        />
      ) : null}
      {editing ? (
        <EditRestaurantDialog
          item={editing}
          onClose={() => setEditing(null)}
          onUpdated={() => {
            setNotice({
              type: 'success',
              message: 'Restaurant details updated.',
            });
            restaurants.reload();
          }}
          request={request}
        />
      ) : null}
      {managingCategories ? (
        <ManageCategoriesDialog
          item={managingCategories}
          onClose={() => setManagingCategories(null)}
          request={request}
        />
      ) : null}
    </>
  );
}

const orderFilters: Array<{ label: string; value: OrderStatus | 'ALL' }> = [
  { label: 'All orders', value: 'ALL' },
  { label: 'Payment pending', value: 'PENDING' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Preparing', value: 'PREPARING' },
  { label: 'Ready', value: 'READY' },
  { label: 'On delivery', value: 'PICKED_UP' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

export function OrdersPage({ request }: PageProps) {
  const [filter, setFilter] = useState<OrderStatus | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [orderToCancel, setOrderToCancel] = useState<AdminOrder | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const ordersUrl = useMemo(
    () => `/admin/orders${queryString({ page, pageSize: 25, status: filter === 'ALL' ? undefined : filter })}`,
    [filter, page],
  );
  const loader = useCallback(
    () => request<Paginated<AdminOrder>>(ordersUrl),
    [request, ordersUrl],
  );
  const orders = useRemote(loader, 15_000);

  async function cancelOrder(reason: string) {
    if (!orderToCancel) return;
    await request(`/admin/orders/${orderToCancel.id}/status`, {
      body: { reason, status: 'CANCELLED' },
      method: 'PATCH',
    });
    setOrderToCancel(null);
    setNotice({
      type: 'success',
      message: 'Cancellation was requested. The system will safely cancel or refund the payment as needed.',
    });
    orders.reload();
  }

  const data = orders.data;
  return (
    <>
      <PageHeader actions={<RefreshButton busy={orders.refreshing} onClick={orders.reload} />} description="Monitor fulfilment exceptions. Administrative changes are deliberately limited to safe cancellation and payment reversal." eyebrow="LIVE OPERATIONS" title="Orders" />
      <PageNotice clear={() => setNotice(null)} notice={notice} />
      <div className="filter-row" aria-label="Order status filter">
        {orderFilters.map((item) => <button className={`filter-pill ${filter === item.value ? 'filter-pill--active' : ''}`} key={item.value} onClick={() => { setFilter(item.value); setPage(1); }} type="button">{item.label}</button>)}
      </div>
      {orders.loading ? <LoadingPanel label="Loading operational orders…" /> : null}
      {!orders.loading && orders.error && !data ? <ErrorPanel error={orders.error} onRetry={orders.reload} /> : null}
      {data ? <section className="content-card table-card">
        <div className="table-card__header"><span>{data.pagination.total.toLocaleString()} order{data.pagination.total === 1 ? '' : 's'}</span>{orders.error ? <span className="subtle-error">Showing last loaded results. {getErrorMessage(orders.error)}</span> : null}</div>
        {data.items.length === 0 ? <EmptyState detail="There are no orders matching this status." title="No orders found" /> : <div className="table-scroll"><table>
          <thead><tr><th>Order</th><th>People</th><th>Delivery</th><th>Amount</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.items.map((order) => {
            const cancellationInProgress = Boolean(order.cancellationRequestedAt) && order.status !== 'CANCELLED';
            const canCancel = order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && !cancellationInProgress;
            return <tr key={order.id}>
              <td data-label="Order"><strong>#{order.id.slice(0, 8).toUpperCase()}</strong><small>{order.restaurant?.name ?? 'Restaurant removed'}</small><small>{formatDateTime(order.createdAt)}</small></td>
              <td data-label="People"><strong>{order.customer ? fullName(order.customer) : 'Customer removed'}</strong><small>Driver · {order.driver ? fullName(order.driver) : 'Unassigned'}</small></td>
              <td data-label="Delivery"><span className="clamp-copy">{order.deliveryAddress}</span>{order.cancellationReason ? <small className="reason-text">Cancellation · {order.cancellationReason}</small> : null}</td>
              <td data-label="Amount"><strong>{formatCurrency(order.totalAmount)}</strong>{Number(order.discountAmount ?? 0) > 0 ? <small className="online-text">Offer saving {formatCurrency(order.discountAmount)}</small> : null}{order.refundedAt ? <small className="online-text">Refunded {formatDateTime(order.refundedAt)}</small> : null}</td>
              <td data-label="Status"><StatusPill status={cancellationInProgress ? 'CANCELLATION_IN_PROGRESS' : order.status} /></td>
              <td className="actions-cell" data-label="Actions">{canCancel ? <button className="button button--small button--danger-outline" onClick={() => setOrderToCancel(order)} type="button">Cancel & refund</button> : cancellationInProgress ? <span className="protected-copy">Payment reversal in progress</span> : <span className="protected-copy">No action</span>}</td>
            </tr>;
          })}</tbody>
        </table></div>}
        <Pagination onPageChange={setPage} pagination={data.pagination} />
      </section> : null}
      {orderToCancel ? <ActionDialog
        confirmLabel="Cancel order"
        danger
        description={`Cancelling #${orderToCancel.id.slice(0, 8).toUpperCase()} stops normal fulfilment. The server cancels an uncaptured payment or starts a Stripe refund for a captured payment.`}
        onClose={() => setOrderToCancel(null)}
        onConfirm={cancelOrder}
        reasonLabel="Reason for operational cancellation"
        reasonPlaceholder="Explain why this order needs to be cancelled"
        reasonRequired
        title="Cancel this order?"
      /> : null}
    </>
  );
}

type OfferFilter = OfferStatus | 'ALL' | 'FEATURED';
const offerFilters: Array<{ label: string; value: OfferFilter }> = [
  { label: 'All campaigns', value: 'ALL' },
  { label: 'Featured', value: 'FEATURED' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Paused', value: 'PAUSED' },
  { label: 'Archived', value: 'ARCHIVED' },
];

type OfferArchiveAction = { offer: AdminOffer } | null;

function offerDiscount(offer: AdminOffer) {
  return offer.discountType === 'PERCENTAGE'
    ? `${Number(offer.discountValue)}% off`
    : `${formatCurrency(offer.discountValue)} off`;
}

export function OffersPage({ request }: PageProps) {
  const [filter, setFilter] = useState<OfferFilter>('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [archiveAction, setArchiveAction] = useState<OfferArchiveAction>(null);
  const [creating, setCreating] = useState(false);
  const [redemptionsOffer, setRedemptionsOffer] = useState<AdminOffer | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const offersUrl = useMemo(
    () => `/admin/offers${queryString({
      featured: filter === 'FEATURED' ? true : undefined,
      page,
      pageSize: 25,
      search: search || undefined,
      status: filter !== 'ALL' && filter !== 'FEATURED' ? filter : undefined,
    })}`,
    [filter, page, search],
  );
  const loader = useCallback(
    () => request<Paginated<AdminOffer>>(offersUrl),
    [request, offersUrl],
  );
  const offers = useRemote(loader);

  async function updateOffer(offer: AdminOffer, payload: Record<string, string | number | boolean>) {
    setPendingId(offer.id);
    try {
      await request(`/admin/offers/${offer.id}`, { body: payload, method: 'PATCH' });
      setArchiveAction(null);
      setNotice({ type: 'success', message: `${offer.title} was updated.` });
      offers.reload();
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
      throw error;
    } finally {
      setPendingId(null);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  const data = offers.data;
  return (
    <>
      <PageHeader
        actions={
          <div className="header-actions">
            <button className="button button--primary" onClick={() => setCreating(true)} type="button">
              Create offer
            </button>
            <RefreshButton busy={offers.refreshing} onClick={offers.reload} />
          </div>
        }
        description="Create campaigns, curate Hot Offers, and review redemption history without bypassing capacity safeguards."
        eyebrow="CAMPAIGN CONTROL"
        title="Hot Offers"
      />
      <PageNotice clear={() => setNotice(null)} notice={notice} />
      <section className="toolbar content-card"><form className="search-form" onSubmit={submitSearch}><label className="sr-only" htmlFor="offer-search">Search campaigns</label><input id="offer-search" maxLength={100} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search offer, code, or restaurant" value={searchInput} /><button className="button button--secondary" type="submit">Search</button></form></section>
      <div className="filter-row" aria-label="Offer status filter">{offerFilters.map((item) => <button className={`filter-pill ${filter === item.value ? 'filter-pill--active' : ''}`} key={item.value} onClick={() => { setFilter(item.value); setPage(1); }} type="button">{item.label}</button>)}</div>
      {offers.loading ? <LoadingPanel label="Loading campaigns…" /> : null}
      {!offers.loading && offers.error && !data ? <ErrorPanel error={offers.error} onRetry={offers.reload} /> : null}
      {data ? <section className="content-card table-card">
        <div className="table-card__header"><span>{data.pagination.total.toLocaleString()} campaign{data.pagination.total === 1 ? '' : 's'}</span>{offers.error ? <span className="subtle-error">Showing last loaded results. {getErrorMessage(offers.error)}</span> : null}</div>
        {data.items.length === 0 ? <EmptyState detail="Try another campaign state or search term." title="No campaigns found" /> : <div className="table-scroll"><table>
          <thead><tr><th>Campaign</th><th>Restaurant</th><th>Value & usage</th><th>Window</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{data.items.map((offer) => {
            const busy = pendingId === offer.id;
            const canFeature = ['ACTIVE', 'SCHEDULED'].includes(offer.effectiveStatus);
            const statusValue =
              offer.effectiveStatus === 'PAUSED'
                ? 'PAUSED'
                : offer.effectiveStatus === 'ARCHIVED'
                  ? 'ARCHIVED'
                  : 'ACTIVE';
            return <tr key={offer.id}>
              <td data-label="Campaign"><strong>{offer.title}</strong><small className="offer-code">{offer.code ?? 'AUTO APPLIED'}</small></td>
              <td data-label="Restaurant"><strong>{offer.restaurant.name}</strong><small>{statusLabel(offer.restaurant.moderationStatus)}</small></td>
              <td data-label="Value & usage"><strong className="online-text">{offerDiscount(offer)}</strong><small>Uses {offer.usageCount}{offer.usageLimit ? ` / ${offer.usageLimit}` : ''}</small></td>
              <td data-label="Window"><small>Starts {formatDate(offer.startsAt)}</small><small>Ends {formatDate(offer.endsAt)}</small></td>
              <td data-label="Status"><StatusPill status={offer.effectiveStatus} />{offer.isFeatured ? <small className="featured-mark">Featured</small> : null}</td>
              <td className="actions-cell" data-label="Actions">
                <div className="action-menu">
                  <button
                    className="button button--small button--secondary"
                    disabled={busy}
                    onClick={() => setRedemptionsOffer(offer)}
                    type="button">
                    History
                  </button>
                  <button
                    className="button button--small button--secondary"
                    disabled={busy || !canFeature}
                    onClick={() =>
                      void updateOffer(offer, { isFeatured: !offer.isFeatured })
                    }
                    type="button">
                    {offer.isFeatured ? 'Unfeature' : 'Feature'}
                  </button>
                  <StatusSelect
                    disabled={busy || offer.effectiveStatus === 'EXPIRED'}
                    label="Campaign status"
                    onChange={(status) => {
                      if (status === 'ARCHIVED') {
                        setArchiveAction({ offer });
                        return;
                      }
                      void updateOffer(offer, { status: status as OfferStatus });
                    }}
                    options={[
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'PAUSED', label: 'Paused' },
                      { value: 'ARCHIVED', label: 'Archive…' },
                    ]}
                    value={statusValue}
                  />
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table></div>}
        <Pagination onPageChange={setPage} pagination={data.pagination} />
      </section> : null}
      {archiveAction ? <ActionDialog
        confirmLabel="Archive offer"
        danger
        description={`${archiveAction.offer.title} will no longer be usable or eligible for the Hot Offers rail. This cannot be reversed by the restaurant owner.`}
        onClose={() => setArchiveAction(null)}
        onConfirm={() => updateOffer(archiveAction.offer, { status: 'ARCHIVED' })}
        reasonPlaceholder=""
        title="Archive this campaign?"
      /> : null}
      {creating ? (
        <CreateOfferDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            setNotice({ type: 'success', message: 'Offer created successfully.' });
            offers.reload();
          }}
          request={request}
        />
      ) : null}
      {redemptionsOffer ? (
        <OfferRedemptionsDialog
          offer={redemptionsOffer}
          onClose={() => setRedemptionsOffer(null)}
          request={request}
        />
      ) : null}
    </>
  );
}

export function AuditPage({ request }: PageProps) {
  const [page, setPage] = useState(1);
  const auditUrl = useMemo(
    () => `/admin/audit-logs${queryString({ page, pageSize: 50 })}`,
    [page],
  );
  const loader = useCallback(
    () => request<Paginated<AdminAuditLog>>(auditUrl),
    [request, auditUrl],
  );
  const audit = useRemote(loader);
  const data = audit.data;
  return (
    <>
      <PageHeader actions={<RefreshButton busy={audit.refreshing} onClick={audit.reload} />} description="Every privileged operations action is recorded here with its actor, target, timestamp, and safe change details." eyebrow="SECURITY TRAIL" title="Audit log" />
      {audit.loading ? <LoadingPanel label="Loading immutable audit events…" /> : null}
      {!audit.loading && audit.error && !data ? <ErrorPanel error={audit.error} onRetry={audit.reload} /> : null}
      {data ? <section className="content-card table-card">
        <div className="table-card__header"><span>{data.pagination.total.toLocaleString()} audit event{data.pagination.total === 1 ? '' : 's'}</span>{audit.error ? <span className="subtle-error">Showing last loaded results. {getErrorMessage(audit.error)}</span> : null}</div>
        {data.items.length === 0 ? <EmptyState detail="Administrative changes will be recorded automatically." title="No audit events yet" /> : <div className="table-scroll"><table>
          <thead><tr><th>Action</th><th>Actor</th><th>Target</th><th>When</th><th>Details</th></tr></thead>
          <tbody>{data.items.map(({ actor, log }) => <tr key={log.id}>
            <td data-label="Action"><strong>{humanize(log.action)}</strong></td>
            <td data-label="Actor"><strong>{fullName(actor)}</strong><small>{actor.email ?? 'No email on record'}</small></td>
            <td data-label="Target"><strong>{humanize(log.targetType)}</strong><small className="mono-copy">{log.targetId}</small></td>
            <td data-label="When">{formatDateTime(log.createdAt)}</td>
            <td data-label="Details">{log.metadata ? <details><summary>View change details</summary><pre>{JSON.stringify(log.metadata, null, 2)}</pre></details> : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
        <Pagination onPageChange={setPage} pagination={data.pagination} />
      </section> : null}
    </>
  );
}

type DriverOperationsRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  isOnline: boolean;
  accountStatus: string;
  vehicleType: string | null;
  vehiclePlate: string | null;
  verifiedAt: string | null;
  activeOrder: { orderId: string; status: string } | null;
};

type SupportTicketRow = {
  ticket: {
    id: string;
    subject: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
    priority: string;
    orderId: string | null;
    updatedAt: string;
  };
  customer: { firstName: string; lastName: string; email: string | null } | null;
};

type DeliveryZoneRow = {
  id: string;
  name: string;
  baseFee: string;
  feePerKm: string;
  etaMinutes: number;
  isActive: boolean;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

export function OperationsPage({ request }: PageProps) {
  const [notice, setNotice] = useState<NoticeState>(null);
  const [reassignment, setReassignment] = useState({ orderId: '', driverId: '', note: '' });
  const drivers = useRemote(useCallback(() => request<DriverOperationsRow[]>('/admin/operations/drivers'), [request]), 15_000);
  const tickets = useRemote(useCallback(() => request<SupportTicketRow[]>('/admin/operations/support-tickets'), [request]), 20_000);
  const zones = useRemote(useCallback(() => request<DeliveryZoneRow[]>('/admin/operations/delivery-zones'), [request]), 60_000);
  const refresh = () => { drivers.reload(); tickets.reload(); zones.reload(); };

  async function submitReassignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reassignment.orderId || !reassignment.driverId) {
      setNotice({ type: 'error', message: 'Enter both an order ID and a driver ID.' });
      return;
    }
    try {
      await request(`/admin/operations/orders/${reassignment.orderId}/reassign`, {
        method: 'POST',
        body: { driverId: reassignment.driverId, note: reassignment.note || undefined },
      });
      setNotice({ type: 'success', message: 'Driver reassigned and the live order feed was updated.' });
      setReassignment({ orderId: '', driverId: '', note: '' });
      drivers.reload();
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    }
  }

  async function updateTicket(id: string, status: SupportTicketRow['ticket']['status']) {
    try {
      await request(`/admin/operations/support-tickets/${id}`, { method: 'PATCH', body: { status } });
      setNotice({ type: 'success', message: 'Support ticket updated.' });
      tickets.reload();
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    }
  }

  return (
    <>
      <PageHeader
        actions={<RefreshButton busy={drivers.refreshing || tickets.refreshing} onClick={refresh} />}
        description="Watch driver availability, resolve delivery exceptions, and keep customer support moving from one workspace."
        eyebrow="LIVE FULFILMENT"
        title="Driver operations"
      />
      <PageNotice clear={() => setNotice(null)} notice={notice} />
      <section className="metric-grid" aria-label="Operations snapshot">
        <MetricCard detail="Currently accepting work" label="Drivers online" tone="success" value={drivers.data?.filter((driver) => driver.isOnline).length ?? '—'} />
        <MetricCard detail="Assigned ready or picked-up orders" label="Active deliveries" tone="accent" value={drivers.data?.filter((driver) => driver.activeOrder).length ?? '—'} />
        <MetricCard detail="Tickets awaiting support action" label="Open support" tone="warning" value={tickets.data?.filter((ticket) => !['RESOLVED', 'CLOSED'].includes(ticket.ticket.status)).length ?? '—'} />
        <MetricCard detail="Currently live delivery areas" label="Active zones" tone="neutral" value={zones.data?.filter((zone) => zone.isActive).length ?? '—'} />
      </section>
      <section className="operations-grid">
        <article className="content-card operations-panel">
          <div className="section-heading"><div><p className="eyebrow">ORDER INTERVENTION</p><h2>Reassign a ready pickup</h2></div></div>
          <p className="operations-copy">This action is restricted to ready-for-pickup orders. The selected driver must be active, online, and free.</p>
          <form className="operations-form" onSubmit={submitReassignment}>
            <label className="field"><span>Order ID</span><input onChange={(event) => setReassignment((value) => ({ ...value, orderId: event.target.value.trim() }))} placeholder="Order UUID" value={reassignment.orderId} /></label>
            <label className="field"><span>New driver ID</span><input onChange={(event) => setReassignment((value) => ({ ...value, driverId: event.target.value.trim() }))} placeholder="Driver UUID" value={reassignment.driverId} /></label>
            <label className="field"><span>Internal note <small>optional</small></span><input maxLength={500} onChange={(event) => setReassignment((value) => ({ ...value, note: event.target.value }))} placeholder="Reason for reassignment" value={reassignment.note} /></label>
            <button className="button button--primary" type="submit">Reassign driver</button>
          </form>
        </article>
        <article className="content-card operations-panel">
          <div className="section-heading"><div><p className="eyebrow">DELIVERY COVERAGE</p><h2>Configured zones</h2></div></div>
          {zones.loading ? <LoadingPanel label="Loading zones…" /> : zones.data?.length ? <div className="compact-list">{zones.data.map((zone) => <div className="compact-row" key={zone.id}><div><strong>{zone.name}</strong><small>AED {zone.baseFee} + {zone.feePerKm}/km · {zone.etaMinutes} min ETA</small></div><StatusPill status={zone.isActive ? 'ACTIVE' : 'PAUSED'} /></div>)}</div> : <EmptyState detail="Create delivery zones through the protected operations API." title="No delivery zones" />}
        </article>
      </section>
      <section className="content-card table-card">
        <div className="section-heading section-heading--padded"><div><p className="eyebrow">DRIVER FLEET</p><h2>Live availability</h2></div></div>
        {drivers.loading ? <LoadingPanel label="Loading driver fleet…" /> : drivers.error && !drivers.data ? <ErrorPanel error={drivers.error} onRetry={drivers.reload} /> : <div className="table-scroll"><table><thead><tr><th>Driver</th><th>Availability</th><th>Vehicle</th><th>Current delivery</th><th>Copy ID</th></tr></thead><tbody>{drivers.data?.map((driver) => <tr key={driver.id}><td data-label="Driver"><strong>{driver.firstName} {driver.lastName}</strong><small>{driver.email ?? 'No email'}</small></td><td data-label="Availability"><StatusPill status={driver.isOnline ? 'ACTIVE' : 'PAUSED'} /><small>{driver.accountStatus}</small></td><td data-label="Vehicle">{driver.vehicleType || 'Not provided'}<small>{driver.vehiclePlate || 'No plate on file'}</small></td><td data-label="Current delivery">{driver.activeOrder ? <><strong>{humanize(driver.activeOrder.status)}</strong><small className="mono-copy">{driver.activeOrder.orderId}</small></> : 'Available'}</td><td data-label="Copy ID"><button className="text-button" onClick={() => { void navigator.clipboard?.writeText(driver.id); setNotice({ type: 'success', message: 'Driver ID copied.' }); }} type="button">Copy ID</button></td></tr>)}</tbody></table></div>}
      </section>
      <section className="operations-grid">
        <article className="content-card operations-panel">
          <div className="section-heading"><div><p className="eyebrow">CUSTOMER CARE</p><h2>Support queue</h2></div></div>
          {tickets.loading ? <LoadingPanel label="Loading tickets…" /> : tickets.data?.length ? <div className="compact-list">{tickets.data.slice(0, 8).map(({ ticket, customer }) => <div className="compact-row compact-row--action" key={ticket.id}><div><strong>{ticket.subject}</strong><small>{customer ? fullName(customer) : 'Unassigned customer'} · {ticket.priority} · {formatDateTime(ticket.updatedAt)}</small></div><StatusSelect label="Ticket status" onChange={(status) => void updateTicket(ticket.id, status as SupportTicketRow['ticket']['status'])} options={[{ value: 'OPEN', label: 'Open' }, { value: 'IN_PROGRESS', label: 'In progress' }, { value: 'RESOLVED', label: 'Resolved' }, { value: 'CLOSED', label: 'Closed' }]} value={ticket.status} /></div>)}</div> : <EmptyState detail="New customer issues will be tracked here." title="Support queue is clear" />}
        </article>
      </section>
      <OperationsControls request={request} />
    </>
  );
}

export function NotificationsPage({ request }: PageProps) {
  const [filter, setFilter] = useState<'ALL' | 'SENT' | 'FAILED' | 'QUEUED'>('ALL');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ recipientId: '', orderId: '', title: '', body: '' });
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const loader = useCallback(
    () => request<NotificationRow[]>('/admin/operations/notifications'),
    [request],
  );
  const recipientsLoader = useCallback(
    () => request<Paginated<AdminUser>>('/admin/users?accountStatus=ACTIVE&pageSize=100'),
    [request],
  );
  const deliveries = useRemote(loader, 20_000);
  const recipients = useRemote(recipientsLoader);
  const all = deliveries.data ?? [];
  const visible = filter === 'ALL' ? all : all.filter((item) => item.status === filter);
  const sent = all.filter((item) => item.status === 'SENT').length;
  const failed = all.filter((item) => item.status === 'FAILED').length;
  const pending = all.filter((item) => ['QUEUED', 'RETRYING'].includes(item.status)).length;
  const selectedRecipient = useMemo(
    () => recipients.data?.items.find((user) => user.id === form.recipientId) ?? null,
    [form.recipientId, recipients.data],
  );
  const matchingRecipients = useMemo(() => {
    const query = recipientSearch.trim().toLocaleLowerCase();
    const activeUsers = recipients.data?.items ?? [];
    const matches = query
      ? activeUsers.filter((user) =>
        [fullName(user), user.email ?? '', humanize(user.role)]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query),
      )
      : activeUsers;

    return [...matches]
      .sort((left, right) => fullName(left).localeCompare(fullName(right)))
      .slice(0, 8);
  }, [recipientSearch, recipients.data]);

  const refresh = () => {
    deliveries.reload();
    recipients.reload();
  };

  function selectRecipient(recipient: AdminUser) {
    setForm((value) => ({ ...value, recipientId: recipient.id }));
    setRecipientSearch('');
    setRecipientPickerOpen(false);
  }

  function clearRecipient() {
    setForm((value) => ({ ...value, recipientId: '' }));
    setRecipientSearch('');
    setRecipientPickerOpen(true);
  }

  async function compose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.recipientId) {
      setNotice({ type: 'error', message: 'Choose an active recipient before sending this notification.' });
      setRecipientPickerOpen(true);
      return;
    }
    const orderId = form.orderId.trim();
    if (orderId && !uuidPattern.test(orderId)) {
      setNotice({
        type: 'error',
        message: 'Order ID must be a real order UUID. Leave it empty for a normal announcement or deal.',
      });
      return;
    }
    setSending(true);
    try {
      const delivery = await request<NotificationRow>('/admin/operations/notifications', {
        method: 'POST',
        body: {
          recipientId: form.recipientId,
          orderId: orderId || undefined,
          title: form.title.trim(),
          body: form.body.trim(),
        },
      });
      setForm({ recipientId: '', orderId: '', title: '', body: '' });
      setRecipientSearch('');
      setRecipientPickerOpen(false);
      if (delivery.status === 'FAILED') {
        setNotice({
          type: 'error',
          message: `Notification was created, but it could not be pushed: ${delivery.lastError ?? 'Unknown delivery error'}.`,
        });
      } else if (delivery.status === 'SENT') {
        setNotice({ type: 'success', message: 'Notification was accepted by the push provider.' });
      } else {
        setNotice({ type: 'success', message: 'Notification queued for push delivery. Its live status appears below.' });
      }
      deliveries.reload();
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setSending(false);
    }
  }

  async function retry(id: string) {
    try {
      await request(`/admin/operations/notifications/${id}/retry`, { method: 'POST' });
      setNotice({ type: 'success', message: 'Notification queued for retry.' });
      deliveries.reload();
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    }
  }

  return (
    <>
      <PageHeader
        actions={<RefreshButton busy={deliveries.refreshing || recipients.refreshing} onClick={refresh} />}
        description="Select a real active person, send a clear update, and monitor every push delivery attempt from one dedicated workspace."
        eyebrow="CUSTOMER COMMUNICATIONS"
        title="Notification center"
      />
      <PageNotice clear={() => setNotice(null)} notice={notice} />
      <section className="notification-hero">
        <div><p className="eyebrow">DELIVERY HEALTH</p><h2>Keep every customer informed.</h2><p>Queued notifications are retried safely. A failed delivery retains the provider error for follow-up.</p></div>
        <div className="notification-hero__stats"><span><strong>{sent}</strong> Delivered</span><span><strong>{pending}</strong> In progress</span><span><strong>{failed}</strong> Need attention</span></div>
      </section>
      <section className="notification-layout">
        <form className="content-card notification-compose" onSubmit={compose}>
          <div><p className="eyebrow">NEW MESSAGE</p><h2>Compose notification</h2><p>Choose an active account by name, email, or role. One person receives each message.</p></div>
          <div className="field notification-recipient-field">
            <label htmlFor="notification-recipient-search">Send to <small>active account</small></label>
            {selectedRecipient ? (
              <div className="notification-recipient-selected">
                <div className="notification-recipient-selected__identity">
                  <span className="avatar" aria-hidden="true">{selectedRecipient.firstName.charAt(0).toUpperCase() || '?'}</span>
                  <div>
                    <strong>{fullName(selectedRecipient)}</strong>
                    <small>{selectedRecipient.email ?? 'No email on record'} · {humanize(selectedRecipient.role)}</small>
                  </div>
                </div>
                <div className="notification-recipient-selected__actions">
                  <span className={`notification-recipient-token ${selectedRecipient.hasPushToken === true ? 'notification-recipient-token--ready' : 'notification-recipient-token--missing'}`}>
                    {selectedRecipient.hasPushToken === true ? 'Push ready' : selectedRecipient.hasPushToken === false ? 'No push token' : 'Token unknown'}
                  </span>
                  <button className="text-button" onClick={clearRecipient} type="button">Change</button>
                </div>
              </div>
            ) : (
              <div className="notification-recipient-picker">
                <input
                  aria-autocomplete="list"
                  aria-controls="notification-recipient-results"
                  aria-expanded={recipientPickerOpen}
                  autoComplete="off"
                  id="notification-recipient-search"
                  onBlur={() => window.setTimeout(() => setRecipientPickerOpen(false), 120)}
                  onChange={(event) => {
                    setRecipientSearch(event.target.value);
                    setRecipientPickerOpen(true);
                  }}
                  onFocus={() => setRecipientPickerOpen(true)}
                  placeholder="Search a name, email, or role"
                  role="combobox"
                  type="search"
                  value={recipientSearch}
                />
                {recipientPickerOpen ? (
                  <div className="notification-recipient-results" id="notification-recipient-results" role="listbox">
                    {recipients.loading ? <p>Loading active people…</p> : null}
                    {recipients.error && !recipients.data ? <div className="notification-recipient-results__error"><span>Could not load active people.</span><button className="text-button" onClick={recipients.reload} type="button">Retry</button></div> : null}
                    {!recipients.loading && !recipients.error && matchingRecipients.length === 0 ? <p>No active people match this search.</p> : null}
                    {!recipients.loading && matchingRecipients.map((recipient) => (
                      <button
                        className="notification-recipient-option"
                        key={recipient.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectRecipient(recipient)}
                        role="option"
                        type="button">
                        <span className="avatar" aria-hidden="true">{recipient.firstName.charAt(0).toUpperCase() || '?'}</span>
                        <span className="notification-recipient-option__copy"><strong>{fullName(recipient)}</strong><small>{recipient.email ?? 'No email on record'} · {humanize(recipient.role)}</small></span>
                        <span className={`notification-recipient-token ${recipient.hasPushToken === true ? 'notification-recipient-token--ready' : recipient.hasPushToken === false ? 'notification-recipient-token--missing' : ''}`}>
                          {recipient.hasPushToken === true ? 'Push ready' : recipient.hasPushToken === false ? 'No token' : '—'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {selectedRecipient?.hasPushToken === false ? <small className="notification-recipient-warning">This account has not registered a mobile push token yet. The message can be created, but it cannot reach the device until the user opens the installed app and allows notifications.</small> : null}
          </div>
          <label className="field"><span>Order ID <small>optional</small></span><input onChange={(event) => setForm((value) => ({ ...value, orderId: event.target.value }))} placeholder="Only for an order-specific update" value={form.orderId} /></label>
          <label className="field"><span>Title</span><input required maxLength={120} onChange={(event) => setForm((value) => ({ ...value, title: event.target.value }))} placeholder="Your order is on the way" value={form.title} /></label>
          <label className="field"><span>Message</span><textarea required maxLength={1000} onChange={(event) => setForm((value) => ({ ...value, body: event.target.value }))} placeholder="Your rider is nearby. We will let you know when they arrive." value={form.body} /></label>
          <div className="notification-compose__footer"><span>Secure push delivery · retry tracking enabled</span><button className="button button--primary" disabled={sending} type="submit">{sending ? 'Queueing…' : 'Queue notification'}</button></div>
        </form>
        <aside className="content-card notification-guide">
          <p className="eyebrow">GOOD PRACTICE</p><h2>Useful order updates</h2>
          <div><strong>Order confirmed</strong><span>Set expectations after payment succeeds.</span></div>
          <div><strong>Rider assigned</strong><span>Share ETA once pickup is confirmed.</span></div>
          <div><strong>Delivery issue</strong><span>Use clear, human language and include support follow-up.</span></div>
        </aside>
      </section>
      <section className="content-card table-card notification-history">
        <div className="notification-history__header"><div><p className="eyebrow">DELIVERY LOG</p><h2>Notification history</h2></div><div className="filter-row">{(['ALL', 'SENT', 'QUEUED', 'FAILED'] as const).map((status) => <button className={`filter-pill ${filter === status ? 'filter-pill--active' : ''}`} key={status} onClick={() => setFilter(status)} type="button">{status === 'ALL' ? 'All activity' : humanize(status)}</button>)}</div></div>
        {deliveries.loading ? <LoadingPanel label="Loading delivery history…" /> : deliveries.error && !deliveries.data ? <ErrorPanel error={deliveries.error} onRetry={deliveries.reload} /> : visible.length === 0 ? <EmptyState detail="Try a different delivery state or compose the first update." title="No notifications found" /> : <div className="table-scroll"><table><thead><tr><th>Message</th><th>Delivery state</th><th>Attempts</th><th>Created</th><th>Action</th></tr></thead><tbody>{visible.map((delivery) => <tr key={delivery.id}><td data-label="Message"><strong>{delivery.title}</strong><small>{delivery.body}</small>{delivery.lastError ? <small className="reason-text">{delivery.lastError}</small> : null}</td><td data-label="Delivery state"><StatusPill status={delivery.status} /></td><td data-label="Attempts">{delivery.attempts}</td><td data-label="Created">{formatDateTime(delivery.createdAt)}</td><td data-label="Action">{delivery.status === 'FAILED' ? <button className="button button--small button--secondary" onClick={() => void retry(delivery.id)} type="button">Retry</button> : '—'}</td></tr>)}</tbody></table></div>}
      </section>
    </>
  );
}

/**
 * Compact controls for lower-frequency operational actions. They intentionally
 * sit below the live fleet workspace so routine dispatch work stays focused.
 */
function OperationsControls({ request }: { request: AdminRequest }) {
  const [notice, setNotice] = useState<NoticeState>(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState('');
  const [zone, setZone] = useState({
    id: '',
    name: '',
    polygon: '[{"latitude":25.2048,"longitude":55.2708},{"latitude":25.2148,"longitude":55.2708},{"latitude":25.2098,"longitude":55.2808}]',
    baseFee: '5.00',
    feePerKm: '1.50',
    minimumOrder: '0',
    etaMinutes: '35',
  });
  const [schedule, setSchedule] = useState({ restaurantId: '', dayOfWeek: '0', opensAt: '09:00', closesAt: '23:00', prepMinutes: '20' });
  const [ticket, setTicket] = useState({ orderId: '', customerId: '', subject: '', priority: 'NORMAL' });
  const [note, setNote] = useState({ ticketId: '', body: '' });
  const [reason, setReason] = useState({ code: '', label: '', appliesTo: 'ALL' });
  const [settlement, setSettlement] = useState({ restaurantId: '', periodStart: '', periodEnd: '', commissionRate: '20' });
  const [document, setDocument] = useState({ id: '', status: 'APPROVED', reviewNote: '' });
  const [lookup, setLookup] = useState({ driverId: '', orderId: '' });
  const [assignment, setAssignment] = useState({ userId: '', role: 'OPERATIONS', permissions: 'orders.read,orders.reassign' });

  async function run(key: string, task: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      const response = await task();
      setResult(JSON.stringify(response, null, 2));
      setNotice({ type: 'success', message: success });
    } catch (error) {
      setNotice({ type: 'error', message: getErrorMessage(error) });
    } finally {
      setBusy('');
    }
  }

  function submitZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run('zone', async () => {
      let polygon: unknown;
      try { polygon = JSON.parse(zone.polygon); } catch { throw new Error('Boundary must be valid JSON coordinates.'); }
      const body = { name: zone.name, polygon, baseFee: zone.baseFee, feePerKm: zone.feePerKm, minimumOrder: zone.minimumOrder, etaMinutes: Number(zone.etaMinutes), isActive: true };
      return request(zone.id ? `/admin/operations/delivery-zones/${zone.id}` : '/admin/operations/delivery-zones', { method: zone.id ? 'PATCH' : 'POST', body });
    }, zone.id ? 'Delivery zone updated.' : 'Delivery zone created.');
  }

  return (
    <section className="operations-controls">
      <PageNotice clear={() => setNotice(null)} notice={notice} />
      <div className="section-heading"><div><p className="eyebrow">PLATFORM CONTROLS</p><h2>Operations configuration</h2><p>All actions are audited server-side. IDs can be copied from the tables above or the People, Orders, and Restaurants pages.</p></div></div>
      <div className="operations-controls__grid">
        <form className="content-card operations-panel operations-form" onSubmit={submitZone}>
          <h3>{zone.id ? 'Edit delivery zone' : 'Create delivery zone'}</h3>
          <label className="field"><span>Zone ID <small>optional for edit</small></span><input value={zone.id} onChange={(e) => setZone((v) => ({ ...v, id: e.target.value.trim() }))} /></label>
          <label className="field"><span>Name</span><input required value={zone.name} onChange={(e) => setZone((v) => ({ ...v, name: e.target.value }))} /></label>
          <label className="field"><span>Boundary JSON</span><textarea required value={zone.polygon} onChange={(e) => setZone((v) => ({ ...v, polygon: e.target.value }))} /></label>
          <div className="form-pair"><label className="field"><span>Base fee</span><input required value={zone.baseFee} onChange={(e) => setZone((v) => ({ ...v, baseFee: e.target.value }))} /></label><label className="field"><span>Per km</span><input required value={zone.feePerKm} onChange={(e) => setZone((v) => ({ ...v, feePerKm: e.target.value }))} /></label></div>
          <div className="form-pair"><label className="field"><span>Minimum order</span><input required value={zone.minimumOrder} onChange={(e) => setZone((v) => ({ ...v, minimumOrder: e.target.value }))} /></label><label className="field"><span>ETA minutes</span><input required type="number" value={zone.etaMinutes} onChange={(e) => setZone((v) => ({ ...v, etaMinutes: e.target.value }))} /></label></div>
          <button className="button button--primary" disabled={busy === 'zone'} type="submit">{busy === 'zone' ? 'Saving…' : zone.id ? 'Update zone' : 'Create zone'}</button>
        </form>
        <form className="content-card operations-panel operations-form" onSubmit={(e) => { e.preventDefault(); void run('schedule', () => request(`/admin/operations/restaurants/${schedule.restaurantId}/schedules`, { method: 'POST', body: { dayOfWeek: Number(schedule.dayOfWeek), opensAt: schedule.opensAt, closesAt: schedule.closesAt, prepMinutes: Number(schedule.prepMinutes), isClosed: false } }), 'Restaurant schedule saved.'); }}>
          <h3>Restaurant schedule</h3>
          <label className="field"><span>Restaurant ID</span><input required value={schedule.restaurantId} onChange={(e) => setSchedule((v) => ({ ...v, restaurantId: e.target.value.trim() }))} /></label>
          <div className="form-pair"><label className="field"><span>Day <small>0 = Sun</small></span><input required type="number" min="0" max="6" value={schedule.dayOfWeek} onChange={(e) => setSchedule((v) => ({ ...v, dayOfWeek: e.target.value }))} /></label><label className="field"><span>Prep mins</span><input required type="number" min="0" value={schedule.prepMinutes} onChange={(e) => setSchedule((v) => ({ ...v, prepMinutes: e.target.value }))} /></label></div>
          <div className="form-pair"><label className="field"><span>Opens</span><input required type="time" value={schedule.opensAt} onChange={(e) => setSchedule((v) => ({ ...v, opensAt: e.target.value }))} /></label><label className="field"><span>Closes</span><input required type="time" value={schedule.closesAt} onChange={(e) => setSchedule((v) => ({ ...v, closesAt: e.target.value }))} /></label></div>
          <button className="button button--primary" disabled={busy === 'schedule'} type="submit">{busy === 'schedule' ? 'Saving…' : 'Save schedule'}</button>
        </form>
        <form className="content-card operations-panel operations-form" onSubmit={(e) => { e.preventDefault(); void run('ticket', () => request('/admin/operations/support-tickets', { method: 'POST', body: { ...ticket, orderId: ticket.orderId || undefined, customerId: ticket.customerId || undefined } }), 'Support ticket created.'); }}>
          <h3>Create support ticket</h3>
          <label className="field"><span>Subject</span><input required maxLength={160} value={ticket.subject} onChange={(e) => setTicket((v) => ({ ...v, subject: e.target.value }))} /></label>
          <label className="field"><span>Order ID <small>optional</small></span><input value={ticket.orderId} onChange={(e) => setTicket((v) => ({ ...v, orderId: e.target.value.trim() }))} /></label>
          <label className="field"><span>Customer ID <small>optional</small></span><input value={ticket.customerId} onChange={(e) => setTicket((v) => ({ ...v, customerId: e.target.value.trim() }))} /></label>
          <label className="select-field">Priority<select value={ticket.priority} onChange={(e) => setTicket((v) => ({ ...v, priority: e.target.value }))}><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
          <button className="button button--primary" disabled={busy === 'ticket'} type="submit">{busy === 'ticket' ? 'Creating…' : 'Create ticket'}</button>
        </form>
        <form className="content-card operations-panel operations-form" onSubmit={(e) => { e.preventDefault(); void run('note', () => request(`/admin/operations/support-tickets/${note.ticketId}/notes`, { method: 'POST', body: { body: note.body, isInternal: true } }), 'Internal note added.'); }}>
          <h3>Add internal ticket note</h3>
          <label className="field"><span>Ticket ID</span><input required value={note.ticketId} onChange={(e) => setNote((v) => ({ ...v, ticketId: e.target.value.trim() }))} /></label>
          <label className="field"><span>Note</span><textarea required maxLength={4000} value={note.body} onChange={(e) => setNote((v) => ({ ...v, body: e.target.value }))} /></label>
          <button className="button button--secondary" disabled={busy === 'note'} type="submit">{busy === 'note' ? 'Adding…' : 'Add note'}</button>
        </form>
        <form className="content-card operations-panel operations-form" onSubmit={(e) => { e.preventDefault(); void run('reason', () => request('/admin/operations/cancellation-reasons', { method: 'POST', body: reason }), 'Cancellation reason created.'); }}>
          <h3>Cancellation reason</h3>
          <label className="field"><span>Code</span><input required value={reason.code} onChange={(e) => setReason((v) => ({ ...v, code: e.target.value.toUpperCase() }))} placeholder="RESTAURANT_CLOSED" /></label>
          <label className="field"><span>Customer-facing label</span><input required value={reason.label} onChange={(e) => setReason((v) => ({ ...v, label: e.target.value }))} /></label>
          <label className="select-field">Applies to<select value={reason.appliesTo} onChange={(e) => setReason((v) => ({ ...v, appliesTo: e.target.value }))}><option>ALL</option><option>CUSTOMER</option><option>RESTAURANT</option><option>DRIVER</option><option>ADMIN</option></select></label>
          <button className="button button--secondary" disabled={busy === 'reason'} type="submit">{busy === 'reason' ? 'Saving…' : 'Create reason'}</button>
        </form>
        <form className="content-card operations-panel operations-form" onSubmit={(e) => { e.preventDefault(); void run('settlement', () => request('/admin/operations/settlements', { method: 'POST', body: settlement }), 'Settlement draft created.'); }}>
          <h3>Create restaurant settlement</h3>
          <label className="field"><span>Restaurant ID</span><input required value={settlement.restaurantId} onChange={(e) => setSettlement((v) => ({ ...v, restaurantId: e.target.value.trim() }))} /></label>
          <div className="form-pair"><label className="field"><span>Period start</span><input required type="datetime-local" value={settlement.periodStart} onChange={(e) => setSettlement((v) => ({ ...v, periodStart: e.target.value }))} /></label><label className="field"><span>Period end</span><input required type="datetime-local" value={settlement.periodEnd} onChange={(e) => setSettlement((v) => ({ ...v, periodEnd: e.target.value }))} /></label></div>
          <label className="field"><span>Commission rate %</span><input required type="number" min="0" max="100" value={settlement.commissionRate} onChange={(e) => setSettlement((v) => ({ ...v, commissionRate: e.target.value }))} /></label>
          <button className="button button--secondary" disabled={busy === 'settlement'} type="submit">{busy === 'settlement' ? 'Calculating…' : 'Create settlement'}</button>
        </form>
        <form className="content-card operations-panel operations-form" onSubmit={(e) => { e.preventDefault(); void run('document', () => request(`/admin/operations/driver-documents/${document.id}`, { method: 'PATCH', body: { status: document.status, reviewNote: document.reviewNote || undefined } }), 'Driver document reviewed.'); }}>
          <h3>Review driver document</h3>
          <label className="field"><span>Document ID</span><input required value={document.id} onChange={(e) => setDocument((v) => ({ ...v, id: e.target.value.trim() }))} /></label>
          <label className="select-field">Decision<select value={document.status} onChange={(e) => setDocument((v) => ({ ...v, status: e.target.value }))}><option>APPROVED</option><option>REJECTED</option></select></label>
          <label className="field"><span>Review note</span><textarea value={document.reviewNote} onChange={(e) => setDocument((v) => ({ ...v, reviewNote: e.target.value }))} /></label>
          <button className="button button--secondary" disabled={busy === 'document'} type="submit">{busy === 'document' ? 'Saving…' : 'Save review'}</button>
        </form>
        <form className="content-card operations-panel operations-form" onSubmit={(e) => { e.preventDefault(); void run('assignment', () => request(`/admin/operations/admin-assignments/${assignment.userId}`, { method: 'PATCH', body: { role: assignment.role, permissions: assignment.permissions.split(',').map((item) => item.trim()).filter(Boolean) } }), 'Admin assignment updated.'); }}>
          <h3>Admin permission assignment</h3>
          <label className="field"><span>Admin user ID</span><input required value={assignment.userId} onChange={(e) => setAssignment((v) => ({ ...v, userId: e.target.value.trim() }))} /></label>
          <label className="select-field">Workspace role<select value={assignment.role} onChange={(e) => setAssignment((v) => ({ ...v, role: e.target.value }))}><option>SUPER_ADMIN</option><option>OPERATIONS</option><option>SUPPORT</option><option>FINANCE</option><option>MARKETING</option></select></label>
          <label className="field"><span>Permissions <small>comma-separated</small></span><input value={assignment.permissions} onChange={(e) => setAssignment((v) => ({ ...v, permissions: e.target.value }))} /></label>
          <button className="button button--secondary" disabled={busy === 'assignment'} type="submit">{busy === 'assignment' ? 'Saving…' : 'Save access'}</button>
        </form>
      </div>
      <section className="content-card operations-panel operations-lookups">
        <div><h3>Driver documents and order timeline</h3><p>Fetch immutable operational records before making an intervention.</p></div>
        <label className="field"><span>Driver ID</span><input value={lookup.driverId} onChange={(e) => setLookup((v) => ({ ...v, driverId: e.target.value.trim() }))} /></label>
        <button className="button button--secondary" disabled={!lookup.driverId || busy === 'documents'} onClick={() => void run('documents', () => request(`/admin/operations/drivers/${lookup.driverId}/documents`), 'Driver documents loaded.')} type="button">Load documents</button>
        <label className="field"><span>Order ID</span><input value={lookup.orderId} onChange={(e) => setLookup((v) => ({ ...v, orderId: e.target.value.trim() }))} /></label>
        <button className="button button--secondary" disabled={!lookup.orderId || busy === 'timeline'} onClick={() => void run('timeline', () => request(`/admin/operations/orders/${lookup.orderId}/timeline`), 'Order timeline loaded.')} type="button">Load timeline</button>
        <button className="button button--secondary" disabled={!schedule.restaurantId || busy === 'schedules'} onClick={() => void run('schedules', () => request(`/admin/operations/restaurants/${schedule.restaurantId}/schedules`), 'Restaurant schedules loaded.')} type="button">Load schedules</button>
        <button className="button button--secondary" disabled={busy === 'reasons'} onClick={() => void run('reasons', () => request('/admin/operations/cancellation-reasons'), 'Cancellation reasons loaded.')} type="button">Load cancellation reasons</button>
        <button className="button button--secondary" disabled={busy === 'settlements'} onClick={() => void run('settlements', () => request('/admin/operations/settlements'), 'Settlement history loaded.')} type="button">Load settlements</button>
        <button className="button button--secondary" disabled={busy === 'export'} onClick={() => void run('export', () => request('/admin/operations/exports/orders.csv'), 'Order CSV loaded below.')} type="button">Generate orders CSV</button>
      </section>
      {result ? <details className="content-card operations-result" open><summary>Last control response</summary><pre>{result}</pre></details> : null}
    </section>
  );
}
