import { createElement, useEffect } from "react";

function host(tag) {
  return function Host(props) {
    const { children } = props ?? {};
    const child = typeof children === "function" ? children({ pressed: false }) : children;
    return createElement(tag, null, child);
  };
}

export const View = host("div");
export const Text = host("span");
export const Pressable = host("button");
export const ScrollView = host("div");
export const SafeAreaView = host("div");
export const Image = host("img");
export const TextInput = host("input");
export const ActivityIndicator = host("div");
export const KeyboardAvoidingView = host("div");
export const Modal = host("div");
export const LinearGradient = host("div");
export const TouchableOpacity = host("button");
export const Switch = host("input");
export const StatusBar = host("div");

export const AccessibilityInfo = {
  addEventListener() {
    return { remove() {} };
  },
  announceForAccessibility() {},
  isReduceMotionEnabled() {
    return Promise.resolve(false);
  },
};

export const Keyboard = {
  addListener() {
    return { remove() {} };
  },
  dismiss() {},
};

export const Linking = {
  addEventListener() {
    return { remove() {} };
  },
  getInitialURL() {
    return Promise.resolve(null);
  },
  openURL() {
    return Promise.resolve();
  },
};

export const Alert = {
  alert() {},
};

export const Dimensions = {
  get() {
    return { fontScale: 1, height: 844, scale: 1, width: 390 };
  },
};

export function FlatList({
  ListFooterComponent,
  ListHeaderComponent,
  data = [],
  renderItem,
}) {
  const header = typeof ListHeaderComponent === "function"
    ? createElement(ListHeaderComponent)
    : ListHeaderComponent;
  const footer = typeof ListFooterComponent === "function"
    ? createElement(ListFooterComponent)
    : ListFooterComponent;
  return createElement(
    "div",
    null,
    header,
    data.map((item, index) => renderItem?.({ item, index })),
    footer,
  );
}

export const StyleSheet = {
  absoluteFill: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
  create(styles) {
    return styles;
  },
  flatten(style) {
    return style;
  },
  hairlineWidth: 1,
};

export const Platform = {
  OS: "web",
  Version: "0",
  isPad: false,
  select(spec) {
    return spec.web ?? spec.default;
  },
};

export const AppState = {
  addEventListener() {
    return { remove() {} };
  },
};

export const UIManager = {
  hasViewManagerConfig() {
    return false;
  },
};

export function useWindowDimensions() {
  return { fontScale: 1, height: 844, scale: 1, width: 390 };
}

export const Animated = {
  Image: host("img"),
  ScrollView: host("div"),
  Text: host("span"),
  Value: class {
    constructor(value) {
      this._value = value;
    }
    interpolate() {
      return this;
    }
    setValue(value) {
      this._value = value;
    }
  },
  View: host("div"),
  timing() {
    return { start() {}, stop() {} };
  },
};

export const Easing = {
  in(fn) {
    return fn;
  },
  out(fn) {
    return fn;
  },
  cubic: (value) => value,
  quad: (value) => value,
};

export const PanResponder = {
  create() {
    return { panHandlers: {} };
  },
};

export function useSafeAreaInsets() {
  return { bottom: 0, left: 0, right: 0, top: 0 };
}

export function useReservedRegions() {
  return [];
}

export function ReservedRegionsProvider({ children }) {
  return children;
}

export function requireOptionalNativeModule() {
  return null;
}

export function createClient() {
  return null;
}

export const processLock = {};

export const ExecutionEnvironment = {
  Bare: "bare",
  StoreClient: "storeClient",
  Standalone: "standalone",
};

export const Constants = {
  executionEnvironment: "bare",
  expoConfig: { extra: {}, version: "1.0.0" },
};

export function useRouter() {
  return {
    back() {},
    push() {},
    replace() {},
  };
}

export function usePathname() {
  return "/history";
}

export function useGlobalSearchParams() {
  return {};
}

export function useLocalSearchParams() {
  return { sessionId: "session-1" };
}

export function useFocusEffect(effect) {
  useEffect(effect);
}

export function Redirect() {
  return null;
}

export function Tabs({ children }) {
  return children;
}
Tabs.Screen = function TabsScreen() {
  return null;
};

export const NativeTabs = {
  Trigger: Object.assign(function Trigger({ children }) {
    return children;
  }, {
    Icon() {
      return null;
    },
    Label() {
      return null;
    },
  }),
};

function Screen() {
  return null;
}
function Toolbar({ children }) {
  return children ?? null;
}
Toolbar.Button = function ToolbarButton() {
  return null;
};
export const Stack = { Screen, Toolbar };

export function SymbolView() {
  return null;
}

export const Feather = host("span");
export const MaterialCommunityIcons = host("span");

export function init() {}
export function wrap(component) {
  return component;
}
export function captureException() {}
export function setUser() {}
export function reactNavigationIntegration() {
  return {};
}
export function mobileReplayIntegration() {
  return {};
}

function DefaultStub(props) {
  const child = props?.children;
  return createElement("div", null, typeof child === "function" ? child({ pressed: false }) : child);
}

Object.assign(DefaultStub, {
  Animated,
  AppState,
  Constants,
  ExecutionEnvironment,
  Feather,
  MaterialCommunityIcons,
  Modal,
  NativeTabs,
  Platform,
  Pressable,
  Redirect,
  ReservedRegionsProvider,
  SafeAreaView,
  Stack,
  StyleSheet,
  SymbolView,
  Tabs,
  Text,
  UIManager,
  View,
  captureException,
  createClient,
  init,
  processLock,
  requireOptionalNativeModule,
  setUser,
  useFocusEffect,
  useGlobalSearchParams,
  useLocalSearchParams,
  usePathname,
  useReservedRegions,
  useRouter,
  useSafeAreaInsets,
  useWindowDimensions,
  wrap,
});

export default DefaultStub;
