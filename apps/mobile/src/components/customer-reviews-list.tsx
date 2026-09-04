import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/wasil-icon-system';
import { brand } from '@/constants/brand';
import type { RestaurantReview } from '@food-delivery/types';

type CustomerReviewsListProps = {
  reviews: RestaurantReview[];
  /** Which rating to highlight in each row */
  highlight?: 'restaurant' | 'driver';
  limit?: number;
  title?: string;
};

function formatCustomerName(firstName: string, lastName: string) {
  const initial = lastName?.charAt(0) ?? '';
  return `${firstName} ${initial ? `${initial}.` : ''}`.trim();
}

export function CustomerReviewsList({
  reviews,
  highlight = 'restaurant',
  limit,
  title = 'Customer reviews',
}: CustomerReviewsListProps) {
  const visibleReviews = limit ? reviews.slice(0, limit) : reviews;

  if (visibleReviews.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <AppIcon color={brand.colors.light.inkMuted} name="reviews" size="md" />
        <Text style={styles.emptyTitle}>No reviews yet</Text>
        <Text style={styles.emptyText}>
          Reviews from customers will appear here after deliveries.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <AppIcon color={brand.colors.light.primary} name="reviews" size="sm" />
        <Text style={styles.title}>{title}</Text>
      </View>
      {visibleReviews.map((review, index) => (
        <View
          key={review.id}
          style={[
            styles.reviewItem,
            index < visibleReviews.length - 1 && styles.reviewItemBorder,
          ]}>
          <View style={styles.reviewTop}>
            <Text style={styles.reviewName}>
              {formatCustomerName(
                review.customerFirstName,
                review.customerLastName,
              )}
            </Text>
            <View style={styles.reviewRatings}>
              {highlight === 'restaurant' ? (
                <>
                  <View style={styles.reviewRating}>
                    <AppIcon
                      color={brand.colors.light.primary}
                      name="restaurant"
                      size="xs"
                    />
                    <Text style={styles.reviewRatingText}>
                      {review.restaurantRating}
                    </Text>
                  </View>
                  {review.driverRating ? (
                    <View style={styles.reviewRating}>
                      <AppIcon
                        color={brand.colors.light.mint}
                        name="deliveryRider"
                        size="xs"
                      />
                      <Text style={styles.reviewRatingText}>
                        {review.driverRating}
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  {review.driverRating ? (
                    <View style={styles.reviewRating}>
                      <AppIcon
                        color={brand.colors.light.mint}
                        name="deliveryRider"
                        size="xs"
                      />
                      <Text style={styles.reviewRatingText}>
                        {review.driverRating}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.reviewRating}>
                    <AppIcon
                      color={brand.colors.light.inkMuted}
                      name="restaurant"
                      size="xs"
                    />
                    <Text style={styles.reviewRatingMuted}>
                      {review.restaurantRating}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </View>
          {review.comment ? (
            <Text style={styles.reviewComment}>{review.comment}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.lg,
    borderWidth: 1,
    gap: 0,
    padding: 16,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.lg,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  emptyText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  emptyTitle: {
    color: brand.colors.light.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  reviewComment: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  reviewItem: {
    paddingVertical: 12,
  },
  reviewItemBorder: {
    borderBottomColor: brand.colors.light.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reviewName: {
    color: brand.colors.light.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  reviewRating: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  reviewRatingMuted: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  reviewRatingText: {
    color: brand.colors.light.ink,
    fontSize: 12,
    fontWeight: '800',
  },
  reviewRatings: {
    flexDirection: 'row',
    gap: 10,
  },
  reviewTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 16,
    fontWeight: '800',
  },
});
