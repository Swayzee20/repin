import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type MainTabsContextValue = {
  selectedGroupId: string | null;
  setSelectedGroupId: (groupId: string | null) => void;
};

const MainTabsContext = createContext<MainTabsContextValue | null>(null);

export function MainTabsProvider({ children }: { children: ReactNode }) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const value = useMemo(
    () => ({ selectedGroupId, setSelectedGroupId }),
    [selectedGroupId],
  );

  return <MainTabsContext.Provider value={value}>{children}</MainTabsContext.Provider>;
}

export function useMainTabs() {
  const context = useContext(MainTabsContext);
  if (!context) throw new Error("useMainTabs must be used within MainTabsProvider");
  return context;
}
