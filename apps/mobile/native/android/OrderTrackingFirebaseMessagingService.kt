package com.wasil.fooddelivery.tracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.RemoteMessage
import com.wasil.fooddelivery.MainActivity
import com.wasil.fooddelivery.R
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/** Source installed by the Expo config plugin. Android notification RemoteViews
 * cannot host React Native or Lottie, so this uses the supported native stepper. */
data class TrackingUpdate(val orderId: String, val status: String, val title: String, val body: String, val eta: String?, val riderName: String?, val restaurantName: String?, val deliveryAddress: String?) {
  val step: Int get() = when (status.uppercase()) { "PENDING" -> 1; "CONFIRMED" -> 2; "PREPARING" -> 3; "READY" -> 4; "PICKED_UP" -> 5; "DELIVERED" -> 6; else -> 1 }
  val isTerminal: Boolean get() = status.uppercase() in setOf("DELIVERED", "CANCELLED")
  companion object {
    fun from(data: Map<String, String>): TrackingUpdate? {
      val orderId = data["orderId"]?.takeIf { it.isNotBlank() } ?: return null
      val status = data["orderStatus"]?.takeIf { it.isNotBlank() } ?: return null
      return TrackingUpdate(orderId, status, data["notificationTitle"] ?: "Order update", data["notificationBody"] ?: "Your order status has changed.", data["eta"], data["riderName"], data["restaurantName"], data["deliveryAddress"])
    }
    fun from(intent: Intent): TrackingUpdate? = from(listOf("orderId", "orderStatus", "notificationTitle", "notificationBody", "eta", "riderName", "restaurantName", "deliveryAddress").mapNotNull { key -> intent.getStringExtra(key)?.let { key to it } }.toMap())
  }
}

object OrderTrackingNotification {
  const val CHANNEL_ID = "active-order-tracking-v2"
  fun show(context: Context, update: TrackingUpdate, ongoing: Boolean): Notification {
    createChannel(context)
    val compact = RemoteViews(context.packageName, R.layout.notification_order_tracking_compact)
    val expanded = RemoteViews(context.packageName, R.layout.notification_order_tracking_expanded)
    bind(compact, update, true); bind(expanded, update, false)
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("wasil://oder/${update.orderId}"), context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val contentIntent = PendingIntent.getActivity(context, update.orderId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    return NotificationCompat.Builder(context, CHANNEL_ID).setSmallIcon(R.drawable.ic_stat_wasil).setContentTitle(update.title).setContentText(update.body).setSubText(update.eta ?: "Live order tracking").setCustomContentView(compact).setCustomBigContentView(expanded).setStyle(NotificationCompat.DecoratedCustomViewStyle()).setContentIntent(contentIntent).setCategory(NotificationCompat.CATEGORY_STATUS).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setPriority(NotificationCompat.PRIORITY_HIGH).setOnlyAlertOnce(true).setOngoing(ongoing).setAutoCancel(!ongoing).setProgress(6, update.step, false).build()
  }
  fun notify(context: Context, update: TrackingUpdate, ongoing: Boolean) { (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(notificationId(update.orderId), show(context, update, ongoing)) }
  fun notificationId(orderId: String) = orderId.hashCode()
  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(CHANNEL_ID, "Active order tracking", NotificationManager.IMPORTANCE_HIGH).apply { description = "Live status updates for your active order"; lockscreenVisibility = Notification.VISIBILITY_PUBLIC; enableVibration(true) }
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
  }
  private fun bind(view: RemoteViews, update: TrackingUpdate, compact: Boolean) {
    val support = listOfNotNull(update.eta?.takeIf { it.isNotBlank() }, update.riderName?.takeIf { it.isNotBlank() }?.let { "Rider: $it" }).joinToString("  •  ").ifBlank { update.body }
    view.setTextViewText(R.id.tracking_title, update.title); view.setTextViewText(R.id.tracking_supporting_text, support); view.setProgressBar(R.id.tracking_progress, 6, update.step, false)
    if (!compact) { view.setTextViewText(R.id.tracking_restaurant, update.restaurantName ?: update.body); view.setTextViewText(R.id.tracking_address, update.deliveryAddress ?: "Tap to view your order"); intArrayOf(R.id.step_pay, R.id.step_confirmed, R.id.step_kitchen, R.id.step_ready, R.id.step_en_route, R.id.step_done).forEachIndexed { index, id -> view.setTextColor(id, if (index < update.step) Color.rgb(89, 226, 188) else Color.rgb(205, 192, 207)) } }
  }
}

class ActiveOrderTrackingService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val update = intent?.let(TrackingUpdate::from) ?: run { stopSelf(startId); return START_NOT_STICKY }
    if (update.isTerminal) { OrderTrackingNotification.notify(this, update, false); stopSelf(startId) } else startForeground(OrderTrackingNotification.notificationId(update.orderId), OrderTrackingNotification.show(this, update, true))
    return START_NOT_STICKY
  }
  companion object {
    fun update(context: Context, update: TrackingUpdate) {
      val intent = Intent(context, ActiveOrderTrackingService::class.java).apply { putExtra("orderId", update.orderId); putExtra("orderStatus", update.status); putExtra("notificationTitle", update.title); putExtra("notificationBody", update.body); putExtra("eta", update.eta); putExtra("riderName", update.riderName); putExtra("restaurantName", update.restaurantName); putExtra("deliveryAddress", update.deliveryAddress) }
      try { ContextCompat.startForegroundService(context, intent) } catch (_: IllegalStateException) { OrderTrackingNotification.notify(context, update, true) } catch (_: SecurityException) { /* permission denied */ }
    }
  }
}

/** Preserves Expo's normal push delivery and handles data-only order lifecycle updates. */
class WasilFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)
    val data = remoteMessage.data
    if (data["type"] != "ORDER_UPDATE" || data["trackingNotification"] != "true") return
    val update = TrackingUpdate.from(data) ?: return
    if (update.isTerminal) OrderTrackingNotification.notify(this, update, false) else ActiveOrderTrackingService.update(this, update)
  }
}
