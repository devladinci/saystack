import type { AuraState, IAura, IAuraOptions } from "@saystack/web";
import { createAura } from "@saystack/web";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

export type AuraAnchor = RefObject<Element | null> | Element | null;

export interface IUseAuraOptions extends Omit<IAuraOptions, "anchor"> {
  state: AuraState;
}

const resolveAnchor = (anchor: AuraAnchor): Element | null =>
  anchor !== null && "current" in anchor ? anchor.current : anchor;

export function useAura(anchor: AuraAnchor, { state, ...options }: IUseAuraOptions): void {
  const auraRef = useRef<IAura | null>(null);

  useEffect(() => {
    const aura = createAura();
    auraRef.current = aura;

    return () => {
      aura.destroy();
      auraRef.current = null;
    };
  }, []);

  useEffect(() => {
    auraRef.current?.update(options);
  });

  useEffect(() => {
    auraRef.current?.setAnchor(resolveAnchor(anchor));
  });

  useEffect(() => {
    auraRef.current?.setState(state);
  }, [state]);
}
