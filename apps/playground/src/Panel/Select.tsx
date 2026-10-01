import type { ChangeEvent } from "react";
import { useId } from "react";

interface IOption<T> {
  value: T;
  label: string;
}

interface IProps<T> {
  label: string;
  value: T;
  options: readonly IOption<T>[];
  onChange: (value: T) => void;
}

export function Select<T extends string>({ label, value, options, onChange }: IProps<T>) {
  const id = useId();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next = options.find((option) => option.value === event.target.value);

    if (next !== undefined) {
      onChange(next.value);
    }
  };

  return (
    <div className="p-row">
      <label className="p-label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="p-select" value={value} onChange={handleChange}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
