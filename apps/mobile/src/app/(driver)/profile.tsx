import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import Animated, {
  FadeInDown,
  useReducedMotion,
} from "react-native-reanimated";

import { CustomerReviewsList } from "@/components/customer-reviews-list";
import { RequestErrorState } from "@/components/request-error-state";
import { WasilLogo } from "@/components/wasil-brand";
import { AppIcon, type AppIconName } from "@/components/wasil-icon-system";
import { brand } from "@/constants/brand";
import { BottomTabInset } from "@/constants/theme";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/axios";
import type { RestaurantReview } from "@food-delivery/types";

type AccountRowProps = {
  icon: AppIconName;
  label: string;
  value: string;
};

function AccountRow({ icon, label, value }: AccountRowProps) {
  return (
    <View style={styles.accountRow}>
      <View style={styles.accountIcon}>
        <AppIcon color={brand.colors.light.primary} name={icon} size="sm" />
      </View>
      <View style={styles.accountCopy}>
        <Text style={styles.accountLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.accountValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.slice(0, 1)}${lastName.slice(0, 1)}`.toUpperCase() || "W";
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const reduceMotion = useReducedMotion();
  const enter = (delay: number, duration = 340) =>
    reduceMotion ? undefined : FadeInDown.duration(duration).delay(delay);

  const { data: driverRating } = useQuery({
    queryKey: ["driver-rating", user?.id],
    queryFn: () =>
      api
        .get<{ averageRating: number; totalReviews: number }>(
          `/reviews/driver/${user!.id}`,
        )
        .then((res) => res.data),
    enabled: Boolean(user?.id),
  });

  const {
    data: driverReviews = [],
    error: driverReviewsError,
    isError: hasDriverReviewsError,
    refetch: refetchDriverReviews,
  } = useQuery<RestaurantReview[]>({
    queryKey: ["driver-reviews", user?.id],
    queryFn: () =>
      api.get(`/reviews/driver/${user!.id}/list`).then((res) => res.data),
    enabled: Boolean(user?.id),
  });

  if (!user) return null;

  const name = `${user.firstName} ${user.lastName}`.trim() || "Wasil driver";
  const initials = getInitials(user.firstName, user.lastName);

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={enter(30, 280)} style={styles.topBar}>
          <WasilLogo size={36} />
          <View style={styles.profileBadge}>
            <AppIcon
              color={brand.colors.light.mint}
              name="deliveryRider"
              size="xs"
            />
            <Text style={styles.profileBadgeText}>DRIVER</Text>
          </View>
        </Animated.View>

        <Animated.View entering={enter(80, 320)}>
          <View style={styles.identityCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.email}>{user.email}</Text>
            <View style={styles.rolePill}>
              <View style={styles.roleDot} />
              <Text style={styles.roleText}>Wasil delivery partner</Text>
            </View>
            {driverRating && driverRating.totalReviews > 0 ? (
              <View style={styles.ratingPill}>
                <AppIcon
                  color={brand.colors.light.accent}
                  name="rating"
                  size="xs"
                />
                <Text style={styles.ratingText}>
                  {driverRating.averageRating.toFixed(1)} ·{" "}
                  {driverRating.totalReviews} review
                  {driverRating.totalReviews === 1 ? "" : "s"}
                </Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        <Animated.View entering={enter(150, 350)}>
          <Text style={styles.sectionLabel}>YOUR REVIEWS</Text>
          {hasDriverReviewsError ? (
            <RequestErrorState
              error={driverReviewsError}
              onRetry={() => void refetchDriverReviews()}
              title="Couldn’t load delivery feedback"
            />
          ) : (
            <CustomerReviewsList
              highlight="driver"
              reviews={driverReviews}
              title="Delivery feedback"
            />
          )}
        </Animated.View>

        <Animated.View entering={enter(200, 380)}>
          <Text style={styles.sectionLabel}>ACCOUNT</Text>
          <View style={styles.accountCard}>
            <AccountRow icon="email" label="Email address" value={user.email} />
            <View style={styles.rule} />
            <AccountRow
              icon="personalInformation"
              label="Account type"
              value="Delivery partner"
            />
            <View style={styles.rule} />
            <AccountRow
              icon="lock"
              label="Session"
              value="Signed in securely"
            />
          </View>
        </Animated.View>

        <Animated.View entering={enter(220, 410)}>
          <View style={styles.noticeCard}>
            <View style={styles.noticeIcon}>
              <AppIcon
                color={brand.colors.light.mint}
                name="information"
                size="md"
              />
            </View>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Built for the road</Text>
              <Text style={styles.noticeText}>
                Your delivery tasks, routes, and records stay in one calm
                workspace.
              </Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={enter(280, 430)}>
          <Pressable
            accessibilityLabel="Log out of Wasil"
            accessibilityRole="button"
            onPress={() => void logout()}
            style={({ pressed }) => [
              styles.logoutButton,
              pressed && styles.logoutPressed,
            ]}
          >
            <AppIcon
              color={brand.colors.light.danger}
              name="logout"
              size="sm"
            />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>
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
    paddingBottom: 28 + BottomTabInset,
  },
  topBar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 28,
  },
  profileBadge: {
    alignItems: "center",
    backgroundColor: `${brand.colors.light.mint}14`,
    borderColor: `${brand.colors.light.mint}2B`,
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  profileBadgeText: {
    color: brand.colors.light.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  identityCard: {
    alignItems: "center",
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    paddingHorizontal: 22,
    paddingVertical: 28,
    ...brand.shadow,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primary,
    borderColor: "rgba(255,248,244,0.3)",
    borderRadius: 38,
    borderWidth: 4,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  avatarText: {
    color: "#FFF8F4",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  name: {
    color: "#FFF8F4",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.45,
    marginTop: 13,
    textAlign: "center",
  },
  email: {
    color: "rgba(255,248,244,0.7)",
    fontSize: 13,
    marginTop: 4,
    textAlign: "center",
  },
  rolePill: {
    alignItems: "center",
    backgroundColor: "rgba(255,248,244,0.1)",
    borderColor: "rgba(255,248,244,0.12)",
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 17,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  roleDot: {
    backgroundColor: brand.colors.light.accent,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  roleText: {
    color: "#FFF8F4",
    fontSize: 11,
    fontWeight: "800",
  },
  ratingPill: {
    alignItems: "center",
    backgroundColor: "rgba(255,248,244,0.12)",
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ratingText: {
    color: "#FFF8F4",
    fontSize: 12,
    fontWeight: "800",
  },
  sectionLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 9,
    marginTop: 26,
  },
  accountCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    overflow: "hidden",
  },
  accountRow: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 73,
    paddingHorizontal: 15,
  },
  accountIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  accountCopy: {
    flex: 1,
    marginLeft: 11,
  },
  accountLabel: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  accountValue: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  rule: {
    backgroundColor: brand.colors.light.border,
    height: StyleSheet.hairlineWidth,
    marginLeft: 68,
  },
  noticeCard: {
    alignItems: "flex-start",
    backgroundColor: `${brand.colors.light.mint}10`,
    borderColor: `${brand.colors.light.mint}26`,
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    marginTop: 16,
    padding: 15,
  },
  noticeIcon: {
    alignItems: "center",
    backgroundColor: `${brand.colors.light.mint}18`,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  noticeText: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  logoutButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: `${brand.colors.light.danger}40`,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  logoutPressed: {
    opacity: 0.74,
    transform: [{ scale: 0.98 }],
  },
  logoutText: {
    color: brand.colors.light.danger,
    fontSize: 14,
    fontWeight: "900",
  },
});
