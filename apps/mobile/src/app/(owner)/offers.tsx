import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/wasil-icon-system';
import { RequestErrorState } from '@/components/request-error-state';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { api } from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/api-error';
import { formatCurrency } from '@/lib/format';
import { formatAdminDate, StatusPill } from '@/features/admin/components';

type OwnerOffer = {
  id: string;
  title: string;
  description: string | null;
  code: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  minimumOrderAmount: string;
  maximumDiscountAmount: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number;
  autoApply: boolean;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED';
  effectiveStatus: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'ARCHIVED';
  startsAt: string;
  endsAt: string;
};

type OfferForm = {
  title: string;
  code: string;
  discountType: OwnerOffer['discountType'];
  discountValue: string;
  minimumOrderAmount: string;
  usageLimit: string;
  perCustomerLimit: string;
  autoApply: boolean;
  startsAt: string;
  endsAt: string;
};

function makeDefaultForm(): OfferForm {
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1_000);
  return {
    title: '',
    code: '',
    discountType: 'PERCENTAGE',
    discountValue: '',
    minimumOrderAmount: '0',
    usageLimit: '',
    perCustomerLimit: '1',
    autoApply: true,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
  };
}

function formFromOffer(offer: OwnerOffer): OfferForm {
  return {
    title: offer.title,
    code: offer.code ?? '',
    discountType: offer.discountType,
    discountValue: String(offer.discountValue),
    minimumOrderAmount: String(offer.minimumOrderAmount),
    usageLimit: offer.usageLimit == null ? '' : String(offer.usageLimit),
    perCustomerLimit: String(offer.perCustomerLimit),
    autoApply: offer.autoApply,
    startsAt: new Date(offer.startsAt).toISOString(),
    endsAt: new Date(offer.endsAt).toISOString(),
  };
}

function validateOfferForm(form: OfferForm) {
  if (form.title.trim().length < 2 || form.title.trim().length > 80) {
    return 'Offer title must be between 2 and 80 characters.';
  }
  if (!form.autoApply && !/^[A-Za-z0-9_-]{3,32}$/.test(form.code.trim())) {
    return 'Enter a promo code using 3–32 letters, numbers, hyphens, or underscores.';
  }
  const discount = Number(form.discountValue);
  if (!Number.isFinite(discount) || discount <= 0 || (form.discountType === 'PERCENTAGE' && discount > 100)) {
    return form.discountType === 'PERCENTAGE'
      ? 'Enter a percentage between 0.01 and 100.'
      : 'Enter a valid fixed discount greater than zero.';
  }
  const minimum = Number(form.minimumOrderAmount);
  if (!Number.isFinite(minimum) || minimum < 0) return 'Minimum order cannot be negative.';
  const customerLimit = Number(form.perCustomerLimit);
  if (!Number.isInteger(customerLimit) || customerLimit < 1 || customerLimit > 100) {
    return 'Per-customer limit must be a whole number from 1 to 100.';
  }
  if (form.usageLimit.trim()) {
    const usageLimit = Number(form.usageLimit);
    if (!Number.isInteger(usageLimit) || usageLimit < 1) return 'Usage limit must be a positive whole number.';
  }
  const startsAt = new Date(form.startsAt);
  const endsAt = new Date(form.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return 'Use valid ISO dates and make the end time later than the start time.';
  }
  return null;
}

function offerValue(offer: OwnerOffer) {
  return offer.discountType === 'PERCENTAGE'
    ? `${Number(offer.discountValue)}% off`
    : `${formatCurrency(offer.discountValue)} off`;
}

export default function OwnerOffersScreen() {
  const queryClient = useQueryClient();
  const [formVisible, setFormVisible] = useState(false);
  const [editingOffer, setEditingOffer] = useState<OwnerOffer | null>(null);
  const [form, setForm] = useState<OfferForm>(makeDefaultForm);
  const offers = useQuery<OwnerOffer[]>({
    queryKey: ['owner-offers'],
    queryFn: () => api.get('/offers/mine').then((res) => res.data),
    refetchInterval: 30_000,
  });
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editingOffer
        ? api.patch(`/offers/${editingOffer.id}`, payload).then((res) => res.data)
        : api.post('/offers', payload).then((res) => res.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['owner-offers'] });
      setFormVisible(false);
    },
    onError: (error) => Alert.alert('Could not save offer', getApiErrorMessage(error)),
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' }) =>
      api.patch(`/offers/${id}/status`, { status }).then((res) => res.data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['owner-offers'] }),
    onError: (error) => Alert.alert('Could not update offer', getApiErrorMessage(error)),
  });

  function openCreate() {
    setEditingOffer(null);
    setForm(makeDefaultForm());
    setFormVisible(true);
  }

  function openEdit(offer: OwnerOffer) {
    setEditingOffer(offer);
    setForm(formFromOffer(offer));
    setFormVisible(true);
  }

  function submit() {
    const problem = validateOfferForm(form);
    if (problem) {
      Alert.alert('Check offer details', problem);
      return;
    }
    save.mutate({
      title: form.title.trim(),
      code: form.autoApply ? (editingOffer ? '' : undefined) : form.code.trim().toUpperCase(),
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minimumOrderAmount: Number(form.minimumOrderAmount),
      usageLimit: form.usageLimit.trim() ? Number(form.usageLimit) : null,
      perCustomerLimit: Number(form.perCustomerLimit),
      autoApply: form.autoApply,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
    });
  }

  function confirmArchive(offer: OwnerOffer) {
    Alert.alert('Archive offer?', 'Archived offers cannot be reactivated from the restaurant workspace.', [
      { text: 'Keep offer', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: () => changeStatus.mutate({ id: offer.id, status: 'ARCHIVED' }) },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={offers.isFetching} onRefresh={() => void offers.refetch()} tintColor={brand.colors.light.primary} />}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View><Text style={styles.eyebrow}>GROWTH TOOLS</Text><Text style={styles.title}>Hot offers</Text><Text style={styles.subtitle}>Create campaigns customers can redeem at checkout.</Text></View>
          <Pressable accessibilityRole="button" onPress={openCreate} style={styles.addButton}><AppIcon color="#FFFFFF" name="plus" size="sm" /><Text style={styles.addText}>New</Text></Pressable>
        </View>
        {offers.isLoading ? <View style={styles.loading}><ActivityIndicator color={brand.colors.light.primary} size="large" /></View> : null}
        {offers.isError ? <RequestErrorState error={offers.error} onRetry={() => void offers.refetch()} title="Could not load your offers" /> : null}
        {offers.data ? <View style={styles.list}>
          {offers.data.map((offer) => {
            const busy = changeStatus.isPending && changeStatus.variables?.id === offer.id;
            return <View key={offer.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.offerIcon}><AppIcon color={brand.colors.light.primary} name="coupon" size="sm" /></View>
                <View style={styles.offerCopy}><Text numberOfLines={1} style={styles.offerTitle}>{offer.title}</Text><Text style={styles.offerCode}>{offer.code ? `Code ${offer.code}` : 'Automatically applied'}</Text></View>
                <StatusPill status={offer.effectiveStatus} />
              </View>
              <View style={styles.valueRow}><Text style={styles.value}>{offerValue(offer)}</Text><Text style={styles.usage}>Uses {offer.usageCount}{offer.usageLimit ? ` / ${offer.usageLimit}` : ''}</Text></View>
              <Text style={styles.details}>Minimum {formatCurrency(offer.minimumOrderAmount)} · Ends {formatAdminDate(offer.endsAt)} · {offer.perCustomerLimit} per customer</Text>
              <View style={styles.actions}>
                <Pressable disabled={busy} onPress={() => openEdit(offer)} style={styles.secondaryAction}><AppIcon color={brand.colors.light.ink} name="edit" size="xs" /><Text style={styles.secondaryActionText}>Edit</Text></Pressable>
                {['ACTIVE', 'SCHEDULED'].includes(offer.effectiveStatus) ? <Pressable disabled={busy} onPress={() => changeStatus.mutate({ id: offer.id, status: 'PAUSED' })} style={styles.secondaryAction}><Text style={styles.secondaryActionText}>Pause</Text></Pressable> : null}
                {['PAUSED', 'DRAFT'].includes(offer.effectiveStatus) ? <Pressable disabled={busy} onPress={() => changeStatus.mutate({ id: offer.id, status: 'ACTIVE' })} style={styles.activateAction}><Text style={styles.activateActionText}>Activate</Text></Pressable> : null}
                {offer.effectiveStatus !== 'ARCHIVED' ? <Pressable disabled={busy} onPress={() => confirmArchive(offer)} style={styles.archiveAction}><Text style={styles.archiveActionText}>Archive</Text></Pressable> : null}
              </View>
            </View>;
          })}
          {offers.data.length === 0 ? <View style={styles.empty}><View style={styles.emptyIcon}><AppIcon color={brand.colors.light.primary} name="coupon" size="lg" /></View><Text style={styles.emptyTitle}>Create your first offer</Text><Text style={styles.emptyText}>Use a code or automatic deal to attract a new order.</Text><Pressable onPress={openCreate} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Create offer</Text></Pressable></View> : null}
        </View> : null}
      </ScrollView>
      <OfferFormModal
        editing={editingOffer}
        form={form}
        onChange={setForm}
        onClose={() => setFormVisible(false)}
        onSubmit={submit}
        saving={save.isPending}
        visible={formVisible}
      />
    </View>
  );
}

function OfferFormModal({ editing, form, onChange, onClose, onSubmit, saving, visible }: {
  editing: OwnerOffer | null;
  form: OfferForm;
  onChange: (form: OfferForm) => void;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  visible: boolean;
}) {
  const set = <K extends keyof OfferForm>(key: K, value: OfferForm[K]) => onChange({ ...form, [key]: value });
  return <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalPage}>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <View style={styles.modalHeader}><View><Text style={styles.eyebrow}>{editing ? 'EDIT CAMPAIGN' : 'NEW CAMPAIGN'}</Text><Text style={styles.modalTitle}>{editing ? 'Update offer' : 'Create an offer'}</Text></View><Pressable disabled={saving} onPress={onClose}><Text style={styles.closeText}>Close</Text></Pressable></View>
        <Text style={styles.fieldLabel}>Offer title</Text><TextInput editable={!saving} maxLength={80} onChangeText={(value) => set('title', value)} placeholder="e.g. Lunch favourite" placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.title} />
        <Text style={styles.fieldLabel}>Discount type</Text><View style={styles.choiceRow}>{(['PERCENTAGE', 'FIXED_AMOUNT'] as const).map((type) => <Pressable key={type} onPress={() => set('discountType', type)} style={[styles.choice, form.discountType === type && styles.choiceActive]}><Text style={[styles.choiceText, form.discountType === type && styles.choiceTextActive]}>{type === 'PERCENTAGE' ? 'Percentage' : 'Fixed AED'}</Text></Pressable>)}</View>
        <Text style={styles.fieldLabel}>{form.discountType === 'PERCENTAGE' ? 'Percentage off' : 'Fixed amount off (AED)'}</Text><TextInput editable={!saving} keyboardType="decimal-pad" onChangeText={(value) => set('discountValue', value)} placeholder={form.discountType === 'PERCENTAGE' ? 'e.g. 15' : 'e.g. 10'} placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.discountValue} />
        <Text style={styles.fieldLabel}>Minimum order (AED)</Text><TextInput editable={!saving} keyboardType="decimal-pad" onChangeText={(value) => set('minimumOrderAmount', value)} placeholder="0" placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.minimumOrderAmount} />
        <View style={styles.switchRow}><View><Text style={styles.fieldLabel}>Apply automatically</Text><Text style={styles.switchHint}>Best eligible deal is added at checkout.</Text></View><Switch disabled={saving} onValueChange={(value) => { set('autoApply', value); if (value) set('code', ''); }} thumbColor="#FFFFFF" trackColor={{ false: '#D8CDD2', true: brand.colors.light.mint }} value={form.autoApply} /></View>
        {!form.autoApply ? <><Text style={styles.fieldLabel}>Promo code</Text><TextInput autoCapitalize="characters" editable={!saving} maxLength={32} onChangeText={(value) => set('code', value)} placeholder="e.g. WELCOME15" placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.code} /></> : null}
        <View style={styles.splitRow}><View style={styles.splitField}><Text style={styles.fieldLabel}>Usage limit (optional)</Text><TextInput editable={!saving} keyboardType="number-pad" onChangeText={(value) => set('usageLimit', value)} placeholder="Unlimited" placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.usageLimit} /></View><View style={styles.splitField}><Text style={styles.fieldLabel}>Per customer</Text><TextInput editable={!saving} keyboardType="number-pad" onChangeText={(value) => set('perCustomerLimit', value)} placeholder="1" placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.perCustomerLimit} /></View></View>
        <Text style={styles.fieldLabel}>Starts at (ISO date/time)</Text><TextInput autoCapitalize="none" editable={!saving} onChangeText={(value) => set('startsAt', value)} placeholder="2026-09-05T12:00:00Z" placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.startsAt} />
        <Text style={styles.fieldLabel}>Ends at (ISO date/time)</Text><TextInput autoCapitalize="none" editable={!saving} onChangeText={(value) => set('endsAt', value)} placeholder="2026-09-12T12:00:00Z" placeholderTextColor={brand.colors.light.inkMuted} style={styles.input} value={form.endsAt} />
        <Pressable disabled={saving} onPress={onSubmit} style={[styles.saveButton, saving && styles.disabled]}>{saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{editing ? 'Save changes' : 'Create offer'}</Text>}</Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  content: { padding: 16, paddingBottom: 28 + BottomTabInset },
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 22 },
  eyebrow: { color: brand.colors.light.primaryText, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: brand.colors.light.ink, fontSize: 27, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  subtitle: { color: brand.colors.light.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 3, maxWidth: 250 },
  addButton: { alignItems: 'center', backgroundColor: brand.colors.light.primary, borderRadius: brand.radius.small, flexDirection: 'row', gap: 4, marginTop: 2, paddingHorizontal: 11, paddingVertical: 9 },
  addText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  loading: { minHeight: 300, justifyContent: 'center' },
  list: { gap: 10 },
  card: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.medium, borderWidth: 1, padding: 14 },
  cardTop: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  offerIcon: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  offerCopy: { flex: 1 },
  offerTitle: { color: brand.colors.light.ink, fontSize: 15, fontWeight: '900' },
  offerCode: { color: brand.colors.light.inkMuted, fontSize: 11, marginTop: 2 },
  valueRow: { alignItems: 'flex-end', borderTopColor: brand.colors.light.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', marginTop: 11, paddingTop: 10 },
  value: { color: brand.colors.light.mint, fontSize: 19, fontWeight: '900' },
  usage: { color: brand.colors.light.inkMuted, fontSize: 11, fontWeight: '700' },
  details: { color: brand.colors.light.inkMuted, fontSize: 11, lineHeight: 16, marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  secondaryAction: { alignItems: 'center', backgroundColor: brand.colors.light.surfaceMuted, borderRadius: brand.radius.small, flexDirection: 'row', gap: 4, minHeight: 33, paddingHorizontal: 10, justifyContent: 'center' },
  secondaryActionText: { color: brand.colors.light.ink, fontSize: 11, fontWeight: '900' },
  activateAction: { alignItems: 'center', backgroundColor: '#E7F6F0', borderRadius: brand.radius.small, justifyContent: 'center', minHeight: 33, paddingHorizontal: 10 },
  activateActionText: { color: brand.colors.light.mint, fontSize: 11, fontWeight: '900' },
  archiveAction: { alignItems: 'center', backgroundColor: '#FDECEE', borderRadius: brand.radius.small, justifyContent: 'center', minHeight: 33, paddingHorizontal: 10 },
  archiveActionText: { color: brand.colors.light.danger, fontSize: 11, fontWeight: '900' },
  empty: { alignItems: 'center', backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.large, borderWidth: 1, padding: 28 },
  emptyIcon: { alignItems: 'center', backgroundColor: brand.colors.light.primarySoft, borderRadius: 26, height: 52, justifyContent: 'center', width: 52 },
  emptyTitle: { color: brand.colors.light.ink, fontSize: 18, fontWeight: '900', marginTop: 13 },
  emptyText: { color: brand.colors.light.inkMuted, fontSize: 13, lineHeight: 18, marginTop: 5, textAlign: 'center' },
  emptyButton: { backgroundColor: brand.colors.light.primary, borderRadius: brand.radius.small, marginTop: 16, paddingHorizontal: 15, paddingVertical: 11 },
  emptyButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  modalPage: { backgroundColor: brand.colors.light.canvas, flex: 1 },
  modalContent: { padding: 20, paddingBottom: 44 },
  modalHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  modalTitle: { color: brand.colors.light.ink, fontSize: 25, fontWeight: '900', letterSpacing: -0.5, marginTop: 3 },
  closeText: { color: brand.colors.light.primary, fontSize: 14, fontWeight: '900', marginTop: 8 },
  fieldLabel: { color: brand.colors.light.ink, fontSize: 13, fontWeight: '900', marginBottom: 7, marginTop: 15 },
  input: { backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.small, borderWidth: 1, color: brand.colors.light.ink, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11 },
  choiceRow: { flexDirection: 'row', gap: 8 },
  choice: { alignItems: 'center', backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.small, borderWidth: 1, flex: 1, minHeight: 43, justifyContent: 'center', paddingHorizontal: 8 },
  choiceActive: { backgroundColor: brand.colors.light.ink, borderColor: brand.colors.light.ink },
  choiceText: { color: brand.colors.light.inkMuted, fontSize: 12, fontWeight: '800' },
  choiceTextActive: { color: '#FFFFFF' },
  switchRow: { alignItems: 'center', backgroundColor: brand.colors.light.surface, borderColor: brand.colors.light.border, borderRadius: brand.radius.small, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, padding: 12 },
  switchHint: { color: brand.colors.light.inkMuted, fontSize: 10, marginTop: 3, maxWidth: 260 },
  splitRow: { flexDirection: 'row', gap: 10 },
  splitField: { flex: 1 },
  saveButton: { alignItems: 'center', backgroundColor: brand.colors.light.primary, borderRadius: brand.radius.medium, justifyContent: 'center', marginTop: 25, minHeight: 52 },
  saveText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.6 },
});
