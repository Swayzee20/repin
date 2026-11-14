export type CrewPickerView = "loading" | "error" | "empty" | "list";

export function crewPickerViewState(input: {
  error?: string | null;
  groupCount: number;
  loading: boolean;
}): CrewPickerView {
  if (input.loading) return "loading";
  if (input.error) return "error";
  if (input.groupCount === 0) return "empty";
  return "list";
}
