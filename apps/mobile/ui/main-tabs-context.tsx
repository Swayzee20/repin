import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type MainTabsContextValue = {
  openWorkoutChooser: () => void;
  selectedGroupId: string | null;
  setSelectedGroupId: (groupId: string | null) => void;
  setWorkoutChooserVisible: (visible: boolean) => void;
  workoutChooserVisible: boolean;
};

const MainTabsContext = createContext<MainTabsContextValue | null>(null);

export function MainTabsProvider({ children }: { children: ReactNode }) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [workoutChooserVisible, setWorkoutChooserVisible] = useState(false);
  const value = useMemo(
    () => ({
      openWorkoutChooser: () => setWorkoutChooserVisible(true),
      selectedGroupId,
      setSelectedGroupId,
      setWorkoutChooserVisible,
      workoutChooserVisible,
    }),
    [selectedGroupId, workoutChooserVisible],
  );

  return <MainTabsContext.Provider value={value}>{children}</MainTabsContext.Provider>;
}

export function useMainTabs() {
  const context = useContext(MainTabsContext);
  if (!context) throw new Error("useMainTabs must be used within MainTabsProvider");
  return context;
}
