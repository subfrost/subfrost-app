"use client";

import { Card, CardContent } from "@/components/ui/card";
import { FaBitcoin, FaSnowflake } from "react-icons/fa";
import { RiExchangeDollarFill, RiCoinsFill } from "react-icons/ri";
import { BitcoinFeeWidget } from "./BitcoinFeeWidget";
import { useBalances } from "../contexts/BalancesContext";
import { lasereyesMiddleware } from "../middleware";
import { provider } from "../contexts/regtest";
import { useLaserEyes } from "@omnisat/lasereyes";
import { useEffect } from "react";
import { ethers } from "ethers";
import { mapValues } from "lodash";
import { getUTXOS } from "../contexts/provider_util";

export function UserBalances() {
  // Mock data - replace with actual user balances
  const { setBalances, balances, formattedBalances } = useBalances();
  const { address } = lasereyesMiddleware(useLaserEyes());
  useEffect(() => {
    (async () => {
      if (address !== "") {
        const spendables = await provider.getUTXOS(address);
        const btc = Number(
          spendables.reduce((r, v) => r + BigInt(v.output.value), 0n)
        );
        const frost = Number(0n);
        const dxFROST = Number(0n);
        const frBTC = Number(0n);
        const frBTCFROST = Number(0n);
        setBalances(
          mapValues(
            {
              btc,
              frost,
              dxFROST,
              frBTC,
              frBTCFROST,
            },
            (v) => ethers.formatUnits(v, 8)
          )
        );
      }
    })().catch((err) => console.error(err));
  }, [address]);

  return (
    <Card className="frost-bg frost-border mb-4 mx-auto max-w-4xl">
      <CardContent className="flex flex-wrap justify-center items-center gap-4 p-4">
        <BalanceItem icon={FaBitcoin} label="BTC" amount={formattedBalances.btc} />
        <BalanceItem
          icon={RiExchangeDollarFill}
          label="frBTC"
          amount={formattedBalances.frBTC}
        />
        <BalanceItem
          icon={RiCoinsFill}
          label="dxFROST"
          amount={formattedBalances.dxFROST}
        />
        <BalanceItem icon={FaSnowflake} label="dxFROST" amount={formattedBalances.frost} />
        <BitcoinFeeWidget />
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
  label: string;
  amount: string | number;
}) {
  return (
    <div className="flex items-center bg-blue-800 bg-opacity-20 rounded-lg px-4 py-2 h-10">
      <Icon className="text-blue-500 text-xl mr-2" />
      <div className="flex items-center space-x-1">
        <span className="retro-text text-xs">{label}:</span>
        <span className="font-bold retro-text text-sm">{amount}</span>
      </div>
    </div>
  );
}
