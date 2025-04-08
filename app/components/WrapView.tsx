"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { FaSnowflake } from "react-icons/fa";
import { BitcoinFeeWidget } from "./BitcoinFeeWidget";
import { WrapConfirmationModal } from "./WrapConfirmationModal";
import { useBalances } from "../contexts/BalancesContext";
import { getLogger } from "@/lib/logger";
import { setupEnvironment } from "../contexts/regtest";
import { FrBTC } from "./TokenNames";

const logger = getLogger("subfrost:wrap");

// Only access window object in the browser
if (typeof window !== 'undefined') {
  (window as any).setupEnvironment = setupEnvironment;
}

export function WrapView() {
  const [amount, setAmount] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    balances: { btc: btcBalance },
  } = useBalances(); // This should be fetched from your state management solution

  const handleWrap = () => {
    setIsModalOpen(true);
  };

  const calculateExpectedFrBTC = () => {
    // Mock calculation - replace with actual logic
    const btcValue = parseFloat(amount) || 0;
    return (btcValue * 0.99).toFixed(8); // Assuming 1% fee
  };

  const handleConfirmWrap = () => {
    (async () => {
      setIsModalOpen(false);
      setAmount("");
    })().catch((err) => logger.error(err));
  };

  return (
    <div className="space-y-8 flex flex-col items-center">
      <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center justify-center text-center text-lg md:text-xl h-20">
            <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500" size={29} />
            <div className="flex flex-col">
              <div className="flex items-center justify-center w-full whitespace-nowrap">
                <span className="text-2xl md:text-4xl font-bold">Wrap BTC</span>
              </div>
              <div className="mt-0.5 font-bold flex items-center justify-center whitespace-nowrap">
                <span className="text-2xl md:text-4xl font-bold">to <FrBTC /></span>
              </div>
            </div>
            <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500" size={29} />
          </CardTitle>
          <CardDescription className="readable-text text-sm">
            Enter the amount of BTC you want to wrap.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow">
          <div className="mb-4">
            <label
              htmlFor="btc-amount"
              className="readable-text text-sm text-blue-600 block mb-1"
            >
              Amount of BTC
            </label>
            <Input
              id="btc-amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="readable-text text-sm"
            />
            <p className="readable-text text-xs mt-1">
              Available: {btcBalance} BTC
            </p>
          </div>
          <div>
            <div className="flex items-center mb-2">
              <p className="readable-text text-xs text-blue-600 h-5">Bitcoin Network Fee: <BitcoinFeeWidget noBackground={true} textColor="text-blue-600" /></p>
            </div>
            <div className="flex items-center mb-2">
              <p className="readable-text text-xs text-blue-600 h-5">SUBFROST Fee: 0.1%</p>
            </div>
            <p className="readable-text text-sm text-blue-600">
              Expected <FrBTC />: {calculateExpectedFrBTC()}
            </p>
          </div>
        </CardContent>
        <CardFooter className="mt-auto">
          <Button
            onClick={handleWrap}
            className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size"
          >
            Wrap BTC
          </Button>
        </CardFooter>
      </Card>
      <WrapConfirmationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          handleConfirmWrap();
        }}
        btcAmount={amount}
        expectedFrBTC={calculateExpectedFrBTC()}
      />
    </div>
  );
}
