import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { AppIcon } from '@/components/wasil-icon-system';
import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/api-error';

type AppNotification = {
  id: string;
  orderId: string | null;
  title: string;
  body: string;
  status: string;
  readAt: string | null;
  createdAt: string;
};

type InboxRole = 'CUSTOMER' | 'DRIVER' | 'ADMIN';

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function NotificationInbox({ role }: { role: InboxRole }) {
  const queryClient = useQueryClient();
  const notifications = useQuery<AppNotification[]>({
    queryKey: ['notifications', 'mine'],
    queryFn: () => api.get('/notifications/mine').then((res) => res.data),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`).then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'mine'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all').then((res) => res.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', 'mine'] }),
    onError: (error) => Alert.alert('Could not update notifications', getApiErrorMessage(error)),
  });

  const items = notifications.data ?? [];
  const unread = items.filter((item) => !item.readAt).length;

  function open(item: AppNotification) {
    if (!item.readAt) markRead.mutate(item.id);
    if (role === 'CUSTOMER' && item.orderId) {
      router.push(`/(customer)/(index)/oder/${item.orderId}` as never);
    } else if (role === 'DRIVER') {
      router.push('/(driver)/active' as never);
    } else if (role === 'ADMIN') {
      router.push('/(admin)/orders' as never);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={notifications.isFetching} onRefresh={() => void notifications.refetch()} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>UPDATES</Text>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>{unread ? `${unread} unread update${unread === 1 ? '' : 's'}` : 'You are all caught up'}</Text>
          </View>
          <View style={styles.headerIcon}><AppIcon color={brand.colors.light.primary} name="notifications" size="md" /></View>
        </View>
        {unread ? <Pressable accessibilityRole="button" disabled={markAllRead.isPending} onPress={() => markAllRead.mutate()} style={styles.readAll}><Text style={styles.readAllText}>{markAllRead.isPending ? 'Updating…' : 'Mark all as read'}</Text></Pressable> : null}
        {notifications.isError ? <RequestErrorState error={notifications.error} onRetry={() => void notifications.refetch()} title="Could not load notifications" /> : items.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><AppIcon color={brand.colors.light.mint} name="notifications" size="lg" /></View><Text style={styles.emptyTitle}>No updates yet</Text><Text style={styles.emptyCopy}>Order, delivery, and account updates will appear here.</Text></View> : <View style={styles.list}>{items.map((item) => <Pressable accessibilityRole="button" key={item.id} onPress={() => open(item)} style={({ pressed }) => [styles.row, !item.readAt && styles.rowUnread, pressed && styles.pressed]}><View style={[styles.rowIcon, !item.readAt && styles.rowIconUnread]}><AppIcon color={!item.readAt ? brand.colors.light.primary : brand.colors.light.inkMuted} name={item.status === 'FAILED' ? 'warning' : 'notifications'} size="sm" /></View><View style={styles.rowCopy}><View style={styles.rowTop}><Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text><Text style={styles.time}>{relativeTime(item.createdAt)}</Text></View><Text numberOfLines={2} style={styles.rowBody}>{item.body}</Text></View>{!item.readAt ? <View style={styles.unreadDot} /> : null}</Pressable>)}</View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { padding: 20, paddingBottom: 28 + BottomTabInset },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { color: brand.colors.light.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: brand.colors.light.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 3 },
  subtitle: { color: brand.colors.light.inkMuted, fontSize: 13, marginTop: 4 },
  headerIcon: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 18, height: 52, justifyContent: 'center', width: 52 },
  readAll: { alignSelf: 'flex-start', marginBottom: 12, paddingVertical: 6 },
  readAllText: { color: brand.colors.light.primary, fontSize: 13, fontWeight: '800' },
  list: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.large, borderWidth: 1, overflow: 'hidden' },
  row: { alignItems: 'flex-start', borderBottomColor: brand.colors.light.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, padding: 14 },
  rowUnread: { backgroundColor: '#FFF7F3' },
  rowIcon: { alignItems: 'center', backgroundColor: brand.colors.light.surfaceMuted, borderRadius: 12, height: 34, justifyContent: 'center', width: 34 },
  rowIconUnread: { backgroundColor: brand.colors.light.primarySoft },
  rowCopy: { flex: 1 },
  rowTop: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  rowTitle: { color: brand.colors.light.ink, flex: 1, fontSize: 14, fontWeight: '800' },
  time: { color: brand.colors.light.inkMuted, fontSize: 10 },
  rowBody: { color: brand.colors.light.inkMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  unreadDot: { backgroundColor: brand.colors.light.primary, borderRadius: 4, height: 8, marginTop: 5, width: 8 },
  empty: { alignItems: 'center', backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.large, borderWidth: 1, marginTop: 30, padding: 30 },
  emptyIcon: { alignItems: 'center', backgroundColor: '#E9F8F1', borderRadius: 24, height: 58, justifyContent: 'center', width: 58 },
  emptyTitle: { color: brand.colors.light.ink, fontSize: 17, fontWeight: '900', marginTop: 14 },
  emptyCopy: { color: brand.colors.light.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
