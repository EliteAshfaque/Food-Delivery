import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppIcon } from '@/components/wasil-icon-system';
import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { AdminHeader, AdminPagination, formatAdminDateTime, humanize } from '@/features/admin/components';
import type { AdminAuditLog, Paginated } from '@/features/admin/types';

function metadataSummary(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  const entries = Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .slice(0, 3)
    .map(([key, value]) => `${humanize(key)}: ${String(value)}`);
  return entries.length ? entries.join(' · ') : null;
}

export default function AdminAuditScreen() {
  const [page, setPage] = useState(1);
  const audit = useQuery<Paginated<AdminAuditLog>>({
    queryKey: ['admin-audit-logs', page],
    queryFn: () => api.get('/admin/audit-logs', { params: { page, pageSize: 100 } }).then((res) => res.data),
  });
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={audit.isFetching} onRefresh={() => void audit.refetch()} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <AdminHeader eyebrow="ACCOUNTABILITY" title="Audit log" subtitle="Every privileged change is traceable to its actor and target." />
        {audit.isLoading ? <View style={styles.loading}><ActivityIndicator color={brand.colors.light.primary} size="large" /></View> : null}
        {audit.isError ? <RequestErrorState error={audit.error} onRetry={() => void audit.refetch()} title="Could not load the audit log" /> : null}
        {audit.data ? <>
          <Text style={styles.resultText}>{audit.data.pagination.total} recorded action{audit.data.pagination.total === 1 ? '' : 's'}</Text>
          <View style={styles.list}>
            {audit.data.items.map(({ actor, log }) => {
              const metadata = metadataSummary(log.metadata);
              return <View key={log.id} style={styles.card}>
                <View style={styles.icon}><AppIcon color={brand.colors.light.ink} name="orderHistory" size="sm" /></View>
                <View style={styles.copy}>
                  <Text style={styles.action}>{humanize(log.action)}</Text>
                  <Text style={styles.actor}>{actor.firstName} {actor.lastName} · {humanize(log.targetType)} #{log.targetId.slice(0, 8)}</Text>
                  {metadata ? <Text numberOfLines={3} style={styles.metadata}>{metadata}</Text> : null}
                  <Text style={styles.date}>{formatAdminDateTime(log.createdAt)}</Text>
                </View>
              </View>;
            })}
            {audit.data.items.length === 0 ? <Text style={styles.empty}>Privileged actions will appear here as your operations team works.</Text> : null}
          </View>
          <AdminPagination
            onPageChange={setPage}
            page={audit.data.pagination.page}
            total={audit.data.pagination.total}
            totalPages={audit.data.pagination.totalPages}
          />
        </> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { padding: 16, paddingBottom: 28 + BottomTabInset },
  loading: { minHeight: 300, justifyContent: 'center' },
  resultText: { color: brand.colors.light.inkMuted, fontSize: 12, fontWeight: '700', marginBottom: 10 },
  list: { gap: 10 },
  card: { alignItems: 'flex-start', backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 14 },
  icon: { alignItems: 'center', backgroundColor: brand.colors.light.surfaceMuted, borderRadius: 15, height: 30, justifyContent: 'center', width: 30 },
  copy: { flex: 1 },
  action: { color: brand.colors.light.ink, fontSize: 14, fontWeight: '900' },
  actor: { color: brand.colors.light.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  metadata: { backgroundColor: brand.colors.light.canvas, borderRadius: 7, color: brand.colors.light.inkMuted, fontSize: 10, lineHeight: 15, marginTop: 8, padding: 7 },
  date: { color: brand.colors.light.primaryText, fontSize: 10, fontWeight: '800', marginTop: 8 },
  empty: { color: brand.colors.light.inkMuted, fontSize: 14, lineHeight: 20, paddingVertical: 30, textAlign: 'center' },
});
