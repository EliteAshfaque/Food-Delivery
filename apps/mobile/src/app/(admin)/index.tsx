import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';

import { AppIcon } from '@/components/wasil-icon-system';
import { WasilLogo } from '@/components/wasil-brand';
import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { formatCurrency } from '@/lib/format';
import { AdminHeader, formatAdminDateTime, humanize } from '@/features/admin/components';
import type { AdminAuditLog, AdminDashboard, Paginated } from '@/features/admin/types';

type Shortcut = {
  href: '/(admin)/users' | '/(admin)/restaurants' | '/(admin)/orders' | '/(admin)/offers' | '/(admin)/notifications';
  icon: 'profile' | 'restaurant' | 'orders' | 'coupon' | 'notifications';
  label: string;
  detail: string;
};

const shortcuts: Shortcut[] = [
  { href: '/(admin)/users', icon: 'profile', label: 'People', detail: 'Approve and manage accounts' },
  { href: '/(admin)/restaurants', icon: 'restaurant', label: 'Restaurants', detail: 'Moderate partner stores' },
  { href: '/(admin)/orders', icon: 'orders', label: 'Orders', detail: 'Monitor live operations' },
  { href: '/(admin)/offers', icon: 'coupon', label: 'Offers', detail: 'Curate campaigns' },
  { href: '/(admin)/notifications', icon: 'notifications', label: 'Notifications', detail: 'Review delivery updates' },
];

export default function AdminDashboardScreen() {
  const dashboard = useQuery<AdminDashboard>({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get('/admin/dashboard').then((res) => res.data),
    refetchInterval: 30_000,
  });
  const audit = useQuery<Paginated<AdminAuditLog>>({
    queryKey: ['admin-audit-preview'],
    queryFn: () => api.get('/admin/audit-logs', { params: { pageSize: 4 } }).then((res) => res.data),
  });

  const isLoading = dashboard.isLoading || audit.isLoading;
  const pendingUsers = dashboard.data?.users.pendingApproval ?? 0;
  const pendingRestaurants = dashboard.data?.restaurants.pendingApproval ?? 0;
  const activeOrders = Object.entries(dashboard.data?.orders.byStatus ?? {})
    .filter(([status]) => !['CANCELLED', 'DELIVERED'].includes(status))
    .reduce((sum, [, total]) => sum + Number(total ?? 0), 0);

  function refresh() {
    void dashboard.refetch();
    void audit.refetch();
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={dashboard.isFetching || audit.isFetching} onRefresh={refresh} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <WasilLogo size={34} />
          <View style={styles.adminPill}>
            <AppIcon color={brand.colors.light.mint} name="verifiedRestaurant" size="xs" />
            <Text style={styles.adminPillText}>ADMIN</Text>
          </View>
        </View>

        <AdminHeader
          eyebrow="OPERATIONS CONTROL"
          title="Command center"
          subtitle="Monitor approvals, orders, campaigns, and every privileged action."
        />

        {isLoading ? (
          <View style={styles.loading}><ActivityIndicator color={brand.colors.light.primary} size="large" /></View>
        ) : dashboard.isError || audit.isError ? (
          <RequestErrorState error={dashboard.error ?? audit.error} onRetry={refresh} title="Admin data is unavailable" />
        ) : dashboard.data ? (
          <>
            <View style={styles.hero}>
              <View style={styles.heroGlow} />
              <Text style={styles.heroEyebrow}>DELIVERED ORDER REVENUE</Text>
              <Text style={styles.heroValue}>{formatCurrency(dashboard.data.orders.completedRevenue)}</Text>
              <Text style={styles.heroText}>Live operational totals · refreshed {formatAdminDateTime(dashboard.data.generatedAt)}</Text>
              <View style={styles.heroStats}>
                <HeroMetric label="Open orders" value={String(activeOrders)} />
                <View style={styles.heroDivider} />
                <HeroMetric label="Pending people" value={String(pendingUsers)} />
                <View style={styles.heroDivider} />
                <HeroMetric label="Pending stores" value={String(pendingRestaurants)} />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Priority queue</Text>
            <View style={styles.priorityRow}>
              <Pressable
                accessibilityLabel={`${pendingUsers} accounts awaiting review`}
                accessibilityRole="button"
                onPress={() => router.push('/(admin)/users' as never)}
                style={[styles.priorityCard, styles.priorityPeople]}>
                <Text style={styles.priorityValue}>{pendingUsers}</Text>
                <Text style={styles.priorityLabel}>Accounts awaiting review</Text>
                <AppIcon color={brand.colors.light.warning} name="warning" size="sm" />
              </Pressable>
              <Pressable
                accessibilityLabel={`${pendingRestaurants} restaurants awaiting approval`}
                accessibilityRole="button"
                onPress={() => router.push('/(admin)/restaurants' as never)}
                style={[styles.priorityCard, styles.priorityStores]}>
                <Text style={styles.priorityValue}>{pendingRestaurants}</Text>
                <Text style={styles.priorityLabel}>Restaurants awaiting approval</Text>
                <AppIcon color="#2F6FED" name="restaurant" size="sm" />
              </Pressable>
            </View>

            <Text style={styles.sectionTitle}>Manage Wasil</Text>
            <View style={styles.shortcutGrid}>
              {shortcuts.map((shortcut) => (
                <Pressable
                  accessibilityHint={shortcut.detail}
                  accessibilityLabel={shortcut.label}
                  accessibilityRole="button"
                  key={shortcut.label}
                  onPress={() => router.push(shortcut.href as never)}
                  style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
                  <View style={styles.shortcutIcon}><AppIcon color={brand.colors.light.primary} name={shortcut.icon} size="sm" /></View>
                  <Text style={styles.shortcutTitle}>{shortcut.label}</Text>
                  <Text style={styles.shortcutDetail}>{shortcut.detail}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Recent audit activity</Text>
              <Pressable
                accessibilityLabel="View all audit activity"
                accessibilityRole="button"
                onPress={() => router.push('/(admin)/audit' as never)}>
                <Text style={styles.seeAll}>View all</Text>
              </Pressable>
            </View>
            <View style={styles.auditCard}>
              {audit.data?.items.length ? audit.data.items.map(({ actor, log }) => (
                <View key={log.id} style={styles.auditRow}>
                  <View style={styles.auditIcon}><AppIcon color={brand.colors.light.ink} name="orderHistory" size="xs" /></View>
                  <View style={styles.auditCopy}>
                    <Text style={styles.auditTitle}>{humanize(log.action)}</Text>
                    <Text style={styles.auditDetail}>{actor.firstName} {actor.lastName} · {humanize(log.targetType)}</Text>
                  </View>
                  <Text style={styles.auditDate}>{formatAdminDateTime(log.createdAt)}</Text>
                </View>
              )) : <Text style={styles.emptyText}>No privileged actions have been recorded yet.</Text>}
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return <View style={styles.heroMetric}><Text style={styles.heroMetricValue}>{value}</Text><Text style={styles.heroMetricLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { padding: 16, paddingBottom: 28 + BottomTabInset },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 26 },
  adminPill: { alignItems: 'center', backgroundColor: '#E7F6F0', borderRadius: brand.radius.pill, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 7 },
  adminPillText: { color: brand.colors.light.mint, fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  loading: { minHeight: 360, justifyContent: 'center' },
  hero: { backgroundColor: brand.colors.light.ink, borderRadius: brand.radius.large, marginBottom: 24, overflow: 'hidden', padding: 20 },
  heroGlow: { backgroundColor: '#F2552C', borderRadius: 100, height: 200, opacity: 0.16, position: 'absolute', right: -82, top: -95, width: 200 },
  heroEyebrow: { color: '#FFB09D', fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  heroValue: { color: '#FFF8F4', fontSize: 31, fontWeight: '900', letterSpacing: -0.8, marginTop: 8 },
  heroText: { color: '#DCCDD4', fontSize: 12, marginTop: 4 },
  heroStats: { borderTopColor: '#FFFFFF1F', borderTopWidth: 1, flexDirection: 'row', marginTop: 20, paddingTop: 15 },
  heroMetric: { flex: 1 },
  heroMetricValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  heroMetricLabel: { color: '#CDBFC3', fontSize: 10, lineHeight: 14, marginTop: 3 },
  heroDivider: { backgroundColor: '#FFFFFF1F', marginHorizontal: 8, width: 1 },
  sectionTitle: { color: brand.colors.light.ink, fontSize: 17, fontWeight: '900', letterSpacing: -0.2, marginBottom: 12 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  seeAll: { color: brand.colors.light.primary, fontSize: 12, fontWeight: '900', marginBottom: 12 },
  priorityRow: { flexDirection: 'row', gap: 10 },
  priorityCard: { borderRadius: brand.radius.medium, flex: 1, minHeight: 132, padding: 14 },
  priorityPeople: { backgroundColor: '#FFF5DF' },
  priorityStores: { backgroundColor: '#EAF1FF' },
  priorityValue: { color: brand.colors.light.ink, fontSize: 27, fontWeight: '900' },
  priorityLabel: { color: brand.colors.light.inkMuted, flex: 1, fontSize: 12, lineHeight: 17, marginTop: 4 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, minHeight: 138, padding: 14, width: '48.5%' },
  shortcutIcon: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 12, height: 32, justifyContent: 'center', width: 32 },
  shortcutTitle: { color: brand.colors.light.ink, fontSize: 15, fontWeight: '900', marginTop: 10 },
  shortcutDetail: { color: brand.colors.light.inkMuted, fontSize: 11, lineHeight: 15, marginTop: 3 },
  auditCard: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, overflow: 'hidden' },
  auditRow: { alignItems: 'center', borderBottomColor: brand.colors.light.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 9, padding: 13 },
  auditIcon: { alignItems: 'center', backgroundColor: brand.colors.light.surfaceMuted, borderRadius: 12, height: 28, justifyContent: 'center', width: 28 },
  auditCopy: { flex: 1 },
  auditTitle: { color: brand.colors.light.ink, fontSize: 12, fontWeight: '900' },
  auditDetail: { color: brand.colors.light.inkMuted, fontSize: 11, marginTop: 2 },
  auditDate: { color: brand.colors.light.inkMuted, fontSize: 10 },
  emptyText: { color: brand.colors.light.inkMuted, fontSize: 13, padding: 18, textAlign: 'center' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
});
