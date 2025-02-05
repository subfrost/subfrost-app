import authTokenBinary from "raw-loader!./alkanes_std_auth_token.wasm.gz";
import frbtcBinary from "raw-loader!./fr_btc.wasm.gz";
import frostBinary from "raw-loader!./frost.wasm.gz";
import { hex } from "@scure/base";
import * as btc from "@scure/btc-signer";
import { encodeRunestoneProtostone } from "alkanes/lib/protorune/proto_runestone_upgrade";
import { encipher } from "alkanes/lib/bytes";
import { ProtoStone } from "alkanes/lib/protorune/protostone";
import { schnorr as secp256k1_schnorr } from "@noble/curves/secp256k1";
import * as envelope from "alkanes/lib/envelope";
import * as bip39 from "bip39";
import BIP32Factory from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import { getLogger } from "../../lib/logger";
import { TransactionBuilder } from "./TransactionBuilder";
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
  const authTokenReserve = 0xffeen;
  const authTokenPayload = {
    body: Buffer.from(authTokenBinary.default),
    cursed: false,
    tags: { contentType: "" },
  };

  await signer.deployContract(authTokenPayload, authTokenReserve);

  logger.info("Auth token contract deployed successfully");

  logger.info("Deploying FRBTC contract...");
  const frbtcPayload = {
    body: Buffer.from(frbtcBinary.default),
    cursed: false,
    tags: { contentType: "" },
  };

  await signer.deployContract(frbtcPayload, [3n, 0n, 0n, 1n]);

  logger.info("FRBTC contract deployed successfully");

  logger.info("Setting up contract signer...");
  const setSignerScript = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 1,
        refundPointer: 1,
        calldata: encipher([4n, 0n, 1n, 0n]),
      }),
    ],
  }).encodedRunestone;

  await setContractSigner(
    privKey,
    "bcrt1pys2f8u8yx7nu08txn9kzrstrmlmpvfprdazz9se5qr5rgtuz8htsaz3chd",
    setSignerScript
  );
  logger.info("Contract signer set successfully");

  logger.info("Environment setup completed successfully");
}

export async function setContractSigner(
  privKey: Signer,
  multisigAddress: string,
  script: Uint8Array
): Promise<void> {
  const fee = 60000n;
  const dustLimit = 546n;

  const unspent = await provider.call("listunspent", []);
  const input = unspent[0];
  const inputAmount = BigInt(Math.round(input.amount * 100000000));

  const tx = new btc.Transaction({
    allowUnknownOutputs: true,
    customScripts: [envelope.OutOrdinalReveal],
  });

  tx.addInput({
    txid: input.txid,
    index: input.vout,
    /*
    witnessUtxo: {
      script: btc.Address.toScriptPubKey(input.address),
      amount: inputAmount
    },
*/
  });

  // Add dust output to multisig address
  tx.addOutputAddress(multisigAddress, dustLimit, REGTEST_PARAMS);

  // Add change output
  tx.addOutputAddress(
    input.address,
    inputAmount - fee - dustLimit,
    REGTEST_PARAMS
  );

  // Add protocol message output
  tx.addOutput({
    script,
    amount: 0n,
  });

  // Get private key and sign

  tx.sign(privKey, [btc.SigHash.ALL]);
  tx.finalize();

  // Send transaction
  const txHex = hex.encode(tx.extract());
  await provider.call("sendrawtransaction", [txHex]);
  await provider.call("generatetoaddress", [1, input.address]);
  await provider.waitForIndex();
}

export function deployContract(payload: any, signer: Signer) {}

export function deployCustomContract(
  payload: any,
  script: bigint[],
  signer: Signer
) {}

export let provider = DEFAULT_PROVIDER["alkanes"];

export const mineBTC = async function mineBTC(
  address: string,
  blocks: number
): Promise<void> {
  await provider.call("generatetoaddress", [blocks, address]);
  await provider.waitForIndex();
};
