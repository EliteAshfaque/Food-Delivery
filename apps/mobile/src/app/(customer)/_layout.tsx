import { NativeTabs } from "expo-router/unstable-native-tabs";

import { brand } from "@/constants/brand";

export default function CustomerLayout() {
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
      <NativeTabs.Trigger name="(index)">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="search">
        <NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="cart">
        <NativeTabs.Trigger.Label>Cart</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bag.fill" md="shopping_cart" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Label>Orders</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="shippingbox.fill" md="local_shipping" />
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
