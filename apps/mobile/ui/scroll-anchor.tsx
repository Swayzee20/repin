import { createContext, useCallback, useContext, useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from "react";
import {
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";

type HostView = ComponentRef<typeof View>;

import {
  anchoredScrollOffset,
  topVisibleAnchor,
  type AnchoredItem,
  type ScrollAnchor,
} from "./layout-math";

type ItemLayout = {
  generation: number;
  height: number;
  y: number;
};

export type ScrollAnchorController = {
  anchorRef: RefObject<ScrollAnchor | null>;
  clearItems: () => void;
  contentRef: RefObject<HostView | null>;
  onContentSizeChange: (width: number, height: number) => void;
  onItemLayout: (id: string, layout: { height: number; y: number }) => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onViewportLayout: (event: LayoutChangeEvent) => void;
  requestRestore: () => void;
  scrollRef: RefObject<ScrollViewInstance | null>;
};

const storedAnchors = new Map<string, ScrollAnchor>();

export function readStoredScrollAnchor(key: string) {
  return storedAnchors.get(key) ?? null;
}

export function writeStoredScrollAnchor(key: string, anchor: ScrollAnchor | null) {
  if (!anchor) storedAnchors.delete(key);
  else storedAnchors.set(key, anchor);
}

type ScrollAnchorContextValue = {
  contentRef: RefObject<HostView | null>;
  onItemLayout: ScrollAnchorController["onItemLayout"];
};

const ScrollAnchorContext = createContext<ScrollAnchorContextValue | null>(null);
const PaneContext = createContext<"left" | "right" | null>(null);
const AnchorRegistryContext = createContext<RefObject<Map<string, "left" | "right">> | null>(null);

export function useScrollAnchor(relayoutKey: string, storageKey?: string | null): ScrollAnchorController {
  const scrollRef = useRef<ScrollViewInstance>(null);
  const contentRef = useRef<HostView>(null);
  const stored = storageKey ? storedAnchors.get(storageKey) ?? null : null;
  const anchorRef = useRef<ScrollAnchor | null>(stored);
  const items = useRef(new Map<string, ItemLayout>());
  const pending = useRef(stored !== null);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const generation = useRef(0);
  const keyRef = useRef(relayoutKey);
  const storageKeyRef = useRef<string | null>(storageKey ?? null);

  if (storageKeyRef.current !== (storageKey ?? null)) {
    storageKeyRef.current = storageKey ?? null;
    const next = storageKey ? storedAnchors.get(storageKey) ?? null : null;
    anchorRef.current = next;
    generation.current += 1;
    if (next) pending.current = true;
  }

  if (keyRef.current !== relayoutKey) {
    keyRef.current = relayoutKey;
    generation.current += 1;
    if (anchorRef.current) pending.current = true;
  }

  const restore = useCallback(() => {
    const saved = anchorRef.current;
    if (!pending.current || !saved || !scrollRef.current) return;
    const item = items.current.get(saved.id);
    if (!item || item.generation !== generation.current) return;
    const y = anchoredScrollOffset(item, saved, contentHeight.current, viewportHeight.current);
    scrollRef.current.scrollTo({ animated: false, y });
    pending.current = false;
  }, []);

  const onItemLayout = useCallback((id: string, layout: { height: number; y: number }) => {
    items.current.set(id, { ...layout, generation: generation.current });
    restore();
  }, [restore]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pending.current) return;
    viewportHeight.current = event.nativeEvent.layoutMeasurement.height;
    contentHeight.current = event.nativeEvent.contentSize.height;
    const list: AnchoredItem[] = [...items.current.entries()]
      .filter(([, layout]) => layout.generation === generation.current)
      .map(([id, layout]) => ({ height: layout.height, id, y: layout.y }));
    const next = topVisibleAnchor(list, event.nativeEvent.contentOffset.y);
    if (next) {
      anchorRef.current = next;
      if (storageKeyRef.current) storedAnchors.set(storageKeyRef.current, next);
    }
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeight.current = height;
    restore();
  }, [restore]);

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeight.current = event.nativeEvent.layout.height;
    restore();
  }, [restore]);

  const requestRestore = useCallback(() => {
    if (anchorRef.current) pending.current = true;
  }, []);

  const clearItems = useCallback(() => {
    items.current.clear();
  }, []);

  useEffect(() => () => {
    items.current.clear();
  }, []);

  return {
    anchorRef,
    clearItems,
    contentRef,
    onContentSizeChange,
    onItemLayout,
    onScroll,
    onViewportLayout,
    requestRestore,
    scrollRef,
  };
}

export function ScrollAnchorProvider({
  children,
  contentRef,
  onItemLayout,
  pane,
}: {
  children: ReactNode;
  contentRef: RefObject<HostView | null>;
  onItemLayout: ScrollAnchorController["onItemLayout"];
  pane: "left" | "right" | null;
}) {
  return (
    <PaneContext.Provider value={pane}>
      <ScrollAnchorContext.Provider value={{ contentRef, onItemLayout }}>
        {children}
      </ScrollAnchorContext.Provider>
    </PaneContext.Provider>
  );
}

export function AnchorRegistryProvider({
  children,
  registry,
}: {
  children: ReactNode;
  registry: RefObject<Map<string, "left" | "right">>;
}) {
  return <AnchorRegistryContext.Provider value={registry}>{children}</AnchorRegistryContext.Provider>;
}

export function PaneScope({ children, pane }: { children: ReactNode; pane: "left" | "right" }) {
  return <PaneContext.Provider value={pane}>{children}</PaneContext.Provider>;
}

export function ScrollAnchor({ children, id }: { children: ReactNode; id: string }) {
  const scroll = useContext(ScrollAnchorContext);
  const pane = useContext(PaneContext);
  const registry = useContext(AnchorRegistryContext);
  const ref = useRef<HostView>(null);
  if (registry && pane) registry.current.set(id, pane);

  const measure = (event: LayoutChangeEvent) => {
    const node = ref.current;
    const content = scroll?.contentRef.current;
    if (!scroll) return;
    const fallback = () => {
      scroll.onItemLayout(id, {
        height: event.nativeEvent.layout.height,
        y: event.nativeEvent.layout.y,
      });
    };
    if (!node || !content) {
      fallback();
      return;
    }
    try {
      node.measureLayout(
        content,
        (_x: number, y: number, _width: number, height: number) => scroll.onItemLayout(id, { height, y }),
        fallback,
      );
    } catch {
      fallback();
    }
  };

  return (
    <View collapsable={false} onLayout={measure} ref={ref}>
      {children}
    </View>
  );
}
