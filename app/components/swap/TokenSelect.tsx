'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type TokenOption = {
  id: string;
  name: string;
  symbol?: string;
};

export function TokenSelect({
  value,
  options,
  onChange,
  placeholder = 'Select token',
  className,
}: {
  value: string | null;
  options: TokenOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id}>
            {opt.symbol ? `${opt.symbol} • ${opt.name}` : opt.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


