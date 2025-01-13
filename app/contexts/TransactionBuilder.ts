import { SandshrewProvider } from "./sandshrew-provider";
import { REGTEST_PARAMS } from "./regtest";
import { getLogger } from "./logger";
import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";
import { Signer } from "@scure/btc-signer/transaction";

const logger = getLogger("alkanes:transaction");

export function max(a: bigint, b: bigint): bigint {
  if (b > a) return b;
  return a;
}

export class TransactionBuilder {
  public address: string;
  public fee: bigint;
  public change: bigint;
  public provider: SandshrewProvider;
  public transaction: btc.Transaction;
  public signer?: Signer;
  constructor() {
    this.provider = new SandshrewProvider("http://localhost:18888");
    this.transaction = new btc.Transaction({
      allowLegacyWitnessUtxo: true,
      allowUnknownOutputs: true,
    });
    this.address = "";
    this.fee = BigInt(0);
    this.change = BigInt(0);
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
    const spendables = await this.provider.getBTCOnlyUTXOs(this.address);
    for (const spendable of spendables) {
      logger.info("adding spendable to transaction:");
      logger.info(spendable);
      this.addInput({
        txid: hex.encode(Buffer.from(Array.from(Buffer.from(spendable.outpoint.txid, 'hex')).reverse())),
        index: Number(spendable.outpoint.vout),
        sighashType: btc.SigHash.ALL,
        witnessUtxo: {
          script: hex.decode(spendable.output.script),
          amount: BigInt(spendable.output.value),
        },
      });
      /*
      this.transaction.addInput({
        txid: spendable.outpoint.txid,
        witnessUtxo: spendable.output as any,
        index: spendable.outpoint.vout,
        sighashType: btc.SigHash.ALL,
      });
*/
      this.fee += BigInt(spendable.output.value);
      if (this.fee >= sats) {
        this.change = this.fee - BigInt(sats);
        break;
      }
    }
    return this;
  }
  finalize(): TransactionBuilder {
    this.transaction.addOutputAddress(
      this.address,
      this.change,
      REGTEST_PARAMS,
    );
    return this;
  }
  sign(privKey: Uint8Array): TransactionBuilder {
    this.transaction.sign(privKey, [btc.SigHash.ALL], new Uint8Array(0x20));
    this.transaction.finalize();
    return this;
  }
  extract(): string {
    return hex.encode(this.transaction.extract());
  }
  addOutput(v: any): TransactionBuilder {
    this.fee = max(0n, BigInt(this.fee) - BigInt(v.amount));
    this.change = max(0n, BigInt(this.change) - BigInt(v.amount));
    this.transaction.addOutput(v);
    return this;
  }
  addInput(v: any): TransactionBuilder {
    this.transaction.addInput(v);
    return this;
  }
}
