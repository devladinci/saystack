import type { IAuraRange } from "@saystack/core";
import type { ChangeEvent } from "react";
import { useId } from "react";

interface IProps {
  label: string;
  value: number;
  range: IAuraRange;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

export function Range({ label, value, range, format, onChange }: IProps) {
  const id = useId();

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(Number(event.target.value));
  };

  return (
    <div className="p-row p-range">
      <label className="p-label" htmlFor={id}>
        {label}
      </label>
      <span className="p-value">{format(value)}</span>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={handleChange}
      />
    </div>
  );
}
