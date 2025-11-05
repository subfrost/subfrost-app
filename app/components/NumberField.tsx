export default function NumberField({ placeholder = "0.00", disabled = false, align = "right", value, onChange }: { placeholder?: string; disabled?: boolean; align?: "left" | "right"; value?: string; onChange?: (v: string) => void }) {
  const alignClass = align === "left" ? "text-left" : "text-right";
  return (
    <input
      type="number"
      step="0.00000001"
      placeholder={placeholder}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      className={`h-10 w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 ${alignClass} text-sm text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-muted)] disabled:opacity-60 sf-focus-ring`}
    />
  );
}


