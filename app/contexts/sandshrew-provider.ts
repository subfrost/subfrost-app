import { AbstractProvider } from "./abstract-provider";
import { zipObject } from "lodash";
import { getLogger } from "./logger";

let id = 0;

const logger = getLogger("alkanes:provider");

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

export class SandshrewProvider extends AbstractProvider {
  public url: string;
  constructor(url: string) {
    super();
    this.url = url;
  }
  async call(method: string, params: any[]): Promise<any> {
    logger.info(`Making RPC call to ${this.url}`, { method, params });

    try {
      const response = await fetch(this.url, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: id++,
          params,
          method,
        }),
        headers: {
          "Content-Type": "application/json",
        },
      });

      const responseText = await response.text();
      console.log(responseText); // Keeping console.log for backwards compatibility

      logger.debug("Received RPC response", { method, responseText });

      const parsed = JSON.parse(responseText);

      if (parsed.error) {
        logger.error("RPC call failed", {
          method,
          error: parsed.error,
          params,
        });
        throw new Error(`RPC error: ${JSON.stringify(parsed.error)}`);
      }

      return parsed.result;
    } catch (err) {
      logger.error("Failed to make RPC call", {
        method,
        params,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
  async enrichOutput({
    vout,
    txid
  }: {
    vout: number,
    txid: string
  }): Promise<any> {
    return await this.call('ord_output', [`${txid}:${vout}`]);
  }
  async getBTCOnlyUTXOs(address: string): Promise<GetUTXOsResponse> {
    const utxos = await this.getUTXOs(address);
    const { inscriptions } = await this.call('ord_address', [ address ]);
    const map = zipObject(inscriptions, inscriptions);
    return utxos.filter((v) => !map[`${v.outpoint.txid}:${v.outpoint.vout}`] && v.runes.length === 0);
  }
  async getUTXOs(address: string): Promise<GetUTXOsResponse> {
    return (await this.call('alkanes_spendablesbyaddress', [{ address, protocolTag: '1' }])).outpoints;
  }
}
