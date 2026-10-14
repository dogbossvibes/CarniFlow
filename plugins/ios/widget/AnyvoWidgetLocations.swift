import SwiftUI
import WidgetKit

extension WidgetConfiguration {
  func anyvoPhoneOnly() -> some WidgetConfiguration {
    #if compiler(>=6.2)
    if #available(iOS 26.0, *) {
      // Advisory Apple opt-out: users may still place this under Other widgets.
      // Daily rendering remains generic, so privacy does not rely on this alone.
      return self.disfavoredLocations([.carPlay], for: [.systemSmall])
    } else { return self }
    #else
    return self
    #endif
  }
}
