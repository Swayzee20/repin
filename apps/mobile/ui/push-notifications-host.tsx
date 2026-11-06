import { crewPushHref, parseCrewPushPayload } from "@repin/validation";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Linking, Platform } from "react-native";

import { registerPushHost } from "../lib/push-controller";
import {
  getPushPermissionStatus,
  removePushTokenForSession,
  requestPushPermission,
  syncPushTokenForSession,
} from "../lib/push-notifications";
import {
  markPushPrepromptDismissed,
  wasPushPrepromptDismissed,
} from "../lib/push-prompt-store";
import { useAuthSession } from "../lib/use-auth-session";
import { PushPermissionSheet } from "./push-permission-sheet";

type PushPermissionValue = {
  osStatus: "undetermined" | "granted" | "denied";
  promptFromSettings: () => void;
};

const PushPermissionContext = createContext<PushPermissionValue>({
  osStatus: "undetermined",
  promptFromSettings: () => {},
});

export function usePushPermission() {
  return useContext(PushPermissionContext);
}

export function PushNotificationsHost({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const { ready, session } = useAuthSession();
  const sessionRef = useRef(session);
  const accessTokenRef = useRef<string | null>(session?.access_token ?? null);
  const handledResponse = useRef<string | null>(null);
  const pendingHref = useRef<string | null>(null);
  const [osStatus, setOsStatus] = useState<PushPermissionValue["osStatus"]>("undetermined");
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [forcePrompt, setForcePrompt] = useState(false);

  sessionRef.current = session;
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

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (!ready) return;
    if (session) {
      void syncPushTokenForSession();
      flushPendingHref();
    } else {
      const accessToken = accessTokenRef.current;
      accessTokenRef.current = null;
      void removePushTokenForSession(accessToken);
    }
  }, [flushPendingHref, ready, session]);

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

  const showPreprompt = useCallback(async (force: boolean) => {
    const status = await refreshStatus();
    if (status === "granted") {
      void syncPushTokenForSession();
      return;
    }
    if (status === "denied") {
      if (force) {
        await Linking.openSettings();
      }
      return;
    }
    if (!force && await wasPushPrepromptDismissed()) return;
    setForcePrompt(force);
    setSheetVisible(true);
  }, [refreshStatus]);

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
    if (!forcePrompt) void markPushPrepromptDismissed();
  }, [forcePrompt]);

  const allowNotifications = useCallback(async () => {
    setPending(true);
    try {
      const status = await requestPushPermission();
      setOsStatus(status);
      setSheetVisible(false);
      if (status === "granted") await syncPushTokenForSession();
      else if (!forcePrompt) await markPushPrepromptDismissed();
    } finally {
      setPending(false);
    }
  }, [forcePrompt]);

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
