// Promo takes for `promo ios record`: copied into promo/src by the project's prepare.sh, never into the app repo.
// The engine launches the app with `-promoTake <name>` and films the Simulator; this file drives the app through
// the take and prints "PROMO mark <name>" at the moments the narration hangs on, then "PROMO end".
//
// Hook it up in the copy (prepare.sh patches the App struct), e.g.:
//     WindowGroup { ContentView().task { await PromoDirector.run(appState) } }
// and keep everything app-specific inside run(): demo data, which tab, which sheet, what gets tapped.
import Foundation
import SwiftUI

enum Promo {
    /// The take being filmed, nil in a normal launch.
    static let take = UserDefaults.standard.string(forKey: "promoTake")
    static var active: Bool { take != nil }

    static func mark(_ name: String) {
        print("PROMO mark \(name)")
        fflush(stdout)
    }

    static func end() {
        print("PROMO end")
        fflush(stdout)
    }

    /// Waits, so the viewer can see what just happened.
    static func hold(_ seconds: Double) async {
        try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
    }

    /// Runs a UI change with a spring, like a tap would.
    @MainActor static func tap(_ change: () -> Void) {
        withAnimation(.spring(response: 0.45, dampingFraction: 0.85)) { change() }
    }
}

@MainActor
enum PromoDirector {
    static func run() async {
        guard let take = Promo.take else { return }
        await Promo.hold(1.0)  // let the first screen settle in the recording
        switch take {
        case "tour":
            Promo.mark("start")
            // … drive the app, Promo.mark("…") at each beat, Promo.hold(…) between them
            await Promo.hold(2.0)
        default:
            break
        }
        Promo.mark("last")
        await Promo.hold(1.0)
        Promo.end()
    }
}
