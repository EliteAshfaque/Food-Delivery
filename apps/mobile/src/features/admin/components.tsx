import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppIcon, type AppIconName } from '@/components/wasil-icon-system';
import { brand } from '@/constants/brand';

type Tone = 'danger' | 'info' | 'muted' | 'success' | 'warning';

const tones: Record<Tone, { background: string; color: string }> = {
  danger: { background: '#FDECEE', color: brand.colors.light.danger },
  info: { background: '#EAF1FF', color: '#2F6FED' },
  muted: { background: '#F3F0F1', color: brand.colors.light.inkMuted },
  success: { background: '#E7F6F0', color: brand.colors.light.mint },
  warning: { background: '#FFF5DF', color: brand.colors.light.warning },
};

export function getAdminTone(status: string): Tone {
  if (['ACTIVE', 'APPROVED', 'DELIVERED'].includes(status)) return 'success';
  if (['SUSPENDED', 'REJECTED', 'CANCELLED', 'ARCHIVED'].includes(status)) {
    return 'danger';
  }
  if (
    [
      'PENDING_APPROVAL',
      'PENDING',
      'PREPARING',
      'PAUSED',
      'CANCELLATION_IN_PROGRESS',
      'REFUND_PENDING',
    ].includes(status)
  ) {
    return 'warning';
  }
  if (['READY', 'PICKED_UP', 'CONFIRMED', 'SCHEDULED'].includes(status)) {
    return 'info';
  }
  return 'muted';
}

export function humanize(value: string | null | undefined) {
  if (!value) return 'Unknown';

  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function StatusPill({ status }: { status: string }) {
  const tone = tones[getAdminTone(status)];
  return (
    <View style={[styles.statusPill, { backgroundColor: tone.background }]}> 
      <Text style={[styles.statusText, { color: tone.color }]}>
        {humanize(status)}
      </Text>
    </View>
  );
}

export function AdminHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerIcon}>
        <AppIcon color="#FFFFFF" name="settings" size="md" />
      </View>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

export function ActionButton({
  accessibilityLabel,
  icon,
  label,
  loading = false,
  onPress,
  tone = 'muted',
  disabled = false,
}: {
  accessibilityLabel?: string;
  icon?: AppIconName;
  label: string;
  loading?: boolean;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  const styleTone = tones[tone];
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: styleTone.background },
        unavailable && styles.disabled,
        pressed && !unavailable && styles.pressed,
      ]}>
      {loading ? <ActivityIndicator color={styleTone.color} size="small" /> : icon ? <AppIcon color={styleTone.color} name={icon} size="xs" /> : null}
      <Text style={[styles.actionText, { color: styleTone.color }]}>{label}</Text>
    </Pressable>
  );
}

export function FilterPill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} filter`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filter,
        active && styles.filterActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function formatAdminDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Local date/time for operational records; gracefully handles malformed API data. */
export function formatAdminDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function shortAdminId(value: string) {
  return value ? `#${value.slice(0, 8).toUpperCase()}` : '—';
}

/**
 * Server pagination is authoritative. Keeping page controls shared prevents
 * admin screens from silently showing only their first 50 records.
 */
export function AdminPagination({
  onPageChange,
  page,
  total,
  totalPages,
}: {
  onPageChange: (page: number) => void;
  page: number;
  total: number;
  totalPages: number;
}) {
  // A mutation or another operator can remove the final row on the current
  // page. The API correctly returns an empty page in that case; give the
  // operator a recovery control instead of stranding them on that page.
  const lastAvailablePage = Math.max(totalPages, 1);
  if (page > lastAvailablePage) {
    return (
      <View style={styles.paginationRecovery}>
        <Text style={styles.paginationCopy}>
          The result set changed while you were viewing it.
        </Text>
        <Pressable
          accessibilityLabel="Return to the last available page"
          accessibilityRole="button"
          onPress={() => onPageChange(lastAvailablePage)}
          style={({ pressed }) => [
            styles.paginationButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.paginationButtonText}>Refresh results</Text>
        </Pressable>
      </View>
    );
  }

  if (totalPages <= 1) return null;

  return (
    <View style={styles.pagination}>
      <Text style={styles.paginationCopy}>
        {total} total · Page {page} of {totalPages}
      </Text>
      <View style={styles.paginationActions}>
        <Pressable
          accessibilityLabel="Previous page"
          accessibilityRole="button"
          accessibilityState={{ disabled: page <= 1 }}
          disabled={page <= 1}
          onPress={() => onPageChange(page - 1)}
          style={({ pressed }) => [
            styles.paginationButton,
            page <= 1 && styles.disabled,
            pressed && page > 1 && styles.pressed,
          ]}>
          <Text style={styles.paginationButtonText}>Previous</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Next page"
          accessibilityRole="button"
          accessibilityState={{ disabled: page >= totalPages }}
          disabled={page >= totalPages}
          onPress={() => onPageChange(page + 1)}
          style={({ pressed }) => [
            styles.paginationButton,
            page >= totalPages && styles.disabled,
            pressed && page < totalPages && styles.pressed,
          ]}>
          <Text style={styles.paginationButtonText}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ActionReasonModalProps = {
  confirmLabel: string;
  description: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  placeholder?: string;
  required?: boolean;
  submitting?: boolean;
  title: string;
  tone?: Tone;
  visible: boolean;
};

/** A shared reason capture sheet keeps destructive operational actions auditable. */
export function ActionReasonModal(props: ActionReasonModalProps) {
  // Opening a modal creates a new reason draft. A keyed child gives each
  // session a clean draft without copying the `visible` prop into state.
  return (
    <ActionReasonModalContent
      key={props.visible ? 'open' : 'closed'}
      {...props}
    />
  );
}

function ActionReasonModalContent({
  confirmLabel,
  description,
  onClose,
  onConfirm,
  placeholder = 'Add a note for the audit log',
  required = false,
  submitting = false,
  title,
  tone = 'danger',
  visible,
}: ActionReasonModalProps) {
  const [reason, setReason] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const color = tones[tone].color;

  function submit() {
    const trimmed = reason.trim();
    if (required && !trimmed) {
      setShowValidation(true);
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalKeyboardAvoider}>
        <View style={styles.modalOverlay}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
            style={styles.modalScroll}>
            <View accessibilityViewIsModal style={styles.modalCard}>
              <View style={[styles.modalIcon, { backgroundColor: tones[tone].background }]}>
                <AppIcon color={color} name={tone === 'danger' ? 'warning' : 'information'} size="md" />
              </View>
              <Text accessibilityRole="header" style={styles.modalTitle}>{title}</Text>
              <Text style={styles.modalDescription}>{description}</Text>
              <TextInput
                accessibilityLabel={placeholder}
                autoFocus
                editable={!submitting}
                maxLength={500}
                multiline
                onChangeText={(value) => {
                  setReason(value);
                  if (showValidation && value.trim()) setShowValidation(false);
                }}
                placeholder={placeholder}
                placeholderTextColor={brand.colors.light.inkMuted}
                style={[styles.reasonInput, showValidation && styles.reasonInputError]}
                textAlignVertical="top"
                value={reason}
              />
              {showValidation ? <Text accessibilityRole="alert" style={styles.validation}>A reason is required for this action.</Text> : null}
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: submitting }}
                  disabled={submitting}
                  onPress={onClose}
                  style={styles.modalCancel}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={confirmLabel}
                  accessibilityRole="button"
                  accessibilityState={{ busy: submitting, disabled: submitting }}
                  disabled={submitting}
                  onPress={submit}
                  style={[styles.modalConfirm, { backgroundColor: color }, submitting && styles.disabled]}>
                  {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalConfirmText}>{confirmLabel}</Text>}
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 22,
  },
  headerIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.ink,
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: brand.colors.light.primaryText,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: brand.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: { fontSize: 10, fontWeight: '900' },
  action: {
    alignItems: 'center',
    borderRadius: brand.radius.small,
    flexDirection: 'row',
    gap: 5,
    minHeight: 40,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  actionText: { fontSize: 12, fontWeight: '900' },
  filter: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterActive: {
    backgroundColor: brand.colors.light.ink,
    borderColor: brand.colors.light.ink,
  },
  filterText: { color: brand.colors.light.inkMuted, fontSize: 12, fontWeight: '800' },
  filterTextActive: { color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  pagination: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  paginationRecovery: { alignItems: 'center', borderTopColor: brand.colors.light.border, borderTopWidth: StyleSheet.hairlineWidth, gap: 10, marginTop: 18, paddingTop: 16 },
  paginationCopy: { color: brand.colors.light.inkMuted, flex: 1, fontSize: 11, fontWeight: '700' },
  paginationActions: { flexDirection: 'row', gap: 8 },
  paginationButton: { alignItems: 'center', backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.small, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 11 },
  paginationButtonText: { color: brand.colors.light.ink, fontSize: 12, fontWeight: '900' },
  modalKeyboardAvoider: { flex: 1 },
  modalOverlay: { alignItems: 'center', backgroundColor: 'rgba(37,25,42,0.45)', flex: 1, justifyContent: 'flex-end', padding: 14 },
  modalScroll: { maxHeight: '100%', width: '100%' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: brand.colors.light.surface, borderRadius: brand.radius.large, maxWidth: 560, padding: 20, width: '100%' },
  modalIcon: { alignItems: 'center', borderRadius: 18, height: 42, justifyContent: 'center', width: 42 },
  modalTitle: { color: brand.colors.light.ink, fontSize: 20, fontWeight: '900', marginTop: 14 },
  modalDescription: { color: brand.colors.light.inkMuted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  reasonInput: { backgroundColor: brand.colors.light.canvas, borderColor: brand.colors.light.border, borderRadius: brand.radius.small, borderWidth: 1, color: brand.colors.light.ink, fontSize: 14, minHeight: 82, marginTop: 16, padding: 11 },
  reasonInputError: { borderColor: brand.colors.light.danger },
  validation: { color: brand.colors.light.danger, fontSize: 11, fontWeight: '700', marginTop: 6 },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  modalCancel: { alignItems: 'center', borderColor: brand.colors.light.border, borderRadius: brand.radius.small, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 15 },
  modalCancelText: { color: brand.colors.light.inkMuted, fontSize: 13, fontWeight: '900' },
  modalConfirm: { alignItems: 'center', borderRadius: brand.radius.small, justifyContent: 'center', minHeight: 44, minWidth: 112, paddingHorizontal: 15 },
  modalConfirmText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});
