import { crewPushHref, parseCrewPushPayload } from "@repin/validation";
import { usePathname, useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fetchHasCrewMembership } from "../lib/push-api";
import { registerPushHost } from "../lib/push-controller";
import {
  getPushPermissionStatus,
  removePushTokenForSession,
  requestPushPermission,
  syncPushTokenForSession,
} from "../lib/push-notifications";
import {
  canStartPrompt,
  isStaleGeneration,
  mayRequestOsPermission,
  nextPushHandoffAction,
  shouldLaunchExistingMemberPrompt,
  shouldRefreshPermissionOnAppState,
  type OverlayPlatform,
  type PushOsStatus,
} from "../lib/push-prompt-policy";
import {
  markPushPrepromptDismissed,
  wasPushPrepromptDismissed,
} from "../lib/push-prompt-store";
import { useAuthSession } from "../lib/use-auth-session";
import { overlayCount, subscribeOverlayCount } from "./overlay-occupancy";
import { PushPermissionSheet } from "./push-permission-sheet";
import { colors, fonts, radii, spacing, type } from "./theme";

type PushPermissionValue = {
  osStatus: PushOsStatus;
  promptFromSettings: () => void;
};

const PushPermissionContext = createContext<PushPermissionValue>({
  osStatus: "undetermined",
  promptFromSettings: () => {},
});

export function usePushPermission() {
  return useContext(PushPermissionContext);
}

function overlayPlatform(): OverlayPlatform {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

export function PushNotificationsHost({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, session } = useAuthSession();
  const sessionRef = useRef(session);
  const accessTokenRef = useRef<string | null>(session?.access_token ?? null);
  const handledResponse = useRef<string | null>(null);
  const pendingHref = useRef<string | null>(null);
  const promptLocked = useRef(false);
  const generationRef = useRef(0);
  const userIdRef = useRef<string | null>(null);
  const sheetVisibleRef = useRef(false);
  const aliveRef = useRef(true);
  const [osStatus, setOsStatus] = useState<PushOsStatus>("undetermined");
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [forcePrompt, setForcePrompt] = useState(false);
  const [overlayTick, setOverlayTick] = useState(0);
  const [banner, setBanner] = useState<{ title: string; body: string; href: string } | null>(null);

  sessionRef.current = session;
  sheetVisibleRef.current = sheetVisible;
  if (session?.access_token) accessTokenRef.current = session.access_token;

  const refreshStatus = useCallback(async () => {
    const status = await getPushPermissionStatus();
    setOsStatus(status);
    return status;
  }, []);

  const openPayload = useCallback((data: unknown) => {
    const payload = parseCrewPushPayload(data);
    if (!payload) return;
    pendingHref.current = crewPushHref(payload);
  }, []);

  const flushPendingHref = useCallback(() => {
    if (!sessionRef.current || !pendingHref.current) return;
    const href = pendingHref.current;
    pendingHref.current = null;
    router.push(href);
  }, [router]);

  const lockPrompt = useCallback(() => {
    if (!canStartPrompt({
      promptLocked: promptLocked.current,
      sheetVisible: sheetVisibleRef.current,
    })) {
      return false;
    }
    promptLocked.current = true;
    return true;
  }, []);

  const unlockPrompt = useCallback(() => {
    promptLocked.current = false;
  }, []);

  const showPreprompt = useCallback(async (force: boolean) => {
    if (force) promptLocked.current = true;
    else if (!lockPrompt()) return;

    const generation = generationRef.current;
    const userId = sessionRef.current?.user.id ?? null;
    let presented = false;
    try {
      const status = await refreshStatus();
      if (isStaleGeneration(generationRef.current, generation)) return;
      if ((sessionRef.current?.user.id ?? null) !== userId) return;
      if (!aliveRef.current) return;
      const action = nextPushHandoffAction(status);
      if (action === "syncToken") {
        void syncPushTokenForSession();
        return;
      }
      if (action === "openSettings") {
        if (force && aliveRef.current) await Linking.openSettings();
        return;
      }
      if (!force && await wasPushPrepromptDismissed(userId)) return;
      if (isStaleGeneration(generationRef.current, generation)) return;
      if ((sessionRef.current?.user.id ?? null) !== userId) return;
      if (!aliveRef.current) return;
      setForcePrompt(force);
      setSheetVisible(true);
      presented = true;
    } finally {
      if (!presented) unlockPrompt();
    }
  }, [lockPrompt, refreshStatus, unlockPrompt]);

  const dismissSheet = useCallback(() => {
    setSheetVisible(false);
    unlockPrompt();
    if (!forcePrompt) {
      void markPushPrepromptDismissed(sessionRef.current?.user.id ?? null);
    }
  }, [forcePrompt, unlockPrompt]);

  const allowNotifications = useCallback(async () => {
    setPending(true);
    const generation = generationRef.current;
    const userId = sessionRef.current?.user.id ?? null;
    try {
      if (!mayRequestOsPermission({
        explicitPrimary: true,
        platform: overlayPlatform(),
      })) {
        setSheetVisible(false);
        unlockPrompt();
        return;
      }
      const status = await requestPushPermission();
      setOsStatus(status);
      setSheetVisible(false);
      unlockPrompt();
      if (isStaleGeneration(generationRef.current, generation)) return;
      if ((sessionRef.current?.user.id ?? null) !== userId) return;
      if (status === "granted") await syncPushTokenForSession();
      else if (!forcePrompt) {
        await markPushPrepromptDismissed(userId);
      }
    } finally {
      setPending(false);
    }
  }, [forcePrompt, unlockPrompt]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => subscribeOverlayCount(() => {
    setOverlayTick((current) => current + 1);
  }), []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (!shouldRefreshPermissionOnAppState(next)) return;
      void (async () => {
        const status = await refreshStatus();
        if (status === "granted") void syncPushTokenForSession();
      })();
    });
    return () => subscription.remove();
  }, [refreshStatus]);

  useEffect(() => {
    if (!ready) return;
    const nextUserId = session?.user.id ?? null;
    if (userIdRef.current !== nextUserId) {
      generationRef.current += 1;
      userIdRef.current = nextUserId;
      setSheetVisible(false);
      setForcePrompt(false);
      unlockPrompt();
    }
    if (session) {
      void syncPushTokenForSession();
      flushPendingHref();
    } else {
      const accessToken = accessTokenRef.current;
      accessTokenRef.current = null;
      void removePushTokenForSession(accessToken);
    }
  }, [flushPendingHref, ready, session, unlockPrompt]);

  useEffect(() => {
    if (!ready || !session) return;
    const generation = generationRef.current;
    const userId = session.user.id;
    const accessToken = session.access_token;

    void (async () => {
      const status = await refreshStatus();
      if (isStaleGeneration(generationRef.current, generation)) return;
      const dismissed = await wasPushPrepromptDismissed(userId);
      if (isStaleGeneration(generationRef.current, generation)) return;
      const membership = await fetchHasCrewMembership(accessToken);
      if (isStaleGeneration(generationRef.current, generation)) return;
      if ((sessionRef.current?.user.id ?? null) !== userId) return;
      if (!aliveRef.current) return;
      if (!shouldLaunchExistingMemberPrompt({
        dismissed,
        generation: generationRef.current,
        membership,
        overlayCount: overlayCount(),
        osStatus: status,
        pathname,
        platform: overlayPlatform(),
        promptLocked: promptLocked.current,
        responseGeneration: generation,
        sessionUserId: userId,
        sheetVisible: sheetVisibleRef.current,
      })) {
        return;
      }
      await showPreprompt(false);
    })();
  }, [overlayTick, pathname, ready, refreshStatus, session, showPreprompt]);

  useEffect(() => {
    if (Platform.OS === "web") return undefined;
    let active = true;
    let subscription: { remove: () => void } | undefined;

    void (async () => {
      const Notifications = await import("expo-notifications");
      Notifications.setNotificationHandler({
        handleNotification: () => Promise.resolve({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      if (!active) return;

      Notifications.addNotificationReceivedListener((notification) => {
        const payload = parseCrewPushPayload(notification.request.content.data);
        if (!payload) return;
        const title = notification.request.content.title?.trim()
          || notification.request.content.body?.trim()
          || "";
        const body = notification.request.content.body?.trim() || title;
        setBanner({
          title: title || body,
          body,
          href: crewPushHref(payload),
        });
      });
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const identifier = response.notification.request.identifier;
        if (handledResponse.current === identifier) return;
        handledResponse.current = identifier;
        openPayload(response.notification.request.content.data);
        flushPendingHref();
      });

      const last = await Notifications.getLastNotificationResponseAsync();
      if (!active || !last) return;
      const identifier = last.notification.request.identifier;
      if (handledResponse.current === identifier) return;
      handledResponse.current = identifier;
      openPayload(last.notification.request.content.data);
      flushPendingHref();
      await Notifications.clearLastNotificationResponseAsync();
    })();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [flushPendingHref, openPayload]);

  useEffect(() => registerPushHost({
    promptAfterJoin: () => {
      void showPreprompt(false);
    },
    promptFromSettings: () => {
      void showPreprompt(true);
    },
  }), [showPreprompt]);

  return (
    <PushPermissionContext.Provider
      value={{ osStatus, promptFromSettings: () => void showPreprompt(true) }}
    >
      {children}
      {banner ? (
        <InAppPostBanner
          body={banner.body}
          onDismiss={() => setBanner(null)}
          onOpen={() => {
            const href = banner.href;
            setBanner(null);
            router.push(href);
          }}
          title={banner.title}
        />
      ) : null}
      <PushPermissionSheet
        onAllow={() => void allowNotifications()}
        onDismiss={dismissSheet}
        pending={pending}
        visible={sheetVisible}
      />
    </PushPermissionContext.Provider>
  );
}

function InAppPostBanner({
  body,
  onDismiss,
  onOpen,
  title,
}: {
  body: string;
  onDismiss: () => void;
  onOpen: () => void;
  title: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[bannerStyles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={bannerStyles.card}>
        <Text numberOfLines={1} style={bannerStyles.title}>{title}</Text>
        <Text numberOfLines={2} style={bannerStyles.body}>{body}</Text>
      </Pressable>
      <Pressable accessibilityLabel="Dismiss alert" onPress={onDismiss} style={bannerStyles.dismiss} />
    </View>
  );
}

const bannerStyles = StyleSheet.create({
  wrap: { left: spacing.lg, position: "absolute", right: spacing.lg, zIndex: 50 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  title: { color: colors.ink, ...type.body, fontFamily: fonts.bold },
  body: { color: colors.muted, marginTop: spacing.xs, ...type.bodySmall },
  dismiss: { height: spacing.sm },
});
