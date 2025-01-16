import { SandshrewProvider } from "./sandshrew-provider";
import * as authTokenBinary from "raw-loader!./alkanes_std_auth_token.wasm.gz";
import * as frbtcBinary from "raw-loader!./fr_btc.wasm.gz";
import * as frostBinary from "raw-loader!./frost.wasm.gz";
import { contractDeployer } from "./deployer";
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
import { getLogger } from "./logger";
import { TransactionBuilder } from "./TransactionBuilder";
import { Signer } from "@scure/btc-signer/transaction";


export const REGTEST_PARAMS = {
  bech32: "bcrt",
  pubKeyHash: 0,
  scriptHash: 5,
  wif: 128,
};

const logger = getLogger("alkanes:run");

export async function setupEnvironment(): Promise<void> {
  console.log("typeof window");
  console.log(typeof window);

  const isServer = typeof window !== "undefined";

  if (isServer) {
  logger.info("Starting environment setup...");

  const privKey = hex.decode(
    "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a",
  );
  const pubKey = secp256k1_schnorr.getPublicKey(privKey);
  const customScripts = [envelope.OutOrdinalReveal];

  console.log("authTokenBinary: ", authTokenBinary)

  logger.info("Deploying auth token contract...");
  const authPayload = {
    body: Buffer.from(authTokenBinary.default, 'hex'),
    cursed: false,
    tags: { contentType: "" },
  };

 
    const { contractDeployer } = require("./deployer");
    // Use the imported function here


  await contractDeployer({
    contract: 'auth_token',
    mnemonic: REGTEST_FAUCET.mnemonic,
    payload: authPayload,
  });
  console.log("auth token contract deployed");

logger.info("Deploying FRBTC contract...");
  const frbtcPayload = {
    body: Buffer.from(frbtcBinary.default, 'hex'),
    cursed: false,
    tags: { contentType: "" },
  };

  await contractDeployer({
    contract: 'frbtc',
    mnemonic: REGTEST_FAUCET.mnemonic,
    payload: frbtcPayload,
  });

  console.log("frbtc contract deployed");


  // const authScript = encodeRunestoneProtostone({
  //   protostones: [
  //     ProtoStone.message({
  //       protocolTag: 1n,
  //       edicts: [],
  //       pointer: 0,
  //       refundPointer: 0,
  //       calldata: encipher([3n, 0xffeen, 100n]),
  //     }),
  //   ],
  // }).encodedRunestone;

  // await deployContract(authPayload, authScript);
  // logger.info("Auth token contract deployed successfully");

  // logger.info("Deploying FRBTC contract...");
  // const frbtcPayload = {
  //   body: frbtcBinary.default,
  //   cursed: false,
  //   tags: { contentType: "" },
  // };

  // const frbtcScript = encodeRunestoneProtostone({
  //   protostones: [
  //     ProtoStone.message({
  //       protocolTag: 1n,
  //       edicts: [],
  //       pointer: 0,
  //       refundPointer: 0,
  //       calldata: encipher([3n, 0n, 0n, 1n]),
  //     }),
  //   ],
  // }).encodedRunestone;

  // await deployContract(frbtcPayload, frbtcScript);
  // logger.info("FRBTC contract deployed successfully");

  // logger.info("Setting up contract signer...");
  // const setSignerScript = encodeRunestoneProtostone({
  //   protostones: [
  //     ProtoStone.message({
  //       protocolTag: 1n,
  //       edicts: [],
  //       pointer: 1,
  //       refundPointer: 1,
  //       calldata: encipher([4n, 0n, 1n, 0n]),
  //     }),
  //   ],
  // }).encodedRunestone;

  // await setContractSigner(
  //   privKey,
  //   "bcrt1pys2f8u8yx7nu08txn9kzrstrmlmpvfprdazz9se5qr5rgtuz8htsaz3chd",
  //   setSignerScript,
  // );
  // logger.info("Contract signer set successfully");

  // logger.info("Environment setup completed successfully");

} else {
  logger.error("setupEnvironment is not available in the client environment");
}
}

export const REGTEST_FAUCET = {
  mnemonic:
    "hub dinosaur mammal approve riot rebel library legal sick discover loop alter",
  nativeSegwit: {
    address: "bcrt1qzr9vhs60g6qlmk7x3dd7g3ja30wyts48sxuemv",
    publicKey:
      "03d3af89f242cc0df1d7142e9a354a59b1cd119c12c31ff226b32fb77fa12acce2",
  },
  taproot: {
    address: "bcrt1p45un5d47hvfhx6mfezr6x0htpanw23tgll7ppn6hj6gfzu3x3dnsaegh8d",
    publicKey:
      "022ffc336daa8196f1aa796135a568b1125ba08c2879c22468effea8e4a0c4c8b9",
    publicKeyXonly:
      "2ffc336daa8196f1aa796135a568b1125ba08c2879c22468effea8e4a0c4c8b9",
  },
  privateKey: "bc1p45un5d47hvfhx6mfezr6x0htpanw23tgll7ppn6hj6gfzu3x3dns8g57gc",
  publicKey:
    "03d3af89f242cc0df1d7142e9a354a59b1cd119c12c31ff226b32fb77fa12acce2",
  wif: "cTBsa8seu4xA7EZ7N2AXeq2qUfrVsD2KS3F7Tj72WKaXF15hp7Vq",
};

const getAddress = (node: { publicKey: Uint8Array }) => {
  return bitcoin.payments.p2wpkh({
    pubkey: node.publicKey,
    network: bitcoin.networks.regtest,
  }).address;
};

const getPrivate = async (mnemonic: string) => {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const bip32 = BIP32Factory(await import("tiny-secp256k1"));
  const root = bip32.fromSeed(seed, bitcoin.networks.regtest);
  return root.derivePath("m/84'/0'/0'/0/0");
};

export async function getRegtestWallet() {
  const privKey = hex.decode(
    "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a",
  );
  const faucetPrivate = await getPrivate(REGTEST_FAUCET.mnemonic);
  const faucetAddress = getAddress(faucetPrivate);
  const pubKey = secp256k1_schnorr.getPublicKey(privKey);
  logger.info("faucet address: " + faucetAddress);
  return {
    privKey,
    faucetPrivate,
    faucetAddress,
    pubKey,
  };
}

export async function deployContract(
  payload: any,
  script: Uint8Array,
): Promise<void> {
  const { faucetPrivate, faucetAddress, pubKey, privKey } =
    await getRegtestWallet();
  payload.body = Buffer.from(payload.body);
  logger.info("payload");
  logger.info(payload);
  const revealPayment = btc.p2tr(
    undefined,
    envelope.p2tr_ord_reveal(pubKey, [payload]),
    REGTEST_PARAMS,
    false,
    [envelope.OutOrdinalReveal],
  );

  await provider.call("generatetoaddress", [200, faucetAddress]);
  await provider.waitForIndex();

  const fundingAmount = 100000000n;
  const fee = 60000n;
  logger.info("faucetAddress: " + faucetAddress);
  const fundingTx = await new TransactionBuilder(undefined)
    .setProvider(provider)
    .setAddress(faucetAddress || "")
    .addBitcoin(1000000000n);
  let vout = fundingTx.transaction.outputs.length;
  fundingTx.addOutput({
    script: revealPayment.script,
    amount: fundingAmount,
  });
  logger.info(faucetPrivate);

  fundingTx.finalize(30000n);
  fundingTx.sign(faucetPrivate.privateKey || Uint8Array.from([]));

  const fundingTxHex = fundingTx.extract();
  const fundingTxid = await provider.call("sendrawtransaction", [fundingTxHex]);

  await provider.call("generatetoaddress", [1, faucetAddress]);
  await provider.waitForIndex();
  logger.info("fundingtx signed");
  const tx = new TransactionBuilder([envelope.OutOrdinalReveal])
    .setProvider(provider)
    .setAddress(revealPayment.address || "");
  tx.addInput({
    ...revealPayment,
    txid: fundingTx.transaction.id,
    index: vout,
    witnessUtxo: { script: revealPayment.script, amount: fundingAmount },
  });
  tx.fee += fundingAmount;

  tx.addOutputAddress(
    faucetAddress || "",
    fundingAmount - fee,
    REGTEST_PARAMS,
  );
  tx.addOutput({
    script,
    amount: 0n,
  });

  tx.finalize(30000n);
  tx.sign(privKey, [btc.SigHash.ALL], new Uint8Array(32));

  const txHex = tx.extract();
  const txhash = await provider.call("sendrawtransaction", [txHex]);
  logger.info(txhash);
  await provider.call("generatetoaddress", [1, faucetAddress]);
  await provider.waitForIndex();
  logger.info(
    await provider.call("alkanes_trace", [
      {
        txid: txhash,
        vout: tx.transaction.outputs.length + 1,
      },
    ]),
  );
}

const POLL_INTERVAL = 3000;

export async function setContractSigner(
  privKey: Signer,
  multisigAddress: string,
  script: Uint8Array,
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
    REGTEST_PARAMS,
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

export let provider = new SandshrewProvider("http://localhost:3000");

export const mineBTC = async function mineBTC(
  address: string,
  blocks: number,
): Promise<void> {
  await provider.call("generatetoaddress", [blocks, address]);
  await provider.waitForIndex();
};
