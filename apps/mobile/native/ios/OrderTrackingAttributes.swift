import ActivityKit
import Foundation

struct OrderTrackingAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var status: String
    var etaEpochSeconds: Int
    var riderName: String?
    var progress: Double
  }
  var orderID: String
  var restaurantName: String
  var deliveryAddress: String
}

@MainActor
final class OrderTrackingActivityManager {
  static let shared = OrderTrackingActivityManager()
  func start(orderID: String, restaurant: String, address: String, state: OrderTrackingAttributes.ContentState) throws {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    _ = try Activity.request(
      attributes: .init(orderID: orderID, restaurantName: restaurant, deliveryAddress: address),
      content: .init(state: state, staleDate: nil),
      pushType: .token
    )
  }
}
