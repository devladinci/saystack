import type { IAuraStyle } from "@saystack/core";
import type { ISpectrumLine, SpectrumLineState } from "@saystack/web";
import { createSpectrumLine } from "@saystack/web";
import { useEffect, useRef } from "react";

interface IProps {
  state: SpectrumLineState;
  levels?: (() => ArrayLike<number> | undefined) | undefined;
  style?: Partial<IAuraStyle> | undefined;
  className?: string | undefined;
}

export function SpectrumLine({ state, levels, style, className }: IProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lineRef = useRef<ISpectrumLine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas === null) {
      return;
    }

    const line = createSpectrumLine(canvas);
    lineRef.current = line;

    return () => {
      line.destroy();
      lineRef.current = null;
    };
  }, []);

  useEffect(() => {
    lineRef.current?.update({
      ...(levels === undefined ? {} : { levels }),
      ...(style === undefined ? {} : { style }),
    });
  }, [levels, style]);

  useEffect(() => {
    lineRef.current?.setState(state);
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      className={className === undefined ? "saystack-spectrum" : `saystack-spectrum ${className}`}
      aria-hidden="true"
    />
  );
}
