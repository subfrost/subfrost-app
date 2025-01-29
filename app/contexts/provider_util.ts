import { Provider } from "@oyl/sdk";

import { getLogger, LEVELS } from "./logger";
import { GetUTXOsResponse } from "./sandshrew-provider";

const logger = getLogger("alkanes:provider");
export async function timeout(n: number): Promise<void> {
  return await new Promise((resolve) => {
    setTimeout(resolve, n);
  });
}
export async function waitForIndex(provider: Provider) {
  while (true) {
    const bitcoinHeight = Number(
      await provider.sandshrew._call("getblockcount", [])
    );
    const metashrewHeight = Number(
      await provider.sandshrew._call("metashrew_height", [])
    );
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

export async function getUTXOS(
  provider: Provider,
  address: any
): Promise<GetUTXOsResponse> {
  return (
    await provider.sandshrew._call("alkanes_spendablesbyaddress", [
      { address, protocolTag: "1" },
    ])
  ).outpoints;
}
