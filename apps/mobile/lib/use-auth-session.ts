import type { Session } from "@supabase/supabase-js";
import { useEffect, useRef, useState } from "react";

import { clearWorkoutDetailCaches } from "./workout-detail-cache";
import { supabase } from "./supabase";

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const timeout = setTimeout(() => {
      if (active) setReady(true);
    }, 4_000);
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      userId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setReady(true);
    }).catch(() => {
      if (active) setReady(true);
    }).finally(() => clearTimeout(timeout));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (userId.current && userId.current !== nextUserId) {
        clearWorkoutDetailCaches();
      }
      userId.current = nextUserId;
      setSession(nextSession);
      setReady(true);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { ready, session };
}
