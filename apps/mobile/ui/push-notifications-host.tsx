import { crewPushHref, parseCrewPushPayload } from "@repin/validation";
import { usePathname, useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Linking, Platform } from "react-native";

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
  const [osStatus, setOsStatus] = useState<PushOsStatus>("undetermined");
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [forcePrompt, setForcePrompt] = useState(false);
  const [overlayTick, setOverlayTick] = useState(0);

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

    let presented = false;
    try {
      const status = await refreshStatus();
      const action = nextPushHandoffAction(status);
      if (action === "syncToken") {
        void syncPushTokenForSession();
        return;
      }
      if (action === "openSettings") {
        if (force) await Linking.openSettings();
        return;
      }
      const userId = sessionRef.current?.user.id ?? null;
      if (!force && await wasPushPrepromptDismissed(userId)) return;
      setForcePrompt(force);
      setSheetVisible(true);
      presented = true;
    } finally {
      if (!presented) unlockPrompt();
    }
  }, [lockPrompt, refreshStatus, unlockPrompt]);

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

  const dismissSheet = useCallback(() => {
    setSheetVisible(false);
    unlockPrompt();
    if (!forcePrompt) {
      void markPushPrepromptDismissed(sessionRef.current?.user.id ?? null);
    }
  }, [forcePrompt, unlockPrompt]);

  const allowNotifications = useCallback(async () => {
    setPending(true);
    try {
      const status = await requestPushPermission();
      setOsStatus(status);
      setSheetVisible(false);
      unlockPrompt();
      if (status === "granted") await syncPushTokenForSession();
      else if (!forcePrompt) {
        await markPushPrepromptDismissed(sessionRef.current?.user.id ?? null);
      }
    } finally {
      setPending(false);
    }
  }, [forcePrompt, unlockPrompt]);

  return (
    <PushPermissionContext.Provider
      value={{ osStatus, promptFromSettings: () => void showPreprompt(true) }}
    >
      {children}
      <PushPermissionSheet
        onAllow={() => void allowNotifications()}
        onDismiss={dismissSheet}
        pending={pending}
        visible={sheetVisible}
      />
    </PushPermissionContext.Provider>
  );
}
