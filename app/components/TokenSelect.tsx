type Option = { value: string; label: string };

export default function TokenSelect({
  value = "BTC",
  options = [
    { value: "BTC", label: "BTC" },
    { value: "tBTC", label: "tBTC" },
  ],
  onChange,
}: {
  value?: string;
  options?: Option[];
  onChange?: (value: string) => void;
}) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        className="h-10 w-full appearance-none rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)] pl-3 pr-9 text-sm font-semibold text-white shadow-sm sf-focus-ring"
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/90">
        ▾
      </span>
    </div>
  );
}


