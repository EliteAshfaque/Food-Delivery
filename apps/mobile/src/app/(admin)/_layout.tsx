import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { brand } from '@/constants/brand';

/** A role-isolated operations workspace. Access is also enforced by /admin API guards. */
export default function AdminLayout() {
  return (
    <NativeTabs
      backgroundColor={brand.colors.light.surface}
      iconColor={{
        default: brand.colors.light.inkMuted,
        selected: brand.colors.light.primary,
      }}
      indicatorColor={brand.colors.light.primarySoft}
      labelStyle={{
        default: { color: brand.colors.light.inkMuted, fontWeight: '700' },
        selected: { color: brand.colors.light.primary, fontWeight: '900' },
      }}
      tintColor={brand.colors.light.primary}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Overview</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" md="dashboard" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="users">
        <NativeTabs.Trigger.Label>Users</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="restaurants">
        <NativeTabs.Trigger.Label>Restaurants</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="storefront.fill" md="storefront" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="orders">
        <NativeTabs.Trigger.Label>Orders</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="receipt.fill" md="receipt_long" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="offers">
        <NativeTabs.Trigger.Label>Offers</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="tag.fill" md="local_offer" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="audit">
        <NativeTabs.Trigger.Label>Audit</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" md="history" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
