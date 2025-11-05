export default function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs text-[color:var(--sf-text)]/70">
      <span>{label}</span>
      <span className="font-medium text-[color:var(--sf-text)]">{value}</span>
    </div>
  );
}


