import {
  Signer as BaseSigner,
  Account,
  tweakSigner,
  getOutputValueByVOutIndex,
} from "@oyl/sdk";
import { minimumFee } from "@oyl/sdk/lib/btc";
import { networks, Psbt, payments } from "bitcoinjs-lib";
import { DEFAULT_PROVIDER } from "./constants";
import { Provider } from "./provider";
import { getWalletPrivateKeys, mnemonicToAccount } from "@oyl/sdk/lib/account";
import { accountUtxos } from "@oyl/sdk/lib/utxo";
import { deployCommit, createDeployReveal } from "@oyl/sdk/lib/alkanes";
import { actualDeployRevealFee } from "@oyl/sdk/lib/alkanes/contract";
import { encodeRunestoneProtostone } from "alkanes/lib/protorune/proto_runestone_upgrade";
import { ProtoStone } from "alkanes/lib/protorune/protostone";
import { encipher } from "alkanes/lib/bytes";
import { toXOnly } from "bitcoinjs-lib/src/psbt/bip371";
import { LEAF_VERSION_TAPSCRIPT } from "bitcoinjs-lib/src/payments/bip341";

export class Signer extends BaseSigner {
  provider: Provider;
  account: Account;
  constructor(network: any, opts: any, mnemonic: string) {
    super(network, opts);
    this.provider = (DEFAULT_PROVIDER as any)[network];
    this.account = mnemonicToAccount({
      mnemonic,
      opts: {
        network: (networks as any)[network],
      },
    });
  }

  static fromMnemonic(mnemonic: string, network: any) {
    const opts = getWalletPrivateKeys({
      mnemonic,
      opts: {
        network: (networks as any)[network],
      },
    });
    return new Signer((networks as any)[network], opts, mnemonic);
  }

  async getUTXOS() {
    return await accountUtxos({
      account: this.account,
      provider: this.provider,
    });
  }
  async deployReveal(
    script: bigint[],
    prev_script: any,
    feeRate: number,
    commitTxId: string,
    tweakedTaprootKeyPair: any
  ) {
    try {
      const psbt = new Psbt({ network: this.network });
      const minFee = minimumFee({
        taprootInputCount: 1,
        nonTaprootInputCount: 0,
        outputCount: 2,
      });

      const revealTxBaseFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;

      const commitTxOutput = await getOutputValueByVOutIndex({
        txId: commitTxId,
        vOut: 0,
        esploraRpc: this.provider.esplora,
      });

      if (!commitTxOutput) {
        throw new Error("Error getting vin #0 value");
      }
      const protostone = encodeRunestoneProtostone({
        protostones: [
          ProtoStone.message({
            protocolTag: 1n,
            edicts: [],
            pointer: 0,
            refundPointer: 0,
            calldata: encipher(script),
          }),
        ],
      }).encodedRunestone;

      const p2pk_redeem: any = { output: prev_script };

      const { output, witness } = payments.p2tr({
        internalPubkey: toXOnly(tweakedTaprootKeyPair.publicKey),
        scriptTree: p2pk_redeem,
        redeem: p2pk_redeem,
        network: this.network,
      });

      psbt.addInput({
        hash: commitTxId,
        index: 0,
        witnessUtxo: {
          value: commitTxOutput.value,
          script: output as any,
        },
        tapLeafScript: [
          {
            leafVersion: LEAF_VERSION_TAPSCRIPT,
            script: p2pk_redeem.output,
            controlBlock: witness![witness!.length - 1],
          },
        ],
      });

      psbt.addOutput({
        value: 546,
        address: this.account.taproot.address,
      });

      psbt.addOutput({
        value: 0,
        script: protostone,
      });

      let estimatePsbt = Psbt.fromBase64(psbt.toBase64(), {
        network: this.network,
      });

      estimatePsbt.signInput(0, tweakedTaprootKeyPair);
      estimatePsbt.finalizeInput(0);
      let signed = estimatePsbt.extractTransaction().toHex();

      let vsize = (
        await (this.provider.sandshrew.bitcoindRpc as any).testMemPoolAccept([
          signed,
        ])
      )[0].vsize;
      let correctFee = vsize * feeRate;

      estimatePsbt = Psbt.fromBase64(psbt.toBase64(), {
        network: this.network,
      });
      estimatePsbt.addOutput({
        value: revealTxBaseFee - correctFee,
        address: this.account.taproot.address,
      });
      estimatePsbt.signInput(0, tweakedTaprootKeyPair);
      estimatePsbt.finalizeInput(0);
      signed = estimatePsbt.extractTransaction().toHex();

      vsize = (
        await (this.provider.sandshrew.bitcoindRpc as any).testMemPoolAccept([
          signed,
        ])
      )[0].vsize;
      correctFee = vsize * feeRate;
      psbt.addOutput({
        value: revealTxBaseFee - correctFee,
        address: this.account.taproot.address,
      });

      psbt.signInput(0, tweakedTaprootKeyPair);
      psbt.finalizeInput(0);

      return this.provider.pushPsbt({
        psbtBase64: psbt.toBase64(),
      });
    } catch (e: any) {
      throw new Error(e.toString());
    }
  }

  async deployContract(payload: any, script: bigint | bigint[]) {
    const utxos = await this.getUTXOS();
    const gatheredUtxos = {
      utxos: utxos.accountSpendableTotalUtxos,
      totalAmount: utxos.accountSpendableTotalBalance,
    };
    const res = await deployCommit({
      payload,
      gatheredUtxos,
      account: this.account,
      provider: this.provider,
      feeRate: 2,
      signer: this,
    });
    let final_script: bigint[] =
      typeof script == "bigint" ? [3n, script, 100n] : script;
    const tweakedTaprootKeyPair = tweakSigner(this.taprootKeyPair, {
      network: this.network,
    });
    return await this.deployReveal(
      final_script,
      res.script,
      2,
      res.txId,
      tweakedTaprootKeyPair
    );
  }
}
