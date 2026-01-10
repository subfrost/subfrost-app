import { forwardRef } from 'react';

type NumberFieldProps = {
  placeholder?: string;
  disabled?: boolean;
  align?: "left" | "right";
  value?: string;
  onChange?: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
};

const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ placeholder = "0.00", disabled = false, align = "right", value, onChange, onFocus, onBlur }, ref) => {
    const alignClass = align === "left" ? "text-left" : "text-right";
    return (
      <input
        ref={ref}
        type="number"
        step="0.00000001"
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{ outline: 'none', boxShadow: 'none', border: 'none' }}
        className={`h-11 w-full rounded-lg border-0 border-none border-transparent bg-transparent px-0 ${alignClass} text-2xl font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/20 disabled:opacity-60 !outline-none !ring-0 !border-none focus:!outline-none focus:!ring-0 focus:!border-none focus-visible:!outline-none focus-visible:!ring-0 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]`}
      />
    );
  }
);

NumberField.displayName = 'NumberField';

export default NumberField;
