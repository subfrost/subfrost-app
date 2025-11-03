import { Provider as BaseProvider } from "@oyl/sdk";

import { getLogger, LEVELS } from "./logger";
import { zipObject } from "lodash";
import { REGTEST_FAUCET } from "./constants";

export type OutPointResponseOutPoint = {
  txid: string;
  vout: number;
};

export type OutPointResponseOutput = {
  script: string;
  value: number;
};

export type RuneResponse = {
  name: string;
  symbol: string;
  balance: bigint | number;
};

export type OutPointResponse = {
  runes: RuneResponse[];
  outpoint: OutPointResponseOutPoint;
  output: OutPointResponseOutput;
  height: number;
  txindex: number;
};

export type BalanceSheetItem = {
  rune: RuneResponse;
  balance: bigint | number;
};

export type GetUTXOsResponse = OutPointResponse[];
const logger = getLogger("alkanes:provider");

export async function timeout(n: number): Promise<void> {
  return await new Promise((resolve) => {
    setTimeout(resolve, n);
  });
}

export class Provider extends BaseProvider {
  async call<T = any>(method: string, ...params: any[]): Promise<T> {
    console.log(method, params);
    return this.sandshrew._call(method, params || []);
  }

  async waitForIndex() {
    while (true) {
      const bitcoinHeight = Number(await this.call("getblockcount"));
      const metashrewHeight = Number(await this.call("metashrew_height"));
      logger.info("bitcoin height: " + bitcoinHeight);
      logger.info("metashrew height: " + metashrewHeight);
      if (metashrewHeight >= bitcoinHeight) {
        logger.info("indexer caught up");
        break;
      } else {
        await timeout(3000);
        logger.info("retry poll");
      }
    }
  }
  async getUTXOS(address: any): Promise<GetUTXOsResponse> {
    const utxos = await this.call("alkanes_spendablesbyaddress", {
      address,
      protocolTag: "1",
    });
    return utxos.outpoints;
  }
  async enrichOutput({
    vout,
    txid,
  }: {
    vout: number;
    txid: string;
  }): Promise<any> {
    return await this.call("ord_output", `${txid}:${vout}`);
  }
  async getBTCOnlyUTXOs(address: string): Promise<GetUTXOsResponse> {
    const utxos = await this.getUTXOS(address);
    const { inscriptions } = await this.call("ord_address", address);
    const map = zipObject(inscriptions, inscriptions);
    return utxos.filter(
      (v) =>
        !map[`${v.outpoint.txid}:${v.outpoint.vout}`] && v.runes.length === 0
    );
  }

  async getBlockCount(): Promise<number> {
    return (await (
      this.sandshrew.bitcoindRpc as any
    ).getBlockCount()) as any as number;
  }

  async regtestInit(options?: { address: string; mnemonic: string }) {
    let count = await this.getBlockCount();

    if (count > 250) {
      logger.warn("already initialized, skipping");
      return;
    }
    let address =
      options?.address || "bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx";
    let bitcoind = this.sandshrew.bitcoindRpc as any;
    await bitcoind.generateToAddress(5, address);
    await bitcoind.generateToAddress(100, REGTEST_FAUCET.nativeSegwit.address);
    await bitcoind.generateToAddress(100, REGTEST_FAUCET.nativeSegwit.address);
    await bitcoind.generateToAddress(
      145,
      "bcrt1qz3y37epk6hqlul2pt09hrwgj0s09u5g6kzrkm2"
    );

    await this.waitForIndex();
  }

  async genBlocks(options?: { count: number; address: string }) {
    const count = options?.count || 1;
    const address =
      options?.address || "bcrt1qz3y37epk6hqlul2pt09hrwgj0s09u5g6kzrkm2";

    let bitcoind = this.sandshrew.bitcoindRpc as any;
    await bitcoind.generateToAddress(count, address);

    await this.waitForIndex();
  }
}
