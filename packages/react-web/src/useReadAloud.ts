import type { IReadAloudSnapshot as ISharedSnapshot, ReadAloudId } from "@saystack/react";
import { useMemo, useSyncExternalStore } from "react";

import { useReadAloudStore } from "./useReadAloudStore.js";

export type IReadAloudSnapshot = ISharedSnapshot<Element>;

export interface IReadAloud extends IReadAloudSnapshot {
  readLevels: () => ArrayLike<number> | undefined;
  speak: (id: ReadAloudId, markdown: string) => void;
}

export function useReadAloud(): IReadAloud {
  const store = useReadAloudStore();
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return useMemo(() => ({ ...snapshot, readLevels: store.readLevels, speak: store.speak }), [snapshot, store]);
}
