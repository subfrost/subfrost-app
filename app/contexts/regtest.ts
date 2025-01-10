import { SandshrewProvider } from "alkanes/lib/provider/sandshrew-provider";
import * as authTokenBinary from "raw-loader!./alkanes_std_auth_token.wasm.gz";
import * as frbtcBinary from "raw-loader!./fr_btc.wasm.gz";
import * as frostBinary from "raw-loader!./frost.wasm.gz";

export const setupEnvironment = async function setupEnvironment(): Promise<void> {
  const privKey = hex.decode(
    "0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a",
  );
  const pubKey = secp256k1_schnorr.getPublicKey(privKey);
  const customScripts = [envelope.OutOrdinalReveal];
  
  const authPayload = {
    body: authTokenBinary,
    cursed: false,
    tags: { contentType: "" },
  };
  
  const authScript = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: encipher([3n, 0xffeen, 100n]),
      }),
    ],
  }).encodedRunestone;
  
  await deployContract(privKey, pubKey, authPayload, authScript);
  
  const frbtcPayload = {
    body: frbtcBinary,
    cursed: false,
    tags: { contentType: "" },
  };
  
  const frbtcScript = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 0,
        refundPointer: 0,
        calldata: encipher([3n, 0n, 0n, 1n]),
      }),
    ],
  }).encodedRunestone;
  
  await deployContract(privKey, pubKey, frbtcPayload, frbtcScript);
  
  // Set signer
  const setSignerScript = encodeRunestoneProtostone({
    protostones: [
      ProtoStone.message({
        protocolTag: 1n,
        edicts: [],
        pointer: 1,
        refundPointer: 1,
        calldata: encipher([4n, 0n, 1n, 0n]),
      }),
    ]
  }).encodedRunestone;
  
  await setContractSigner(privKey, "bcrt1pys2f8u8yx7nu08txn9kzrstrmlmpvfprdazz9se5qr5rgtuz8htsaz3chd", setSignerScript);
}

export async function deployContract(privKey: Uint8Array, pubKey: Uint8Array, payload: any, script: Uint8Array): Promise<void> {
  const revealPayment = btc.p2tr(
    undefined,
    envelope.p2tr_ord_reveal(pubKey, [payload]),
    REGTEST_PARAMS,
    false,
    [envelope.OutOrdinalReveal],
  );

  const faucetAddress = (await provider.call("getnewaddress", [])).toString(); 
  
  await provider.call("generatetoaddress", [faucetAddress, 200]);
  
  const fundingAmount = 100000000n;
  const fee = 30000n;
  
  const fundingTx = new btc.Transaction({allowLegacyWitnessUtxo: true, allowUnknownOutputs: true});
  
  const unspent = await provider.call("listunspent", []);
  const input = unspent[0];
  
  fundingTx.addInput({
    txid: input.txid,
    index: input.vout,
    witnessUtxo: {
      script: btc.Address.toScriptPubKey(input.address),
      amount: BigInt(Math.round(input.amount * 100000000))
    },
  });
  
  fundingTx.addOutput({
    script: revealPayment.script,
    amount: fundingAmount,
  });
  
  const privKeyWIF = await provider.call("dumpprivkey", [input.address]);
  fundingTx.sign(btc.ECPair.fromWIF(privKeyWIF).privateKey!, [btc.SigHash.ALL]);
  fundingTx.finalize();
  
  const fundingTxHex = hex.encode(fundingTx.extract());
  const fundingTxid = await provider.call("sendrawtransaction", [fundingTxHex]);
  
  await provider.call("generatetoaddress", [faucetAddress, 1]);
  
  const tx = new btc.Transaction({ allowUnknownOutputs: true, customScripts: [envelope.OutOrdinalReveal] });
  tx.addInput({
    ...revealPayment,
    txid: fundingTxid,
    index: 0,
    witnessUtxo: { script: revealPayment.script, amount: fundingAmount },
  });
  
  tx.addOutputAddress(revealPayment.address, fundingAmount - fee, REGTEST_PARAMS);
  tx.addOutput({
    script,
    amount: 0n,
  });
  
  tx.sign(privKey, undefined, new Uint8Array(32));
  tx.finalize();
  
  const txHex = hex.encode(tx.extract());
  await provider.call("sendrawtransaction", [txHex]);
  await provider.call("generatetoaddress", [faucetAddress, 1]);
}

export async function setContractSigner(privKey: Uint8Array, multisigAddress: string, script: Uint8Array): Promise<void> {
  const fee = 30000n;
  const dustLimit = 546n;
  
  const unspent = await provider.call("listunspent", []);
  const input = unspent[0];
  const inputAmount = BigInt(Math.round(input.amount * 100000000));
  
  const tx = new btc.Transaction({ allowUnknownOutputs: true, customScripts: [envelope.OutOrdinalReveal] });
  
  tx.addInput({
    txid: input.txid,
    index: input.vout,
    witnessUtxo: {
      script: btc.Address.toScriptPubKey(input.address),
      amount: inputAmount
    },
  });

  // Add dust output to multisig address
  tx.addOutputAddress(multisigAddress, dustLimit, REGTEST_PARAMS);

  // Add change output
  tx.addOutputAddress(input.address, inputAmount - fee - dustLimit, REGTEST_PARAMS);

  // Add protocol message output 
  tx.addOutput({
    script,
    amount: 0n,
  });

  // Get private key and sign
  const privKeyWIF = await provider.call("dumpprivkey", [input.address]);
  tx.sign(btc.ECPair.fromWIF(privKeyWIF).privateKey!, [btc.SigHash.ALL]);
  tx.finalize();

  // Send transaction
  const txHex = hex.encode(tx.extract());
  await provider.call("sendrawtransaction", [txHex]);
  await provider.call("generatetoaddress", [input.address, 1]);
}
  

export let provider = new SandshrewProvider("http://localhost:18888");

export const mineBTC = async function mineBTC(address, sats): Promise<void> {
  await provider.call("generatetoaddress", [address, sats]);
}
