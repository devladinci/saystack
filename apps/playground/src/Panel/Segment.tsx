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

interface IChoiceProps<T> {
  option: IOption<T>;
  isSelected: boolean;
  onChange: (value: T) => void;
}

function Choice<T>({ option, isSelected, onChange }: IChoiceProps<T>) {
  const handleClick = (): void => {
    onChange(option.value);
  };

  return (
    <button type="button" aria-pressed={isSelected} onClick={handleClick}>
      {option.label}
    </button>
  );
}

export function Segment<T extends string | number>({ label, value, options, onChange }: IProps<T>) {
  return (
    <div className="p-row">
      <span className="p-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map((option) => (
          <Choice key={option.value} option={option} isSelected={option.value === value} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}
