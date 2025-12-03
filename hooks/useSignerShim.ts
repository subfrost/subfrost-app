import { useWallet } from '@/context/WalletContext';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from '@bitcoinerlab/secp256k1';
import { useSandshrewProvider } from './useSandshrewProvider';

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

export function useSignerShim() {
  const { signPsbt, signPsbts } = useWallet();
  const provider = useSandshrewProvider();

  const finalizePsbt = (signedPsbtBase64: string | undefined) => {
    if (!signedPsbtBase64) throw new Error('Failed to sign PSBT');
    if (!provider) throw new Error('Provider not available');
    let psbt = bitcoin.Psbt.fromBase64(signedPsbtBase64, { network: provider.network });
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
      // signPsbt now returns string directly (base64 signed PSBT)
      const signedPsbtBase64 = await signPsbt(rawPsbtHex);
      return finalizePsbt(signedPsbtBase64);
    },
    signAllInputsMultiplePsbts: async ({ rawPsbts, rawPsbtsHex }: { rawPsbts?: string[]; rawPsbtsHex?: string[] }) => {
      if (!rawPsbtsHex) {
        if (!rawPsbts) throw new Error('Either rawPsbts or rawPsbtsHex must be provided');
        rawPsbtsHex = rawPsbts.map((psbt) => Buffer.from(psbt, 'base64').toString('hex'));
      }
      // signPsbts now returns string[] directly (base64 signed PSBTs)
      const signedPsbtsBase64 = await signPsbts(rawPsbtsHex);
      const finalizedPsbts = signedPsbtsBase64.map((signedPsbt) => finalizePsbt(signedPsbt));
      return finalizedPsbts;
    },
    taprootKeyPair: provider ? ECPair.makeRandom({ network: provider.network }) : undefined,
  } as any;

  return signerShim;
}


