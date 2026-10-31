import Constants, { ExecutionEnvironment } from "expo-constants";
import { Component, createContext, memo, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { UIManager, View, type StyleProp, type ViewStyle } from "react-native";

import { createReservedRegionApplier, reservedRegionsEqual } from "./reserved-region-updates";
import {
  shouldMountReservedRegions,
  type ReservedRegion,
} from "./reserved-regions-availability";

type ReservedRegionsModule = {
  ReservedRegionsProvider: (props: {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
  }) => ReactNode;
  useReservedRegions: () => readonly ReservedRegion[];
};

const emptyRegions: readonly ReservedRegion[] = [];
const RegionsContext = createContext<readonly ReservedRegion[] | null>(null);

let nativeAvailable: boolean | null = null;
let nativeFailed = false;

export function isReservedRegionsNativeAvailable(): boolean {
  if (nativeFailed) return false;
  if (nativeAvailable !== null) return nativeAvailable;
  const extra = Constants.expoConfig?.extra as { reservedRegions?: boolean } | undefined;
  nativeAvailable = shouldMountReservedRegions({
    extra,
    executionEnvironment: Constants.executionEnvironment ?? ExecutionEnvironment.Bare,
    hasViewManager: (name) => {
      const manager = UIManager as { hasViewManagerConfig?: (viewName: string) => boolean } | undefined;
      if (!manager || typeof manager.hasViewManagerConfig !== "function") return false;
      try {
        return manager.hasViewManagerConfig(name);
      } catch {
        return false;
      }
    },
  });
  return nativeAvailable;
}

function loadReservedRegions(): ReservedRegionsModule | null {
  if (!isReservedRegionsNativeAvailable()) return null;
  try {
    // Evaluated only after the kill switch, Expo Go check, and view-manager check.
    // The patched native view emits regions on a later main-queue turn. This module
    // still publishes them on the next frame so layout cannot setState inside UIKit.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-reserved-regions") as ReservedRegionsModule;
  } catch {
    nativeFailed = true;
    nativeAvailable = false;
    return null;
  }
}

function FallbackRegions({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <RegionsContext.Provider value={emptyRegions}>
      <View style={style}>{children}</View>
    </RegionsContext.Provider>
  );
}

class ReservedRegionsErrorBoundary extends Component<
  { children: ReactNode; content: ReactNode; style?: StyleProp<ViewStyle> },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    nativeFailed = true;
    nativeAvailable = false;
  }

  render() {
    if (this.state.failed) return <FallbackRegions style={this.props.style}>{this.props.content}</FallbackRegions>;
    return this.props.children;
  }
}

export function ReservedRegionsProvider({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const native = loadReservedRegions();
  if (!native) return <FallbackRegions style={style}>{children}</FallbackRegions>;
  const NativeProvider = native.ReservedRegionsProvider;
  return (
    <ReservedRegionsErrorBoundary content={children} style={style}>
      <NativeProvider style={style}>
        <NativeRegionsBridge useNativeRegions={native.useReservedRegions}>{children}</NativeRegionsBridge>
      </NativeProvider>
    </ReservedRegionsErrorBoundary>
  );
}

const NativeRegionsBridge = memo(function NativeRegionsBridge({
  children,
  useNativeRegions,
}: {
  children: ReactNode;
  useNativeRegions: () => readonly ReservedRegion[];
}) {
  const [regions, setRegions] = useState<readonly ReservedRegion[]>(emptyRegions);
  const applierRef = useRef(createReservedRegionApplier());
  const publishedRef = useRef<readonly ReservedRegion[]>(emptyRegions);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const publish = useCallback((incoming: readonly ReservedRegion[]) => {
    if (!applierRef.current.push(incoming)) return;
    requestAnimationFrame(() => {
      const next = applierRef.current.flush();
      if (!activeRef.current || reservedRegionsEqual(publishedRef.current, next)) return;
      publishedRef.current = next;
      setRegions(next);
    });
  }, []);

  return (
    <RegionsContext.Provider value={regions}>
      <NativeRegionSnapshot onRegions={publish} useNativeRegions={useNativeRegions} />
      {children}
    </RegionsContext.Provider>
  );
});

function NativeRegionSnapshot({
  onRegions,
  useNativeRegions,
}: {
  onRegions: (regions: readonly ReservedRegion[]) => void;
  useNativeRegions: () => readonly ReservedRegion[];
}) {
  const next = useNativeRegions();
  const incoming = Array.isArray(next) ? next : emptyRegions;
  useEffect(() => {
    onRegions(incoming);
  }, [incoming, onRegions]);
  return null;
}

export function useReservedRegions(): readonly ReservedRegion[] {
  const regions = useContext(RegionsContext);
  return Array.isArray(regions) ? regions : emptyRegions;
}
