import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, {
  FadeInDown,
  useReducedMotion,
} from 'react-native-reanimated';

import { WasilLogo, WasilMark } from '@/components/wasil-brand';
import { CustomerReviewsList } from '@/components/customer-reviews-list';
import { AppIcon, type AppIconName } from '@/components/wasil-icon-system';
import { brand } from '@/constants/brand';
import { BottomTabInset } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/axios';
import type { Restaurant, RestaurantReview } from '@food-delivery/types';

type ActionRowProps = {
  detail: string;
  icon: AppIconName;
  label: string;
  onPress?: () => void;
};

function ActionRow({ detail, icon, label, onPress }: ActionRowProps) {
  const content = (
    <>
      <View style={styles.rowIcon}>
        <AppIcon color={brand.colors.light.primary} name={icon} size="sm" />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {onPress ? (
        <AppIcon
          color={brand.colors.light.inkMuted}
          name="navigation"
          size="sm"
        />
      ) : (
        <AppIcon color={brand.colors.light.mint} name="orderConfirmed" size="sm" />
      )}
    </>
  );

  if (!onPress) {
    return <View style={styles.accountRow}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.accountRow,
        pressed && styles.rowPressed,
      ]}>
      {content}
    </Pressable>
  );
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || 'W';
}

export default function OwnerProfileScreen() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const enter = (delay: number, duration = 340) =>
    reduceMotion ? undefined : FadeInDown.duration(duration).delay(delay);

  const { data: restaurant, isLoading: restaurantLoading } = useQuery<
    Restaurant | null
  >({
    queryKey: ['my-restaurants'],
    queryFn: () => api.get('/restaurants/mine').then((res) => res.data),
  });

  const { data: restaurantReviews = [] } = useQuery<RestaurantReview[]>({
    queryKey: ['restaurant-reviews', restaurant?.id],
    queryFn: () =>
      api
        .get(`/reviews/restaurant/${restaurant!.id}`)
        .then((res) => res.data),
    enabled: Boolean(restaurant?.id),
  });

  const { mutate: toggleOpen, isPending: togglingOpen } = useMutation({
    mutationFn: () =>
      api
        .patch(`/restaurants/${restaurant!.id}`, {
          isOpen: !restaurant!.isOpen,
        })
        .then((res) => res.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-restaurants'] });
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });

  if (!user) return null;

  const fullName =
    `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Restaurant owner';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={enter(20, 280)} style={styles.topBar}>
          <WasilLogo size={36} />
          <View style={styles.ownerBadge}>
            <AppIcon
              color={brand.colors.light.primary}
              name="restaurant"
              size="xs"
            />
            <Text style={styles.ownerBadgeText}>OWNER</Text>
          </View>
        </Animated.View>

        <Animated.View entering={enter(60, 300)}>
          <Text style={styles.overline}>YOUR WORKSPACE</Text>
          <Text style={styles.title}>Restaurant profile</Text>
          <Text style={styles.subtitle}>
            Manage your restaurant identity, hours, and account.
          </Text>
        </Animated.View>

        <Animated.View entering={enter(100, 330)}>
          <View style={styles.identityCard}>
            <View style={styles.identityGlow} />
            <View style={styles.identityTopRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {getInitials(user.firstName, user.lastName)}
                </Text>
              </View>
              <View style={styles.memberPill}>
                <AppIcon
                  color={brand.colors.light.accent}
                  name="verifiedRestaurant"
                  size="xs"
                />
                <Text style={styles.memberPillText}>Verified owner</Text>
              </View>
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {fullName}
            </Text>
            <View style={styles.emailRow}>
              <AppIcon color="rgba(255,248,244,0.7)" name="email" size="xs" />
              <Text style={styles.email} numberOfLines={1}>
                {user.email}
              </Text>
            </View>
            <View style={styles.identityFooter}>
              <AppIcon
                color={brand.colors.light.mint}
                name="restaurant"
                size="sm"
              />
              <Text style={styles.identityFooterText}>
                {restaurant?.name
                  ? `Operating ${restaurant.name}`
                  : 'Set up your restaurant to get started'}
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={enter(150, 360)}>
          <Text style={styles.sectionTitle}>Restaurant</Text>

          {restaurantLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={brand.colors.light.primary} />
            </View>
          ) : restaurant ? (
            <View style={styles.restaurantCard}>
              <View style={styles.restaurantHeader}>
                <View style={styles.restaurantIcon}>
                  <AppIcon
                    color={brand.colors.light.primary}
                    name="restaurant"
                    size="md"
                  />
                </View>
                <View style={styles.restaurantCopy}>
                  <Text style={styles.restaurantName} numberOfLines={1}>
                    {restaurant.name}
                  </Text>
                  <Text style={styles.restaurantMeta} numberOfLines={1}>
                    {restaurant.cuisineType} · {restaurant.address}
                  </Text>
                </View>
              </View>

              <View style={styles.openRow}>
                <View>
                  <Text style={styles.openLabel}>Accepting orders</Text>
                  <Text style={styles.openHint}>
                    {restaurant.isOpen
                      ? 'Customers can order now'
                      : 'Restaurant is closed'}
                  </Text>
                </View>
                <Switch
                  value={restaurant.isOpen}
                  onValueChange={() => toggleOpen()}
                  disabled={togglingOpen}
                  trackColor={{
                    false: '#E5E7EB',
                    true: `${brand.colors.light.mint}88`,
                  }}
                  thumbColor={
                    restaurant.isOpen ? brand.colors.light.mint : '#f4f3f4'
                  }
                />
              </View>

              <Pressable
                onPress={() =>
                  router.push('/(owner)/(index)/update-restaurant')
                }
                style={({ pressed }) => [
                  styles.editButton,
                  pressed && styles.pressed,
                ]}>
                <AppIcon
                  color={brand.colors.light.primary}
                  name="personalInformation"
                  size="sm"
                />
                <Text style={styles.editButtonText}>Edit restaurant</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.emptyRestaurant}>
              <Text style={styles.emptyTitle}>No restaurant yet</Text>
              <Text style={styles.emptyText}>
                Create your restaurant to start receiving orders.
              </Text>
              <Pressable
                onPress={() =>
                  router.push('/(owner)/(index)/create-restaurant')
                }
                style={styles.createButton}>
                <Text style={styles.createButtonText}>Create restaurant</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>

        {restaurant ? (
          <Animated.View entering={enter(175, 370)}>
            <View style={styles.reviewsSectionHeader}>
              <Text style={[styles.sectionTitle, styles.reviewsSectionTitle]}>
                Customer reviews
              </Text>
              {restaurant.rating ? (
                <View style={styles.ratingBadge}>
                  <AppIcon
                    color={brand.colors.light.accent}
                    name="rating"
                    size="xs"
                  />
                  <Text style={styles.ratingBadgeText}>
                    {Number(restaurant.rating).toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>
            <CustomerReviewsList
              highlight="restaurant"
              reviews={restaurantReviews}
            />
          </Animated.View>
        ) : null}

        <Animated.View entering={enter(200, 380)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick links</Text>
            <Text style={styles.sectionCaption}>Owner tools</Text>
          </View>
          <View style={styles.accountCard}>
            <ActionRow
              icon="orderReady"
              label="Live orders"
              detail="Update preparing & ready status"
              onPress={() => router.replace('/(owner)/(index)')}
            />
            <View style={styles.divider} />
            <ActionRow
              icon="menu"
              label="Menu management"
              detail="Categories, items & availability"
              onPress={() => router.push('/(owner)/menu')}
            />
            <View style={styles.divider} />
            <ActionRow
              icon="orderDetails"
              label="Analytics"
              detail="Revenue and kitchen performance"
              onPress={() => router.push('/(owner)/analytics')}
            />
          </View>
        </Animated.View>

        <Animated.View entering={enter(240, 400)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Account</Text>
            <Text style={styles.sectionCaption}>Secure</Text>
          </View>
          <View style={styles.accountCard}>
            <ActionRow
              icon="email"
              label="Email"
              detail={user.email}
            />
            <View style={styles.divider} />
            <ActionRow
              icon="personalInformation"
              label="Account type"
              detail="Restaurant owner"
            />
            <View style={styles.divider} />
            <ActionRow
              icon="privacy"
              label="Session"
              detail="Signed in securely"
            />
          </View>
        </Animated.View>

        <Animated.View entering={enter(280, 420)}>
          <View style={styles.noticeCard}>
            <View style={styles.noticeIcon}>
              <AppIcon
                color={brand.colors.light.mint}
                name="verifiedRestaurant"
                size="md"
              />
            </View>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Built for kitchens</Text>
              <Text style={styles.noticeText}>
                Keep your restaurant open, menu fresh, and orders moving — all
                from one Wasil workspace.
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={enter(320, 440)}>
          <Pressable
            accessibilityLabel="Log out"
            accessibilityRole="button"
            onPress={() => void logout()}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutPressed,
            ]}>
            <AppIcon
              color={brand.colors.light.danger}
              name="logout"
              size="sm"
            />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>

          <View style={styles.brandFooter}>
            <WasilMark decorative size={28} />
            <Text style={styles.brandFooterText}>
              Wasil · Your city, delivered.
            </Text>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: brand.colors.light.canvas,
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: BottomTabInset + 30,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  ownerBadge: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  ownerBadgeText: {
    color: brand.colors.light.primaryText,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  overline: {
    color: brand.colors.light.primaryText,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    marginBottom: 6,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    marginTop: 6,
    maxWidth: 340,
  },
  identityCard: {
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    marginBottom: 22,
    overflow: 'hidden',
    padding: 20,
    ...brand.shadow,
  },
  identityGlow: {
    backgroundColor: 'rgba(242, 85, 44, 0.22)',
    borderRadius: 120,
    height: 190,
    position: 'absolute',
    right: -74,
    top: -94,
    width: 190,
  },
  identityTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#FFF8F4',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  avatarText: {
    color: brand.colors.light.primary,
    fontSize: 16,
    fontWeight: '900',
  },
  memberPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 248, 244, 0.1)',
    borderColor: 'rgba(255, 248, 244, 0.15)',
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  memberPillText: {
    color: '#FFF8F4',
    fontSize: 11,
    fontWeight: '800',
  },
  name: {
    color: '#FFF8F4',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 18,
  },
  emailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 7,
  },
  email: {
    color: 'rgba(255, 248, 244, 0.74)',
    flex: 1,
    fontSize: 13,
  },
  identityFooter: {
    alignItems: 'center',
    borderTopColor: 'rgba(255, 248, 244, 0.13)',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 18,
    paddingTop: 14,
  },
  identityFooterText: {
    color: 'rgba(255, 248, 244, 0.78)',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 12,
  },
  reviewsSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  reviewsSectionTitle: {
    marginBottom: 0,
  },
  ratingBadge: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: brand.radius.pill,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  ratingBadgeText: {
    color: brand.colors.light.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionCaption: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingCard: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    marginBottom: 18,
    paddingVertical: 28,
  },
  restaurantCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16,
    ...brand.shadow,
  },
  restaurantHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  restaurantIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 16,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  restaurantCopy: {
    flex: 1,
  },
  restaurantName: {
    color: brand.colors.light.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  restaurantMeta: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    marginTop: 3,
  },
  openRow: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surfaceMuted,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  openLabel: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  openHint: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  editButton: {
    alignItems: 'center',
    borderColor: brand.colors.light.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  editButtonText: {
    color: brand.colors.light.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  emptyRestaurant: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    marginBottom: 18,
    padding: 22,
  },
  emptyTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 6,
  },
  emptyText: {
    color: brand.colors.light.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  createButton: {
    backgroundColor: brand.colors.light.primary,
    borderRadius: 14,
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '900',
  },
  accountCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
    ...brand.shadow,
  },
  accountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 74,
    paddingHorizontal: 15,
  },
  rowPressed: {
    backgroundColor: brand.colors.light.surfaceMuted,
  },
  rowIcon: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  rowCopy: {
    flex: 1,
  },
  rowLabel: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  rowDetail: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    marginTop: 3,
  },
  divider: {
    backgroundColor: brand.colors.light.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 69,
  },
  noticeCard: {
    alignItems: 'flex-start',
    backgroundColor: `${brand.colors.light.mint}10`,
    borderColor: `${brand.colors.light.mint}26`,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    marginTop: 8,
    padding: 15,
  },
  noticeIcon: {
    alignItems: 'center',
    backgroundColor: `${brand.colors.light.mint}18`,
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  noticeText: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  logoutButton: {
    alignItems: 'center',
    backgroundColor: brand.colors.light.surface,
    borderColor: `${brand.colors.light.danger}40`,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 52,
  },
  logoutPressed: {
    backgroundColor: '#FFF1F3',
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  logoutText: {
    color: brand.colors.light.danger,
    fontSize: 14,
    fontWeight: '900',
  },
  brandFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 22,
  },
  brandFooterText: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
});
