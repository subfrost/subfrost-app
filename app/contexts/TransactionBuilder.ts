import { Provider } from "@oyl/sdk";
import { REGTEST_PARAMS, DEFAULT_PROVIDER } from "./constants";
import { getLogger } from "./logger";
import * as btc from "@scure/btc-signer";
import { hex } from "@scure/base";
import { Signer } from "@scure/btc-signer/transaction";
import { Transaction } from "bitcoinjs-lib";
import { GetUTXOsResponse } from "./sandshrew-provider";
import { zipObject } from "lodash";

const logger = getLogger("alkanes:transaction");

export function max(a: bigint, b: bigint): bigint {
  if (b > a) return b;
  return a;
}

export class TransactionBuilder {
  public address: string;
  public fee: bigint;
  public change: bigint;
  public provider: Provider;
  public transaction: btc.Transaction;
  public signer?: Signer;
  constructor(customScripts: any) {
    this.provider = DEFAULT_PROVIDER["alkanes"];
    this.transaction = new btc.Transaction({
      allowLegacyWitnessUtxo: true,
      allowUnknownOutputs: true,
      customScripts,
    });
    this.address = "";
    this.fee = BigInt(0);
    this.change = BigInt(0);
  }
  setProvider(provider: Provider): TransactionBuilder {
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
  async call(method: string, params: any[]): Promise<any> {
    return await this.provider.sandshrew._call(method, params);
  }
  async spendables(address: string): Promise<GetUTXOsResponse> {
    const utxos = (
      await this.call("alkanes_spendablesbyaddress", [
        { address, protocolTag: "1" },
      ])
    ).outpoints;
    const { inscriptions } = await this.call("ord_address", [address]);
    const map = zipObject(inscriptions, inscriptions);
    return utxos.filter(
      (v: any) =>
        !map[`${v.outpoint.txid}:${v.outpoint.vout}`] && v.runes.length === 0
    );
  }
  async addBitcoin(sats: bigint) {
    const spendables = await this.spendables(this.address);
    for (const spendable of spendables) {
      logger.info("adding spendable to transaction:");
      logger.info(spendable);
      const spendableTxid = Buffer.from(
        Array.from(Buffer.from(spendable.outpoint.txid, "hex")).reverse()
      ).toString("hex");
      console.log(spendable.outpoint.vout);
      const coinbaseTransaction = btc.Transaction.fromRaw(
        Buffer.from(
          await this.call("getrawtransaction", [spendableTxid]),
          "hex"
        ),
        { allowUnknownOutputs: true }
      );
      logger.info("coinbase");
      logger.info(coinbaseTransaction);
      this.addInput({
        txid: coinbaseTransaction.id,
        index: Number(spendable.outpoint.vout),
        sighashType: btc.SigHash.ALL,
        witnessUtxo: (coinbaseTransaction as any).outputs[
          Number(spendable.outpoint.vout)
        ],
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
    logger.info(this);
    return this;
  }
  finalize(fee: bigint): TransactionBuilder {
    this.change = this.fee - fee;
    this.fee = fee;
    this.transaction.addOutputAddress(
      this.address,
      this.change,
      REGTEST_PARAMS
    );
    logger.info(this);
    return this;
  }
  sign(
    privKey: Uint8Array,
    nullify = false,
    auxRand = new Uint8Array(0x20)
  ): TransactionBuilder {
    this.transaction.sign(
      privKey,
      nullify ? undefined : [btc.SigHash.ALL],
      auxRand
    );
    this.transaction.finalize();
    return this;
  }
  extract(): string {
    return hex.encode(this.transaction.extract());
  }
  _clock(v: bigint): TransactionBuilder {
    this.fee = max(0n, BigInt(this.fee) - BigInt(v));
    this.change = max(0n, BigInt(this.change) - BigInt(v));
    return this;
  }
  addOutput(v: any): TransactionBuilder {
    this._clock(v.amount);
    this.transaction.addOutput(v);
    return this;
  }
  addOutputAddress(
    address: string,
    amount: bigint,
    params: any
  ): TransactionBuilder {
    this._clock(amount);
    this.transaction.addOutputAddress(address, amount, params);
    return this;
  }
  addInput(v: any): TransactionBuilder {
    this.transaction.addInput(v);
    return this;
  }
}
