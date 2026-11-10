export function goalsSectionLayout(activeCount: number, historyCount: number, cap: number) {
  return {
    atCap: activeCount >= cap,
    hasHistory: historyCount > 0,
    showHistory: historyCount > 0,
  };
}
