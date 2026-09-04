import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/wasil-icon-system';
import { brand } from '@/constants/brand';
import { api } from '@/lib/axios';
import type { Review } from '@food-delivery/types';

type OrderReviewCardProps = {
  orderId: string;
  restaurantId: string;
  restaurantName?: string;
  hasDriver: boolean;
  existingReview: Review | null;
};

function StarRow({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: 'restaurant' | 'deliveryRider';
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <View style={styles.rateBlock}>
      <View style={styles.rateHeader}>
        <View style={styles.rateIcon}>
          <AppIcon color={brand.colors.light.primary} name={icon} size="sm" />
        </View>
        <Text style={styles.rateLabel}>{label}</Text>
      </View>
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => onChange(star)} hitSlop={6}>
            <AppIcon
              color={
                star <= value
                  ? brand.colors.light.accent
                  : brand.colors.light.border
              }
              name="rating"
              size="lg"
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function OrderReviewCard({
  orderId,
  restaurantId,
  restaurantName,
  hasDriver,
  existingReview,
}: OrderReviewCardProps) {
  const queryClient = useQueryClient();
  const [restaurantRating, setRestaurantRating] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState('');

  const { mutate: submitReview, isPending } = useMutation({
    mutationFn: () =>
      api
        .post('/reviews', {
          orderId,
          restaurantRating,
          driverRating: hasDriver ? driverRating : undefined,
          comment: comment.trim() || undefined,
        })
        .then((res) => res.data as Review),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-review', orderId] });
      queryClient.invalidateQueries({
        queryKey: ['restaurant-reviews', restaurantId],
      });
      queryClient.invalidateQueries({ queryKey: ['restaurant', restaurantId] });
      queryClient.invalidateQueries({ queryKey: ['restaurants'] });
      Alert.alert('Thank you!', 'Your review helps restaurants and drivers improve.');
    },
    onError: (error: Error) => {
      Alert.alert('Review failed', error.message);
    },
  });

  function handleSubmit() {
    if (restaurantRating < 1) {
      Alert.alert('Restaurant rating required', 'Please rate the restaurant.');
      return;
    }
    if (hasDriver && driverRating < 1) {
      Alert.alert('Driver rating required', 'Please rate your delivery driver.');
      return;
    }
    submitReview();
  }

  if (existingReview) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <AppIcon color={brand.colors.light.mint} name="reviews" size="md" />
          <Text style={styles.title}>Thanks for your review!</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <AppIcon color={brand.colors.light.primary} name="restaurant" size="sm" />
            <Text style={styles.summaryText}>
              Restaurant {existingReview.restaurantRating}/5
            </Text>
          </View>
          {existingReview.driverRating ? (
            <View style={styles.summaryItem}>
              <AppIcon color={brand.colors.light.mint} name="deliveryRider" size="sm" />
              <Text style={styles.summaryText}>
                Driver {existingReview.driverRating}/5
              </Text>
            </View>
          ) : null}
        </View>
        {existingReview.comment ? (
          <Text style={styles.existingComment}>"{existingReview.comment}"</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppIcon color={brand.colors.light.primary} name="reviews" size="md" />
        <Text style={styles.title}>Rate your experience</Text>
      </View>
      <Text style={styles.subtitle}>
        Tell us how {restaurantName ?? 'the restaurant'}
        {hasDriver ? ' and your driver' : ''} did.
      </Text>

      <StarRow
        icon="restaurant"
        label={restaurantName ?? 'Restaurant'}
        onChange={setRestaurantRating}
        value={restaurantRating}
      />

      {hasDriver ? (
        <StarRow
          icon="deliveryRider"
          label="Delivery driver"
          onChange={setDriverRating}
          value={driverRating}
        />
      ) : null}

      <TextInput
        multiline
        onChangeText={setComment}
        placeholder="Add a comment about food or delivery (optional)"
        placeholderTextColor={brand.colors.light.inkMuted}
        style={styles.input}
        textAlignVertical="top"
        value={comment}
      />

      <Pressable
        disabled={isPending}
        onPress={handleSubmit}
        style={[styles.submitButton, isPending && styles.disabled]}
      >
        {isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>Submit review</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  rateBlock: {
    backgroundColor: brand.colors.light.surfaceMuted,
    borderRadius: brand.radius.medium,
    gap: 10,
    padding: 12,
  },
  rateHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  rateIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  rateLabel: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  stars: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    backgroundColor: brand.colors.light.surfaceMuted,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    color: brand.colors.light.ink,
    fontSize: 14,
    minHeight: 80,
    padding: 12,
  },
  submitButton: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primary,
    borderRadius: brand.radius.medium,
    justifyContent: 'center',
    minHeight: 48,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  summaryRow: {
    gap: 8,
  },
  summaryItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  summaryText: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  existingComment: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  disabled: {
    opacity: 0.7,
  },
});
