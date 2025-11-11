import CustomSelect from './CustomSelect';

type Option = { value: string; label: string; symbol?: string };

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
  // Extract symbol from options - clean up label to get just the symbol
  const enhancedOptions = options.map(opt => {
    // Try to extract symbol from label if it contains brackets like "Bitcoin [btc]"
    const symbolMatch = opt.label.match(/\[([^\]]+)\]$/);
    const symbol = symbolMatch ? symbolMatch[1] : opt.value;
    
    return {
      ...opt,
      symbol,
    };
  });

  return (
    <CustomSelect
      value={value}
      options={enhancedOptions}
      onChange={onChange}
      showTokenIcon={true}
      className="w-full"
    />
  );
}


