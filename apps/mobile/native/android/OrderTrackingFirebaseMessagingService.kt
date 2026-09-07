package com.wasil.fooddelivery.tracking

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Copy into android/app/src/main/java after Expo prebuild; data-only FCM updates the same ongoing card. */
class OrderTrackingFirebaseMessagingService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    if (data["type"] != "order_tracking") return
    val orderId = data["orderId"] ?: return
    val channelId = "active-order-tracking"
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(NotificationChannel(channelId, "Active order tracking", NotificationManager.IMPORTANCE_DEFAULT))
    val status = data["status"] ?: "Order update"
    val eta = data["eta"] ?: "ETA updating"
    val rider = data["riderName"]?.let { " • $it" }.orEmpty()
    manager.notify(orderId.hashCode(), NotificationCompat.Builder(this, channelId)
      .setSmallIcon(com.wasil.fooddelivery.R.drawable.ic_notification)
      .setContentTitle(status).setContentText("$eta$rider")
      .setStyle(NotificationCompat.BigTextStyle().bigText("$eta$rider\n${data["restaurantName"].orEmpty()}\n${data["deliveryAddress"].orEmpty()}"))
      .setOnlyAlertOnce(true).setOngoing(status != "DELIVERED").build())
  }
}
