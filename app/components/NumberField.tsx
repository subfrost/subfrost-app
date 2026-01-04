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
      className={`h-11 w-full rounded-lg border-0 bg-transparent px-0 ${alignClass} text-2xl font-bold text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/20 disabled:opacity-60 focus:outline-none transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none`}
    />
  );
}


