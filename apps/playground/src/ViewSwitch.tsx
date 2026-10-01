import type { View } from "./settings.js";

interface IProps {
  view: View;
  onChange: (view: View) => void;
}

interface IChoiceProps {
  value: View;
  label: string;
  isSelected: boolean;
  onChange: (view: View) => void;
}

const VIEWS: readonly { value: View; label: string }[] = [
  { value: "desktop", label: "Desktop" },
  { value: "mobile", label: "Mobile" },
];

function Choice({ value, label, isSelected, onChange }: IChoiceProps) {
  const handleClick = (): void => {
    onChange(value);
  };

  return (
    <button type="button" aria-pressed={isSelected} onClick={handleClick}>
      {label}
    </button>
  );
}

export function ViewSwitch({ view, onChange }: IProps) {
  return (
    <div className="seg view-switch" role="group" aria-label="View">
      {VIEWS.map(({ value, label }) => (
        <Choice key={value} value={value} label={label} isSelected={view === value} onChange={onChange} />
      ))}
    </div>
  );
}
