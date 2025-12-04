import { useWallet } from '@/context/WalletContext';
import { useAlkanesSDK } from '@/context/AlkanesSDKContext';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import { NetworkMap } from '@/utils/constants';

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

export function useSignerShim() {
  const { signPsbt, signPsbts, network: walletNetwork } = useWallet();
  const { provider, network } = useAlkanesSDK();

  // Get the bitcoinjs-lib network from our network string
  const btcNetwork = NetworkMap[network] || bitcoin.networks.bitcoin;

  const finalizePsbt = (signedPsbtBase64: string | undefined) => {
    if (!signedPsbtBase64) throw new Error('Failed to sign PSBT');
    let psbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: btcNetwork });
    for (let i = 0; i < psbt.inputCount; i++) {
      const input = psbt.data.inputs[i];
      if (!input) throw new Error('input is undefined');
      if (input.finalScriptWitness || input.finalScriptSig) continue;
      psbt.finalizeInput(i);
    }
    return { signedPsbt: psbt.toBase64(), signedHexPsbt: psbt.toHex() };
  };

  const signerShim = {
    signAllInputs: async ({ rawPsbtHex }: { rawPsbtHex: string }) => {
      const signedPsbt = await signPsbt(rawPsbtHex);
      return finalizePsbt(signedPsbt);
    },
    signAllInputsMultiplePsbts: async ({ rawPsbts, rawPsbtsHex }: { rawPsbts?: string[]; rawPsbtsHex?: string[] }) => {
      if (!rawPsbtsHex) {
        if (!rawPsbts) throw new Error('Either rawPsbts or rawPsbtsHex must be provided');
        rawPsbtsHex = rawPsbts.map((psbt) => Buffer.from(psbt, 'base64').toString('hex'));
      }
      const signedPsbtResponse = await signPsbts({ psbts: rawPsbtsHex });
      const finalizedPsbts = signedPsbtResponse.signedPsbts.map((signedPsbt: string) => finalizePsbt(signedPsbt));
      return finalizedPsbts;
    },
    taprootKeyPair: ECPair.makeRandom({ network: btcNetwork }),
  } as any;

  return signerShim;
}
