import type { IReadAloudStore } from "@saystack/react";
import { useContext } from "react";

import { ReadAloudContext } from "./readAloudContext.js";

export function useReadAloudStore(): IReadAloudStore<Element> {
  const store = useContext(ReadAloudContext);

  if (store === null) {
    throw new Error("saystack: read-aloud hooks need a <ReadAloudProvider> above them");
  }

  return store;
}
