"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FaBitcoin, FaSnowflake } from "react-icons/fa";
import { RiExchangeDollarFill, RiCoinsFill } from "react-icons/ri";
import { useBtcBalance } from "../hooks/useBtcBalance";
import { FrBTC, DxBTC, DxFROST } from "./TokenNames";

export function UserBalances() {
  const { data: btcBalance } = useBtcBalance();
  const formattedBalances = {
    btc: ((btcBalance ?? 0) / 1e8).toFixed(8),
    frBTC: (0).toFixed(8),
    dxFROST: (0).toFixed(8),
    frost: (0).toFixed(8),
    frBTCFROST: (0).toFixed(8)
  };

  return (
    <Card className="frost-bg frost-border mb-2 mx-auto max-w-4xl">
      <CardContent className="flex flex-col justify-center items-center gap-2 p-2">
        <div className="flex flex-wrap justify-center items-center gap-2">
          <BalanceItem icon={FaBitcoin} label="BTC" amount={formattedBalances.btc} />
          <BalanceItem
            icon={RiExchangeDollarFill}
            label={<FrBTC />}
            amount={formattedBalances.frBTC}
          />
          <BalanceItem
            icon={RiCoinsFill}
            label={<DxBTC />}
            amount={formattedBalances.dxFROST}
          />
        </div>
        <div className="flex flex-wrap justify-center items-center gap-2">
          <BalanceItem icon={FaSnowflake} label="FROST" amount={formattedBalances.frost} />
          <BalanceItem
            icon={RiCoinsFill}
            label={<DxFROST />}
            amount={formattedBalances.dxFROST}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function BalanceItem({
  icon: Icon,
  label,
  amount,
}: {
  icon: React.ElementType;
  label: string | React.ReactNode;
  amount: string | number;
}) {
  return (
    <div className="flex items-center bg-blue-800 bg-opacity-20 rounded-lg px-2 py-1 h-8">
      <Icon className="text-blue-500 text-sm mr-1" />
      <div className="flex items-center space-x-1">
        <span className="retro-text text-[10px]">{typeof label === 'string' ? label : label}:</span>
        <span className="font-bold retro-text text-[10px]">{amount}</span>
      </div>
    </div>
  );
}
