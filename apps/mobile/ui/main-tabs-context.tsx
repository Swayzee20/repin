import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type WorkoutChooserClose = () => void;

type MainTabsContextValue = {
  openWorkoutChooser: () => void;
  registerWorkoutChooserClose: (close: WorkoutChooserClose | null) => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (groupId: string | null) => void;
  setWorkoutChooserVisible: (visible: boolean) => void;
  toggleWorkoutChooser: () => void;
  workoutChooserVisible: boolean;
};

const MainTabsContext = createContext<MainTabsContextValue | null>(null);

export function MainTabsProvider({ children }: { children: ReactNode }) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [workoutChooserVisible, setWorkoutChooserVisible] = useState(false);
  const closeWorkoutChooserRef = useRef<WorkoutChooserClose | null>(null);
  const registerWorkoutChooserClose = useCallback((close: WorkoutChooserClose | null) => {
    closeWorkoutChooserRef.current = close;
  }, []);
  const toggleWorkoutChooser = useCallback(() => {
    if (!workoutChooserVisible) {
      setWorkoutChooserVisible(true);
      return;
    }
    const close = closeWorkoutChooserRef.current;
    if (close) close();
    else setWorkoutChooserVisible(false);
  }, [workoutChooserVisible]);
  const value = useMemo(
    () => ({
      openWorkoutChooser: () => setWorkoutChooserVisible(true),
      registerWorkoutChooserClose,
      selectedGroupId,
      setSelectedGroupId,
      setWorkoutChooserVisible,
      toggleWorkoutChooser,
      workoutChooserVisible,
    }),
    [registerWorkoutChooserClose, selectedGroupId, toggleWorkoutChooser, workoutChooserVisible],
  );

  return <MainTabsContext.Provider value={value}>{children}</MainTabsContext.Provider>;
}

export function useMainTabs() {
  const context = useContext(MainTabsContext);
  if (!context) throw new Error("useMainTabs must be used within MainTabsProvider");
  return context;
}
