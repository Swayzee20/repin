import Constants, { ExecutionEnvironment } from "expo-constants";
import { createContext, useContext, type ReactNode } from "react";
import { UIManager, View, type StyleProp, type ViewStyle } from "react-native";

import {
  reservedRegionsViewAvailable,
  type ReservedRegion,
} from "./reserved-regions-availability";

type ReservedRegionsModule = {
  ReservedRegionsProvider: (props: {
    children?: ReactNode;
    style?: StyleProp<ViewStyle>;
  }) => React.JSX.Element;
  useReservedRegions: () => readonly ReservedRegion[];
};

const emptyRegions: readonly ReservedRegion[] = [];
const RegionsContext = createContext<readonly ReservedRegion[] | null>(null);

let nativeAvailable: boolean | null = null;

export function isReservedRegionsNativeAvailable(): boolean {
  if (nativeAvailable !== null) return nativeAvailable;
  nativeAvailable = reservedRegionsViewAvailable({
    executionEnvironment: Constants.executionEnvironment ?? ExecutionEnvironment.Bare,
    hasViewManager: (name) => {
      const manager = UIManager as { hasViewManagerConfig?: (viewName: string) => boolean } | undefined;
      if (!manager || typeof manager.hasViewManagerConfig !== "function") return false;
      return manager.hasViewManagerConfig(name);
    },
  });
  return nativeAvailable;
}

function loadReservedRegions(): ReservedRegionsModule | null {
  if (!isReservedRegionsNativeAvailable()) return null;
  try {
    // Evaluated only after the view-manager check so Expo Go never loads the unregistered native view.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("react-native-reserved-regions") as ReservedRegionsModule;
  } catch {
    return null;
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
  if (!native) {
    return (
      <RegionsContext.Provider value={emptyRegions}>
        <View style={style}>{children}</View>
      </RegionsContext.Provider>
    );
  }
  const NativeProvider = native.ReservedRegionsProvider;
  return (
    <NativeProvider style={style}>
      <NativeRegionsBridge useNativeRegions={native.useReservedRegions}>{children}</NativeRegionsBridge>
    </NativeProvider>
  );
}

function NativeRegionsBridge({
  children,
  useNativeRegions,
}: {
  children: ReactNode;
  useNativeRegions: () => readonly ReservedRegion[];
}) {
  const regions = useNativeRegions();
  return <RegionsContext.Provider value={regions}>{children}</RegionsContext.Provider>;
}

export function useReservedRegions(): readonly ReservedRegion[] {
  return useContext(RegionsContext) ?? emptyRegions;
}
