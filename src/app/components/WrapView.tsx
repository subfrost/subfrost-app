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
import { BitcoinFeeWidget } from "@/app/components/BitcoinFeeWidget";
import { WrapConfirmationModal } from "@/app/components/WrapConfirmationModal";
import { useBalances } from "@/context/BalancesContext";
import { getLogger } from "@/lib/logger";
import { setupEnvironment } from "@/context/regtest";
import { FrBTC } from "@/app/components/TokenNames";

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
    <>
      <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center justify-center text-center text-lg md:text-xl h-20 relative z-10">
            <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
            <div className="flex flex-col">
              <div className="flex items-center justify-center w-full whitespace-nowrap">
                <span className="text-2xl md:text-4xl font-bold white-outline-text">Wrap BTC</span>
              </div>
              <div className="mt-0.5 font-bold flex items-center justify-center whitespace-nowrap">
                <span className="text-2xl md:text-4xl font-bold white-outline-text">to <FrBTC /></span>
              </div>
            </div>
            <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
          </CardTitle>
          <CardDescription className="readable-text text-sm">
            Enter the amount of BTC you want to wrap.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-grow">
          <div className="mb-4">
            <label
              htmlFor="btc-amount"
              className="readable-text text-sm text-blue-600 block mb-1 relative z-10"
            >
              <span className="white-outline-text">Amount of BTC</span>
            </label>
            <Input
              id="btc-amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
            />
            <p className="readable-text text-xs mt-1">
              Available: {btcBalance} BTC
            </p>
          </div>
          <div>
            <div className="flex items-center mb-2">
              <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>Bitcoin Network Fee: </span><BitcoinFeeWidget noBackground={true} textColor="text-blue-600" /></p>
            </div>
            <div className="flex items-center mb-2">
              <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>SUBFROST Fee: 0.1%</span></p>
            </div>
            <p className="readable-text text-sm text-blue-600 relative z-10">
              <span>Expected <FrBTC />: {calculateExpectedFrBTC()}</span>
            </p>
          </div>
        </CardContent>
        <CardFooter className="mt-auto">
          <Button
            onClick={handleWrap}
            className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size relative z-10"
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
    </>
  );
}
