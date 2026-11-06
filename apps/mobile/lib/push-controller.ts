type PushHost = {
  promptAfterJoin: () => void;
  promptFromSettings: () => void;
};

let host: PushHost | null = null;

export function registerPushHost(next: PushHost) {
  host = next;
  return () => {
    if (host === next) host = null;
  };
}

/** After the user joins or creates a crew. No-ops if they already dismissed. */
export function promptAfterJoiningCrew() {
  host?.promptAfterJoin();
}

/** Crew Notifications settings can ask again. */
export function promptPushFromSettings() {
  host?.promptFromSettings();
}
