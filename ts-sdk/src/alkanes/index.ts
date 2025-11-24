import { AlkanesWallet } from '../wallet';
import { AlkanesProvider } from '../provider';
import { UTXO, TxInput } from '../types';
import * as bitcoin from 'bitcoinjs-lib';

export async function wrapBtc({
  utxos,
  account, // This will be the address to send change to, and to derive key from
  provider,
  signer, // This is an AlkanesWallet instance
  feeRate,
  wrapAmount,
}: {
  utxos: UTXO[];
  account: string; // The receiving address for change and for signing. This needs to be an address from the user's wallet.
  provider: AlkanesProvider;
  signer: AlkanesWallet;
  feeRate: number;
  wrapAmount: number; // in sats
}) {
  // 1. Select UTXOs
  // This is a simplified UTXO selection. In a real app, you'd want to be more sophisticated.
  let totalInput = 0;
  const inputs: TxInput[] = [];
  for (const utxo of utxos) {
    inputs.push({
      txid: utxo.txid,
      vout: utxo.vout,
      value: utxo.value,
      address: account, // All UTXOs assumed to belong to the 'account' address
    });
    totalInput += utxo.value;
    // Rough estimate for now, a more precise fee calculation would adjust this dynamically
    if (totalInput >= wrapAmount + feeRate * estimateTxSize(inputs.length, 2)) {
        break;
    }
  }

  if (totalInput < wrapAmount) {
    throw new Error('Insufficient funds to wrap BTC');
  }

  // 2. Determine outputs
  // Assuming a single output for the wrapped BTC and a change output.
  // The destination address for the wrapped BTC needs to be determined.
  // For now, let's assume it's the same as the account.
  const destinationAddress = account; // Placeholder: this needs to be the actual destination for wrapped BTC

  const outputs = [
    {
      address: destinationAddress, // This will be the address to send the wrapped BTC
      value: wrapAmount,
    }
  ];

  // Calculate change
  // This requires a more accurate fee estimation.
  const estimatedTxSize = estimateTxSize(inputs.length, outputs.length + 1); // +1 for change output
  const estimatedFee = feeRate * estimatedTxSize;
  const change = totalInput - wrapAmount - estimatedFee;

  if (change < 0) {
    throw new Error('Not enough funds to cover transaction + fee');
  }

  if (change > 0) {
    outputs.push({
        address: signer.getChangeAddress(), // Assuming this gives a valid change address
        value: change,
    });
  }


  // 3. Create PSBT
  const psbtOptions = {
    inputs: inputs,
    outputs: outputs,
  };

  const psbtBase64 = await signer.createPsbt(psbtOptions);

  // 4. Sign PSBT
  const signedPsbtBase64 = signer.signPsbt(psbtBase64);

  // 5. Broadcast Transaction
  const transactionResult = await provider.pushPsbt({ psbtBase64: signedPsbtBase64 });

  return transactionResult;
}

// A very rough estimate of transaction size for fee calculation.
// In a real scenario, this would be more accurate or use a library.
function estimateTxSize(numInputs: number, numOutputs: number): number {
  // P2WPKH input size approx 68 bytes
  // P2WPKH output size approx 31 bytes
  // Base transaction size approx 10 bytes
  return (numInputs * 68) + (numOutputs * 31) + 10;
}