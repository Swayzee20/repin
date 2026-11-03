import { useCallback, useRef, type ComponentRef } from "react";
import type { TextInput } from "react-native";

type FieldNode = ComponentRef<typeof TextInput>;

/** Keeps TextInput nodes so Return can focus the next field in a dynamic form. */
export function useInputRegistry() {
  const inputs = useRef(new Map<string, FieldNode | null>());
  const callbacks = useRef(new Map<string, (node: FieldNode | null) => void>());
  const ref = useCallback((key: string) => {
    let callback = callbacks.current.get(key);
    if (!callback) {
      callback = (node: FieldNode | null) => {
        inputs.current.set(key, node);
      };
      callbacks.current.set(key, callback);
    }
    return callback;
  }, []);
  const focus = useCallback((key: string) => {
    inputs.current.get(key)?.focus();
  }, []);
  return { focus, ref };
}
