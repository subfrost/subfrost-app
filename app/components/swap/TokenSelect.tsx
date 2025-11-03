'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlkaneImage } from './AlkaneImage';

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
  onOpenChange,
}: {
  value: string | null;
  options: TokenOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <Select value={value ?? ''} onValueChange={onChange} onOpenChange={onOpenChange}>
      <SelectTrigger className={className}>
        {selected ? (
          <div className="flex items-center gap-2">
            <AlkaneImage id={selected.id} name={selected.name} size="sm" />
            <span>{selected.symbol ? `${selected.symbol} • ${selected.name}` : selected.name}</span>
          </div>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.id} value={opt.id}>
            <div className="flex items-center gap-2">
              <AlkaneImage id={opt.id} name={opt.name} size="sm" />
              <span>{opt.symbol ? `${opt.symbol} • ${opt.name}` : opt.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


