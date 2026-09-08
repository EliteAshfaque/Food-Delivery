const {
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const resources = {
  'drawable/ic_stat_wasil.xml': `<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24"><path android:fillColor="#FFFFFFFF" android:pathData="M3,5h2.2l2.1,9.2c0.2,0.9 1,1.5 1.9,1.5h8.7c0.9,0 1.7,-0.6 1.9,-1.5L21,8H8.1L7.6,6H3zM10,19.5a1.75,1.75 0,1 0,0 3.5,1.75 1.75,0 0,0 0,-3.5zM18,19.5a1.75,1.75 0,1 0,0 3.5,1.75 1.75,0 0,0 0,-3.5z"/></vector>`,
  'drawable/notification_tracking_panel.xml': `<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#25192A"/><corners android:radius="20dp"/><padding android:left="16dp" android:top="14dp" android:right="16dp" android:bottom="14dp"/></shape>`,
  'layout/notification_order_tracking_compact.xml': `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_margin="8dp" android:background="@drawable/notification_tracking_panel" android:orientation="vertical"><TextView android:id="@+id/tracking_title" android:layout_width="match_parent" android:layout_height="wrap_content" android:textColor="#FFFFFFFF" android:textSize="16sp" android:textStyle="bold"/><TextView android:id="@+id/tracking_supporting_text" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="3dp" android:textColor="#FFE8DFE9" android:textSize="13sp"/><ProgressBar android:id="@+id/tracking_progress" style="?android:attr/progressBarStyleHorizontal" android:layout_width="match_parent" android:layout_height="6dp" android:layout_marginTop="10dp" android:indeterminate="false" android:max="6" android:progressTint="#FF59E2BC"/></LinearLayout>`,
  'layout/notification_order_tracking_expanded.xml': `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_margin="8dp" android:background="@drawable/notification_tracking_panel" android:orientation="vertical"><TextView android:id="@+id/tracking_title" android:layout_width="match_parent" android:layout_height="wrap_content" android:textColor="#FFFFFFFF" android:textSize="18sp" android:textStyle="bold"/><TextView android:id="@+id/tracking_supporting_text" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="4dp" android:textColor="#FFE8DFE9" android:textSize="14sp"/><ProgressBar android:id="@+id/tracking_progress" style="?android:attr/progressBarStyleHorizontal" android:layout_width="match_parent" android:layout_height="7dp" android:layout_marginTop="12dp" android:indeterminate="false" android:max="6" android:progressTint="#FF59E2BC"/><LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="7dp" android:gravity="center" android:orientation="horizontal"><TextView android:id="@+id/step_pay" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center" android:text="Pay" android:textSize="10sp"/><TextView android:id="@+id/step_confirmed" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center" android:text="Confirmed" android:textSize="10sp"/><TextView android:id="@+id/step_kitchen" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center" android:text="Kitchen" android:textSize="10sp"/><TextView android:id="@+id/step_ready" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center" android:text="Ready" android:textSize="10sp"/><TextView android:id="@+id/step_en_route" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center" android:text="En route" android:textSize="10sp"/><TextView android:id="@+id/step_done" android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:gravity="center" android:text="Done" android:textSize="10sp"/></LinearLayout><TextView android:id="@+id/tracking_restaurant" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="12dp" android:textColor="#FFFFFFFF" android:textSize="14sp" android:textStyle="bold"/><TextView android:id="@+id/tracking_address" android:layout_width="match_parent" android:layout_height="wrap_content" android:layout_marginTop="3dp" android:textColor="#FFE8DFE9" android:textSize="12sp" android:maxLines="2"/></LinearLayout>`,
};

function withOrderTrackingAndroid(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest['uses-permission'] ??= [];
    for (const permission of ['android.permission.POST_NOTIFICATIONS', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_DATA_SYNC']) {
      if (!manifest['uses-permission'].some((entry) => entry.$?.['android:name'] === permission)) manifest['uses-permission'].push({ $: { 'android:name': permission } });
    }
    const app = manifest.application?.[0];
    if (!app) throw new Error('Android application node is missing');
    app.service ??= [];
    if (!app.service.some((service) => service.$?.['android:name'] === 'expo.modules.notifications.service.ExpoFirebaseMessagingService')) app.service.push({ $: { 'android:name': 'expo.modules.notifications.service.ExpoFirebaseMessagingService', 'tools:node': 'remove' } });
    if (!app.service.some((service) => service.$?.['android:name'] === '.tracking.WasilFirebaseMessagingService')) app.service.push({ $: { 'android:name': '.tracking.WasilFirebaseMessagingService', 'android:exported': 'false' }, 'intent-filter': [{ $: { 'android:priority': '0' }, action: [{ $: { 'android:name': 'com.google.firebase.MESSAGING_EVENT' } }] }] });
    if (!app.service.some((service) => service.$?.['android:name'] === '.tracking.ActiveOrderTrackingService')) app.service.push({ $: { 'android:name': '.tracking.ActiveOrderTrackingService', 'android:exported': 'false', 'android:foregroundServiceType': 'dataSync' } });
    return config;
  });
  config = withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes('com.google.firebase:firebase-messaging')) config.modResults.contents = config.modResults.contents.replace('dependencies {', 'dependencies {\n    implementation("com.google.firebase:firebase-messaging:25.0.1")');
    return config;
  });
  return withDangerousMod(config, ['android', async (config) => {
    const root = config.modRequest.projectRoot;
    const javaDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/java/com/wasil/fooddelivery/tracking');
    const resDir = path.join(config.modRequest.platformProjectRoot, 'app/src/main/res');
    fs.mkdirSync(javaDir, { recursive: true });
    fs.copyFileSync(path.join(root, 'native/android/OrderTrackingFirebaseMessagingService.kt'), path.join(javaDir, 'WasilFirebaseMessagingService.kt'));
    for (const [relativePath, contents] of Object.entries(resources)) {
      const target = path.join(resDir, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    }
    return config;
  }]);
}

module.exports = withOrderTrackingAndroid;
