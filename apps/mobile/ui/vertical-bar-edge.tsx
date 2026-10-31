import { requireOptionalNativeModule } from "expo";
import { useEffect, useState } from "react";

export type VerticalBarEdge = "leading" | "trailing";

type StatusBarSubscription = { remove: () => void };

type StatusBarModule = {
  addListener: (
    eventName: "onVerticalBarEdgeChange",
    listener: (event: { edge?: string | null }) => void,
  ) => StatusBarSubscription;
};

/**
 * The edge of the iPhone Duo side strip, or null when there is no strip.
 *
 * Do not call `StatusBar.getVerticalBarEdgeIOS()`. That synchronous Expo Function hops to the
 * main thread with `dispatch_sync`. A fold runs JS from the main thread's event beat
 * (`executeNowOnTheSameThread`), so the hop deadlocks (0x8BADF00D). Observation emits the
 * current edge, and later changes, without that synchronous call.
 */
const statusBar: StatusBarModule | null = requireOptionalNativeModule("ExpoStatusBar");

export function useVerticalBarEdge(): VerticalBarEdge | null {
  const [edge, setEdge] = useState<VerticalBarEdge | null>(null);

  useEffect(() => {
    if (!statusBar) return;
    const subscription = statusBar.addListener("onVerticalBarEdgeChange", (event) => {
      setEdge(event.edge === "leading" || event.edge === "trailing" ? event.edge : null);
    });
    return () => subscription.remove();
  }, []);

  return edge;
}
