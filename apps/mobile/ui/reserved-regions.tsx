import Constants, { ExecutionEnvironment } from "expo-constants";
import { Component, createContext, useContext, type ReactNode } from "react";
import { UIManager, View, type StyleProp, type ViewStyle } from "react-native";

import {
  reservedRegionsEnabled,
  reservedRegionsViewAvailable,
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
  if (!reservedRegionsEnabled(extra)) {
    nativeAvailable = false;
    return false;
  }
  nativeAvailable = reservedRegionsViewAvailable({
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
    // Evaluated only after the kill switch and view-manager check.
    // The 0.2.0 native view flushSyncs its first measurement from layoutSubviews
    // and installs a hinge observer. Expo Go never reaches this require.
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

function NativeRegionsBridge({
  children,
  useNativeRegions,
}: {
  children: ReactNode;
  useNativeRegions: () => readonly ReservedRegion[];
}) {
  let regions = emptyRegions;
  try {
    const next = useNativeRegions();
    if (Array.isArray(next)) regions = next;
  } catch {
    nativeFailed = true;
    regions = emptyRegions;
  }
  return <RegionsContext.Provider value={regions}>{children}</RegionsContext.Provider>;
}

export function useReservedRegions(): readonly ReservedRegion[] {
  const regions = useContext(RegionsContext);
  return Array.isArray(regions) ? regions : emptyRegions;
}
