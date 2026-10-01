import type { AuraPaletteName } from "@saystack/core";
import { bandEdges, bandPalette } from "@saystack/core";
import { useEffect, useMemo, useRef } from "react";

interface IProps {
  bands: number;
  palette: AuraPaletteName;
  status: string;
  readLevels: () => ArrayLike<number> | undefined;
}

interface IMeter {
  id: string;
  hz: string;
}

const REST = 0.04;

const formatHz = (hz: number): string => (hz < 1000 ? String(Math.round(hz)) : `${(hz / 1000).toFixed(1)}k`);

export function LiveBands({ bands, palette, status, readLevels }: IProps) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const readRef = useRef(readLevels);
  const colors = useMemo(() => bandPalette(palette, bands), [palette, bands]);
  const meters = useMemo((): IMeter[] => {
    const edges = bandEdges(bands);

    return edges.slice(0, -1).map((low, index) => ({
      id: `${bands}:${index}`,
      hz: formatHz(Math.sqrt(low * (edges[index + 1] ?? low))),
    }));
  }, [bands]);

  useEffect(() => {
    readRef.current = readLevels;
  });

  useEffect(() => {
    barsRef.current.forEach((bar, index) => {
      bar?.style.setProperty("--c-dark", colors.css[index] ?? "");
      bar?.style.setProperty("--c-light", colors.cssLight[index] ?? "");
    });
  }, [colors]);

  useEffect(() => {
    let frame = 0;

    const draw = (): void => {
      const levels = readRef.current();

      barsRef.current.forEach((bar, index) => {
        const level = Math.min(1, Math.max(REST, levels?.[index] ?? 0));
        bar?.style.setProperty("transform", `scaleY(${level})`);
      });
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <section className="p-section">
      <div className="p-title-row">
        <h2 className="p-title">Live bands</h2>
        <span className="meter-label">{status}</span>
      </div>
      <div className="meters">
        {meters.map((meter, index) => (
          <div key={meter.id} className="meter">
            <div className="meter-track">
              <span
                ref={(bar) => {
                  barsRef.current[index] = bar;
                }}
                className="meter-bar"
              />
            </div>
            <span className="meter-hz">{meter.hz}</span>
          </div>
        ))}
      </div>
      <p className="p-note">
        The centre of each band in Hz. Each band is scaled against its own noise floor, so the quiet high bands move as
        much as the loud low ones.
      </p>
    </section>
  );
}
