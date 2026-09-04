import { NativeTabs } from "expo-router/unstable-native-tabs";

import { brand } from "@/constants/brand";

/** The driver workspace deliberately shares the customer-facing Wasil palette. */
export default function DriverLayout() {
  return (
    <NativeTabs
      backgroundColor={brand.colors.light.surface}
      iconColor={{
        default: brand.colors.light.inkMuted,
        selected: brand.colors.light.primary,
      }}
      indicatorColor={brand.colors.light.primarySoft}
      labelStyle={{
        default: { color: brand.colors.light.inkMuted, fontWeight: "600" },
        selected: { color: brand.colors.light.primary, fontWeight: "800" },
      }}
      tintColor={brand.colors.light.primary}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="active">
        <NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bicycle" md="local_shipping" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>Profile</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf="person.crop.circle.fill"
          md="account_circle"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
