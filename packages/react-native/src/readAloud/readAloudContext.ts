import type { IReadAloudStore } from "@saystack/react";
import { createContext } from "react";

import type { IMeasurable } from "../measure.js";

export const ReadAloudContext = createContext<IReadAloudStore<IMeasurable> | null>(null);
