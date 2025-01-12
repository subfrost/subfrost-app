"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { FaSnowflake } from 'react-icons/fa'
import { UnwrapView } from './UnwrapView'
import { WrapConfirmationModal } from './WrapConfirmationModal'
import { useBalances } from "../contexts/BalancesContext";
import { getLogger } from "../contexts/logger";
import { REGTEST_PARAMS } from "../contexts/regtest";

const logger = getLogger("subfrost:wrap");

class TransactionBuilder {
  public address: string;
  public fee: bigint;
  public change: bigint;
  public provider: SandshrewProvider;
  constructor() {
    this.provider = new SandshrewProvider("http://localhost:18888");
    this.transaction = new btc.Transaction({
      allowLegacyWitnessUtxo: true,
      allowUnknownOutputs: true,
    });
    this.address = '';
    this.fee = 0n;
    this.change = 0n;
  }
  setProvider(provider: SandshrewProvider): TransactionBuilder {
    this.provider = provider;
    return this;
  }
  setAddress(address: string): TransactionBuilder {
    this.address = address;
    return this;
  }
  setSigner(signer: Signer): TransactionBuilder {
    this.signer = signer;
    return this;
  }
  async addBitcoin(sats: bigint) {
    const spendables = await this.getBTCOnlyUTXOs(this.address);
    for (const spendable of spendables) {
      this.transaction.addInput({
        txid: spendable.outpoint.txid,
        witnessUtxo: spendable.output,
        index: spendable.outpoint.vout,
        sighashType: btc.SigHash.ALL
      });
      this.fee += BigInt(spendable.output.value);
      if (this.fee >= sats) {
        this.change = this.fee - sats;
        break;
      }
    }
  }
  finalize(): TransactionBuilder {
    this.transaction.addOutputAddress(this.address, this.change, REGTEST_PARAMS);
    return this;
  }
  addOutput(v: any): TransactionBuilder {
    this.transaction.addOutput(v);
    return this;
  }
  addInput(v: any): TransactionBuilder {
    this.transaction.addInput(v);
    return this;
  }
}


export function WrapView() {
  const [amount, setAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { balances: { btc: btcBalance } } = useBalances(); // This should be fetched from your state management solution

  const handleWrap = () => {
    setIsModalOpen(true)
  }

  const calculateExpectedFrBTC = () => {
    // Mock calculation - replace with actual logic
    const btcValue = parseFloat(amount) || 0
    return (btcValue * 0.99).toFixed(8) // Assuming 1% fee
  }

  const handleConfirmWrap = () => {
    (async () => {
      setIsModalOpen(false)
      setAmount('')
    })().catch((err) => logger.error(err));
  }

  return (
    <div className="space-y-8">
      <Card className="frost-bg frost-border w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center">
            <FaSnowflake className="mr-2" />
            Wrap BTC to frBTC
          </CardTitle>
          <CardDescription className="readable-text text-sm">Enter the amount of BTC you want to wrap</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label htmlFor="btc-amount" className="readable-text text-sm text-blue-600 block mb-1">Amount of BTC</label>
            <Input
              id="btc-amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="readable-text text-sm"
            />
            <p className="readable-text text-xs mt-1">Available: {btcBalance} BTC</p>
          </div>
          <div>
            <p className="readable-text text-sm text-blue-600">Expected frBTC: {calculateExpectedFrBTC()}</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleWrap} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Wrap BTC
          </Button>
        </CardFooter>
      </Card>
      <UnwrapView />
      <WrapConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        btcAmount={amount}
        expectedFrBTC={calculateExpectedFrBTC()}
        onConfirm={handleConfirmWrap}
      />
    </div>
  )
}

