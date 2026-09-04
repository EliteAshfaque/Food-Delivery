import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { brand } from '@/constants/brand';

export default function OwnerLayout() {
  return (
    <NativeTabs
      backgroundColor={brand.colors.light.surface}
      iconColor={{
        default: brand.colors.light.inkMuted,
        selected: brand.colors.light.primary,
      }}
      indicatorColor={brand.colors.light.primarySoft}
      labelStyle={{
        default: { color: brand.colors.light.inkMuted, fontWeight: '600' },
        selected: { color: brand.colors.light.primary, fontWeight: '800' },
      }}
      tintColor={brand.colors.light.primary}>
      <NativeTabs.Trigger name="(index)">
        <NativeTabs.Trigger.Label>Orders</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="shippingbox.fill" md="local_shipping" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="menu">
        <NativeTabs.Trigger.Label>Menu</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="menucard.fill" md="restaurant_menu" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="analytics">
        <NativeTabs.Trigger.Label>Analytics</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.xaxis" md="bar_chart" />
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
