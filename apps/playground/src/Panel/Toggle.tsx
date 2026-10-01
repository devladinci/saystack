import type { ChangeEvent } from "react";

interface IProps {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}

export function Toggle({ label, isOn, onChange }: IProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.checked);
  };

  return (
    <label className="p-switch">
      <span>{label}</span>
      <input type="checkbox" checked={isOn} onChange={handleChange} />
      <span className="p-knob" aria-hidden="true" />
    </label>
  );
}
