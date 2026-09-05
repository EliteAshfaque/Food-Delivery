import { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AccountStatus, UserRole, type AccountStatus as AccountStatusType, type UserRole as UserRoleType } from '@food-delivery/types';

import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/api-error';
import { ActionButton, ActionReasonModal, AdminHeader, AdminPagination, FilterPill, formatAdminDate, humanize, StatusPill } from '@/features/admin/components';
import type { AdminUser, Paginated } from '@/features/admin/types';
import { useAuth } from '@/context/auth-context';

type AccountFilter = AccountStatusType | 'ALL';

const filters: { label: string; value: AccountFilter }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: AccountStatus.PENDING_APPROVAL },
  { label: 'Active', value: AccountStatus.ACTIVE },
  { label: 'Suspended', value: AccountStatus.SUSPENDED },
  { label: 'Rejected', value: AccountStatus.REJECTED },
];

function nextRole(role: UserRoleType): UserRoleType {
  if (role === UserRole.CUSTOMER) return UserRole.RESTAURANT_OWNER;
  if (role === UserRole.RESTAURANT_OWNER) return UserRole.DRIVER;
  return UserRole.CUSTOMER;
}

export default function AdminUsersScreen() {
  const { user: currentUser } = useAuth();
  const [filter, setFilter] = useState<AccountFilter>('ALL');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusAction, setStatusAction] = useState<{
    user: AdminUser;
    status: AccountStatusType;
  } | null>(null);
  const queryClient = useQueryClient();
  const users = useQuery<Paginated<AdminUser>>({
    queryKey: ['admin-users', filter, page, search],
    queryFn: () =>
      api
        .get('/admin/users', {
          params: {
            pageSize: 50,
            page,
            accountStatus: filter === 'ALL' ? undefined : filter,
            search: search.trim() || undefined,
          },
        })
        .then((res) => res.data),
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, string> }) =>
      api.patch<AdminUser>(`/admin/users/${id}`, payload).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
    },
    onError: (error) => Alert.alert('Could not update account', getApiErrorMessage(error)),
  });

  function confirmStatus(user: AdminUser, accountStatus: AccountStatusType) {
    if (
      accountStatus === AccountStatus.SUSPENDED ||
      accountStatus === AccountStatus.REJECTED
    ) {
      setStatusAction({ user, status: accountStatus });
      return;
    }
    const label = humanize(accountStatus).toLowerCase();
    Alert.alert(
      `${humanize(accountStatus)} account?`,
      `${user.firstName} ${user.lastName} will be ${label}. The change takes effect immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: humanize(accountStatus),
          style: accountStatus === AccountStatus.ACTIVE ? 'default' : 'destructive',
          onPress: () => update.mutate({ id: user.id, payload: { accountStatus } }),
        },
      ],
    );
  }

  function confirmRole(user: AdminUser) {
    const role = nextRole(user.role);
    Alert.alert(
      `Change role to ${humanize(role)}?`,
      'Role changes alter which workspace the account can access. The server blocks changes that would leave an active delivery or owner order unresolved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Change role', onPress: () => update.mutate({ id: user.id, payload: { role } }) },
      ],
    );
  }

  function confirmAdminPromotion(user: AdminUser) {
    Alert.alert(
      'Grant administrator access?',
      `${user.firstName} ${user.lastName} will be able to manage accounts, restaurants, orders, offers, and audit data. Only grant this to trusted operations staff.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Grant access',
          style: 'destructive',
          onPress: () => update.mutate({ id: user.id, payload: { role: UserRole.ADMIN } }),
        },
      ],
    );
  }

  function confirmAdminRevocation(user: AdminUser) {
    Alert.alert(
      'Remove administrator access?',
      `${user.firstName} ${user.lastName} will return to a customer account and immediately lose access to operations data. The server will protect the last active administrator.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove access',
          style: 'destructive',
          onPress: () => update.mutate({ id: user.id, payload: { role: UserRole.CUSTOMER } }),
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={users.isFetching} onRefresh={() => void users.refetch()} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <AdminHeader eyebrow="ACCOUNT SAFETY" title="Users" subtitle="Approve operators, manage access, and keep delivery roles healthy." />
        <TextInput
          accessibilityLabel="Search user accounts"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search name or email"
          placeholderTextColor={brand.colors.light.inkMuted}
          style={styles.search}
          value={search}
        />
        <ScrollView contentContainerStyle={styles.filters} horizontal showsHorizontalScrollIndicator={false}>
          {filters.map((item) => <FilterPill key={item.value} active={filter === item.value} label={item.label} onPress={() => {
            setFilter(item.value);
            setPage(1);
          }} />)}
        </ScrollView>

        {users.isLoading ? <View style={styles.loading}><ActivityIndicator color={brand.colors.light.primary} size="large" /></View> : null}
        {users.isError ? <RequestErrorState error={users.error} onRetry={() => void users.refetch()} title="Could not load user accounts" /> : null}
        {users.data ? (
          <>
            <Text style={styles.resultText}>{users.data.pagination.total} account{users.data.pagination.total === 1 ? '' : 's'}</Text>
            <View style={styles.list}>
              {users.data.items.map((user) => {
                const busy = update.isPending && update.variables?.id === user.id;
                const isCurrentAdministrator = currentUser?.id === user.id;
                const isAnotherAdministrator =
                  user.role === UserRole.ADMIN && !isCurrentAdministrator;
                return (
                  <View key={user.id} style={styles.card}>
                    <View style={styles.cardTop}>
                      <View style={styles.avatar}><Text style={styles.avatarText}>{user.firstName.charAt(0).toUpperCase() || '?'}</Text></View>
                      <View style={styles.personCopy}>
                        <Text style={styles.name}>{user.firstName} {user.lastName}</Text>
                        <Text numberOfLines={1} style={styles.email}>{user.email ?? 'No email on record'}</Text>
                      </View>
                      <StatusPill status={user.accountStatus} />
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.meta}>{humanize(user.role)}</Text>
                      <Text style={styles.meta}>Joined {formatAdminDate(user.createdAt)}</Text>
                      {user.role === UserRole.DRIVER ? <Text style={[styles.meta, user.isOnline && styles.online]}>{user.isOnline ? 'Online' : 'Offline'}</Text> : null}
                    </View>
                    {user.accountStatusReason ? <Text style={styles.reason}>{user.accountStatusReason}</Text> : null}
                    {isCurrentAdministrator ? (
                      <Text style={styles.protected}>Your administrator account is protected from self-changes.</Text>
                    ) : (
                      <View style={styles.actions}>
                        {user.accountStatus !== AccountStatus.ACTIVE ? <ActionButton disabled={busy} icon="check" label="Activate" onPress={() => confirmStatus(user, AccountStatus.ACTIVE)} tone="success" /> : null}
                        {user.accountStatus !== AccountStatus.SUSPENDED ? <ActionButton disabled={busy} icon="warning" label="Suspend" onPress={() => confirmStatus(user, AccountStatus.SUSPENDED)} tone="warning" /> : null}
                        {user.accountStatus !== AccountStatus.REJECTED ? <ActionButton disabled={busy} icon="close" label="Reject" onPress={() => confirmStatus(user, AccountStatus.REJECTED)} tone="danger" /> : null}
                        {isAnotherAdministrator ? (
                          <ActionButton disabled={busy} icon="close" label="Remove admin" onPress={() => confirmAdminRevocation(user)} tone="danger" />
                        ) : (
                          <>
                            <ActionButton disabled={busy} icon="edit" label={`Make ${humanize(nextRole(user.role))}`} onPress={() => confirmRole(user)} tone="info" />
                            <ActionButton disabled={busy} icon="verifiedRestaurant" label="Grant admin" onPress={() => confirmAdminPromotion(user)} tone="warning" />
                          </>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
              {users.data.items.length === 0 ? <Text style={styles.empty}>No accounts match these filters.</Text> : null}
            </View>
            <AdminPagination
              onPageChange={setPage}
              page={users.data.pagination.page}
              total={users.data.pagination.total}
              totalPages={users.data.pagination.totalPages}
            />
          </>
        ) : null}
      </ScrollView>
      <ActionReasonModal
        confirmLabel={statusAction ? humanize(statusAction.status) : 'Update'}
        description={statusAction ? `Explain why ${statusAction.user.firstName} ${statusAction.user.lastName} is being ${humanize(statusAction.status).toLowerCase()}. This note is shown to the account and recorded for operations.` : ''}
        onClose={() => setStatusAction(null)}
        onConfirm={(reason) => {
          if (!statusAction) return;
          update.mutate(
            {
              id: statusAction.user.id,
              payload: {
                accountStatus: statusAction.status,
                accountStatusReason: reason,
              },
            },
            { onSuccess: () => setStatusAction(null) },
          );
        }}
        placeholder="Reason for this account decision"
        required
        submitting={update.isPending}
        title={statusAction ? `${humanize(statusAction.status)} account` : 'Update account'}
        visible={Boolean(statusAction)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { padding: 16, paddingBottom: 28 + BottomTabInset },
  search: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, color: brand.colors.light.ink, fontSize: 15, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 12 },
  filters: { gap: 8, paddingBottom: 16 },
  loading: { minHeight: 300, justifyContent: 'center' },
  resultText: { color: brand.colors.light.inkMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  list: { gap: 10 },
  card: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, padding: 14 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  avatar: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  avatarText: { color: brand.colors.light.primary, fontSize: 15, fontWeight: '900' },
  personCopy: { flex: 1 },
  name: { color: brand.colors.light.ink, fontSize: 15, fontWeight: '900' },
  email: { color: brand.colors.light.inkMuted, fontSize: 12, marginTop: 2 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  meta: { color: brand.colors.light.inkMuted, fontSize: 11, fontWeight: '700' },
  online: { color: brand.colors.light.mint },
  reason: { backgroundColor: brand.colors.light.surfaceMuted, borderRadius: 8, color: brand.colors.light.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 10, padding: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  protected: { color: brand.colors.light.inkMuted, fontSize: 11, fontWeight: '800', marginTop: 12 },
  empty: { color: brand.colors.light.inkMuted, fontSize: 14, paddingVertical: 30, textAlign: 'center' },
});
