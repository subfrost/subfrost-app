"use client";
import authTokenBinary from "raw-loader!./alkanes_std_auth_token.wasm.gz";
import frbtcBinary from "raw-loader!./fr_btc.wasm.gz";
import frostBinary from "raw-loader!./frost.wasm.gz";
import { getLogger } from "@/lib/logger";
import { Signer } from "@/lib";
import {
  REGTEST_FAUCET,
  REGTEST_PARAMS,
  DEFAULT_PROVIDER,
  TEST_WALLET,
} from "@/lib/constants";
import { contractDeployment } from "@oyl/sdk/lib/alkanes/contract";

const logger = getLogger("alkanes:run");

export async function setupEnvironment(): Promise<void> {
  logger.info("Starting environment setup...");
  const signer = Signer.fromMnemonic(TEST_WALLET.mnemonic, "regtest");
  logger.info("Deploying auth token contract...");
  console.log(provider);
  await provider.regtestInit();
  const authTokenReserve = 0xffeen;
  const authTokenPayload = {
    body: Buffer.from(await authTokenBinary),
    cursed: false,
    tags: { contentType: "" },
  };

  await signer.deployContract(authTokenPayload, authTokenReserve);
  await provider.genBlocks();

  logger.info("Auth token contract deployed successfully");

  logger.info("Deploying FRBTC contract...");
  const frbtcPayload = {
    body: Buffer.from(await frbtcBinary),
    cursed: false,
    tags: { contentType: "" },
  };

  await signer.deployContract(frbtcPayload, [3n, 0n, 0n, 1n]);
  await provider.genBlocks();

  logger.info("FRBTC contract deployed successfully");

  logger.info("Setting up contract signer...");
  await signer.execute(
    [4n, 0n, 1n, 0n],
    "bcrt1pys2f8u8yx7nu08txn9kzrstrmlmpvfprdazz9se5qr5rgtuz8htsaz3chd"
  );
  await provider.genBlocks();
  logger.info("Contract signer set successfully");

  logger.info("Environment setup completed successfully");
}

export let provider = DEFAULT_PROVIDER["alkanes"];

export const mineBTC = async function mineBTC(
  address: string,
  blocks: number
): Promise<void> {
  await provider.call("generatetoaddress", [blocks, address]);
  await provider.waitForIndex();
};
