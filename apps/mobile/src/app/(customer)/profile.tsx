import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { WasilLogo, WasilMark } from "@/components/wasil-brand";
import { AppIcon, type AppIconName } from "@/components/wasil-icon-system";
import { brand } from "@/constants/brand";
import { BottomTabInset } from "@/constants/theme";
import { useAuth } from "@/context/auth-context";

type AccountRowProps = {
  detail: string;
  icon: AppIconName;
  label: string;
};

function AccountRow({ detail, icon, label }: AccountRowProps) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${detail}`}
      style={styles.accountRow}
    >
      <View style={styles.rowIcon}>
        <AppIcon color={brand.colors.light.primary} name={icon} size="sm" />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <AppIcon color={brand.colors.light.inkMuted} name="check" size="sm" />
    </View>
  );
}

function getInitials(firstName: string, lastName: string) {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "W";
}

function formatRole(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  const fullName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Wasil customer";

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
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {getInitials(user.firstName, user.lastName)}
              </Text>
            </View>
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
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your essentials</Text>
          <Text style={styles.sectionCaption}>Kept simple</Text>
        </View>
        <View style={styles.accountCard}>
          <AccountRow
            detail="Your contact details are ready"
            icon="personalInformation"
            label="Personal information"
          />
          <View style={styles.divider} />
          <AccountRow
            detail="Add a delivery address at checkout"
            icon="addresses"
            label="Delivery addresses"
          />
          <View style={styles.divider} />
          <AccountRow
            detail="Payments are confirmed securely"
            icon="paymentMethods"
            label="Payment & receipts"
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

        <View style={styles.supportRow}>
          <AppIcon
            color={brand.colors.light.inkMuted}
            name="helpSupport"
            size="sm"
          />
          <Text style={styles.supportText}>Need help with an order?</Text>
          <Text style={styles.supportStatus}>Support is here</Text>
        </View>

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
    alignItems: "center",
    backgroundColor: "#FFF8F4",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: {
    color: brand.colors.light.primary,
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.3,
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
