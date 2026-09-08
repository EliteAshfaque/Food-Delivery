import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import type { UserAddress } from "@food-delivery/types";

import { EditProfileModal } from "@/components/edit-profile-modal";
import { ProfileAvatar } from "@/components/profile-avatar";
import { WasilLogo, WasilMark } from "@/components/wasil-brand";
import { AppIcon, type AppIconName } from "@/components/wasil-icon-system";
import { brand } from "@/constants/brand";
import { BottomTabInset } from "@/constants/theme";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/axios";

type AccountRowProps = {
  detail: string;
  icon: AppIconName;
  label: string;
  onPress?: () => void;
};

function AccountRow({ detail, icon, label, onPress }: AccountRowProps) {
  const content = (
    <>
      <View style={styles.rowIcon}>
        <AppIcon color={brand.colors.light.primary} name={icon} size="sm" />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <AppIcon
        color={brand.colors.light.inkMuted}
        name={onPress ? "more" : "check"}
        size="sm"
      />
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityHint={`Opens ${label}`}
        accessibilityLabel={`${label}. ${detail}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.accountRow,
          pressed && styles.accountRowPressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${detail}`}
      style={styles.accountRow}
    >
      {content}
    </View>
  );
}

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const addresses = useQuery({
    queryKey: ["addresses"],
    queryFn: () =>
      api.get<UserAddress[]>("/addresses").then((res) => res.data),
    enabled: Boolean(user),
  });

  if (!user) {
    return null;
  }

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Wasil customer";
  const defaultAddress =
    addresses.data?.find((item) => item.isDefault) ?? addresses.data?.[0];
  const addressDetail = defaultAddress
    ? `${defaultAddress.label} · ${defaultAddress.addressLine}`
    : addresses.isLoading
      ? "Loading your addresses…"
      : "Add or manage delivery addresses";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <WasilLogo size={36} />

        <View style={styles.pageIntro}>
          <Text style={styles.eyebrow}>YOUR WASIL</Text>
          <Text style={styles.title}>Account & preferences</Text>
          <Text style={styles.subtitle}>
            Everything you need for an easy, reliable delivery experience.
          </Text>
        </View>

        <View style={styles.identityCard}>
          <View style={styles.identityGlow} />
          <View style={styles.identityTopRow}>
            <ProfileAvatar
              firstName={user.firstName}
              imageUrl={user.imageUrl}
              lastName={user.lastName}
              size={72}
              style={styles.avatar}
            />
            <View style={styles.memberPill}>
              <AppIcon
                color={brand.colors.light.accent}
                name="check"
                size="xs"
              />
              <Text style={styles.memberPillText}>Wasil member</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={styles.name}>
            {fullName}
          </Text>
          <View style={styles.emailRow}>
            <AppIcon color="rgba(255, 248, 244, 0.7)" name="email" size="xs" />
            <Text numberOfLines={1} style={styles.email}>
              {user.email}
            </Text>
          </View>
          <View style={styles.identityFooter}>
            <AppIcon
              color={brand.colors.light.mint}
              name="verifiedRestaurant"
              size="sm"
            />
            <Text style={styles.identityFooterText}>
              {formatRole(user.role)} account · secure sign-in
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Edit profile"
            accessibilityRole="button"
            onPress={() => setEditOpen(true)}
            style={({ pressed }) => [
              styles.editProfileButton,
              pressed && styles.editProfilePressed,
            ]}
          >
            <AppIcon
              color={brand.colors.light.ink}
              name="personalInformation"
              size="xs"
            />
            <Text style={styles.editProfileText}>Edit profile</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your essentials</Text>
          <Text style={styles.sectionCaption}>Kept simple</Text>
        </View>
        <View style={styles.accountCard}>
          <AccountRow
            detail={`${fullName} · tap to edit`}
            icon="personalInformation"
            label="Personal information"
            onPress={() => setEditOpen(true)}
          />
          <View style={styles.divider} />
          <AccountRow
            detail="Order and delivery updates"
            icon="notifications"
            label="Notifications"
            onPress={() => router.push("/(customer)/notifications")}
          />
          <View style={styles.divider} />
          <AccountRow
            detail={addressDetail}
            icon="addresses"
            label="Delivery addresses"
            onPress={() =>
              router.push("/(customer)/(index)/addresses")
            }
          />
          <View style={styles.divider} />
          <AccountRow
            detail="Your go-to restaurants"
            icon="favorites"
            label="Favorite places"
            onPress={() => router.push("/(customer)/favorites" as never)}
          />
          <View style={styles.divider} />
          <AccountRow
            detail="Handled securely when you place an order"
            icon="paymentMethods"
            label="Payment & receipts"
            onPress={() =>
              Alert.alert(
                "Payments & receipts",
                "Card payments are confirmed securely at checkout. Open Orders to review past receipts.",
                [
                  { text: "Not now", style: "cancel" },
                  {
                    text: "View orders",
                    onPress: () => router.push("/(customer)/orders"),
                  },
                ],
              )
            }
          />
        </View>

        <View style={styles.protectionCard}>
          <View style={styles.protectionIcon}>
            <AppIcon color={brand.colors.light.mint} name="privacy" size="md" />
          </View>
          <View style={styles.protectionCopy}>
            <Text style={styles.protectionTitle}>Your orders, protected</Text>
            <Text style={styles.protectionText}>
              Wasil keeps your account and payment flow secure at every step.
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              "Help & support",
              "For order help, open the order details screen and contact support from there. You can also email support@wasil.app.",
            )
          }
          style={styles.supportRow}
        >
          <AppIcon
            color={brand.colors.light.inkMuted}
            name="helpSupport"
            size="sm"
          />
          <Text style={styles.supportText}>Need help with an order?</Text>
          <Text style={styles.supportStatus}>Support is here</Text>
        </Pressable>

        <Pressable
          accessibilityHint="Signs out of your Wasil account"
          accessibilityLabel="Log out"
          accessibilityRole="button"
          onPress={() => void logout()}
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && styles.logoutButtonPressed,
          ]}
        >
          <AppIcon color={brand.colors.light.danger} name="logout" size="sm" />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>

        <View style={styles.brandFooter}>
          <WasilMark decorative size={28} />
          <Text style={styles.brandFooterText}>
            Wasil · Your city, delivered.
          </Text>
        </View>
      </ScrollView>

      <EditProfileModal
        onClose={() => setEditOpen(false)}
        visible={editOpen}
      />
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
    paddingTop: 6,
  },
  pageIntro: {
    marginTop: 26,
  },
  eyebrow: {
    color: brand.colors.light.primary,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  title: {
    color: brand.colors.light.ink,
    fontSize: 29,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 6,
  },
  subtitle: {
    color: brand.colors.light.inkMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    maxWidth: 330,
  },
  identityCard: {
    backgroundColor: brand.colors.light.ink,
    borderRadius: brand.radius.large,
    marginTop: 24,
    overflow: "hidden",
    padding: 20,
  },
  identityGlow: {
    backgroundColor: "rgba(242, 85, 44, 0.2)",
    borderRadius: 120,
    height: 190,
    position: "absolute",
    right: -74,
    top: -94,
    width: 190,
  },
  identityTopRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  avatar: {
    borderColor: "rgba(255, 248, 244, 0.35)",
    borderWidth: 3,
  },
  memberPill: {
    alignItems: "center",
    backgroundColor: "rgba(255, 248, 244, 0.1)",
    borderColor: "rgba(255, 248, 244, 0.15)",
    borderRadius: brand.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  memberPillText: {
    color: "#FFF8F4",
    fontSize: 11,
    fontWeight: "800",
  },
  name: {
    color: "#FFF8F4",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 20,
  },
  emailRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 7,
  },
  email: {
    color: "rgba(255, 248, 244, 0.74)",
    flex: 1,
    fontSize: 13,
  },
  identityFooter: {
    alignItems: "center",
    borderTopColor: "rgba(255, 248, 244, 0.13)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginTop: 18,
    paddingTop: 14,
  },
  identityFooterText: {
    color: "rgba(255, 248, 244, 0.78)",
    fontSize: 12,
    fontWeight: "700",
  },
  editProfileButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: brand.colors.light.accent,
    borderRadius: brand.radius.pill,
    flexDirection: "row",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  editProfilePressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  editProfileText: {
    color: brand.colors.light.ink,
    fontSize: 13,
    fontWeight: "900",
  },
  sectionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 28,
  },
  sectionTitle: {
    color: brand.colors.light.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  sectionCaption: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  accountCard: {
    backgroundColor: brand.colors.light.surface,
    borderColor: brand.colors.light.border,
    borderRadius: brand.radius.large,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
    ...brand.shadow,
  },
  accountRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 75,
    paddingHorizontal: 15,
  },
  accountRowPressed: {
    opacity: 0.72,
  },
  rowIcon: {
    alignItems: "center",
    backgroundColor: brand.colors.light.primarySoft,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  rowCopy: {
    flex: 1,
  },
  rowLabel: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  rowDetail: {
    color: brand.colors.light.inkMuted,
    fontSize: 12,
    marginTop: 3,
  },
  divider: {
    backgroundColor: brand.colors.light.border,
    height: 1,
    marginLeft: 69,
  },
  protectionCard: {
    alignItems: "center",
    backgroundColor: "#EAF8F3",
    borderColor: "#C7EBDD",
    borderRadius: brand.radius.large,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    padding: 15,
  },
  protectionIcon: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  protectionCopy: {
    flex: 1,
  },
  protectionTitle: {
    color: brand.colors.light.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  protectionText: {
    color: "#387564",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  supportRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 20,
    paddingHorizontal: 2,
  },
  supportText: {
    color: brand.colors.light.inkMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  supportStatus: {
    color: brand.colors.light.mint,
    fontSize: 12,
    fontWeight: "900",
  },
  logoutButton: {
    alignItems: "center",
    backgroundColor: brand.colors.light.surface,
    borderColor: "#F2D2D7",
    borderRadius: brand.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 22,
    minHeight: 54,
  },
  logoutButtonPressed: {
    backgroundColor: "#FFF1F3",
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  logoutText: {
    color: brand.colors.light.danger,
    fontSize: 14,
    fontWeight: "900",
  },
  brandFooter: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 22,
  },
  brandFooterText: {
    color: brand.colors.light.inkMuted,
    fontSize: 11,
    fontWeight: "700",
  },
});
