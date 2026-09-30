import type { IReadAloudSnapshot, ReadAloudId } from "@saystack/react";
import { useMemo, useSyncExternalStore } from "react";

import type { IMeasurable } from "../measure.js";
import { useReadAloudStore } from "./useReadAloudStore.js";

export interface IReadAloud extends IReadAloudSnapshot<IMeasurable> {
  readLevels: () => ArrayLike<number> | undefined;
  speak: (id: ReadAloudId, markdown: string) => void;
}

export function useReadAloud(): IReadAloud {
  const store = useReadAloudStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return useMemo(() => ({ ...snapshot, readLevels: store.readLevels, speak: store.speak }), [snapshot, store]);
}
