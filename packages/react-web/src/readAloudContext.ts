import type { IReadAloudStore } from "@saystack/react";
import { createContext } from "react";

export const ReadAloudContext = createContext<IReadAloudStore<Element> | null>(null);
