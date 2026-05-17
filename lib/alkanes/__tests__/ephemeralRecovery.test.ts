import { describe, expect, it } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import {
  buildDeterministicEphemeralRecoveryPayment,
  buildEphemeralRecoveryKey,
  buildEphemeralRecoveryOpReturnScript,
  extractEphemeralRecoveryXOnlyPubkeys,
  xOnlyPubkey,
} from '../ephemeralRecovery';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

describe('ephemeral recovery descriptors', () => {
  it('rebuilds the multisig recovery address from the on-chain x-only pubkey', () => {
    const userXOnlyPubkey = xOnlyPubkey(
      ECPair.makeRandom({ network: bitcoin.networks.bitcoin }).publicKey,
    ).toString('hex');
    const original = buildEphemeralRecoveryKey({
      network: bitcoin.networks.bitcoin,
      networkId: 'mainnet',
      userXOnlyPubkey,
    });
    const descriptorScript = buildEphemeralRecoveryOpReturnScript(original.ephemeralXOnlyPubkey);
    const [ephemeralXOnlyPubkey] = extractEphemeralRecoveryXOnlyPubkeys({
      vout: [
        { scriptpubkey: descriptorScript.toString('hex') },
        { scriptpubkey: original.outputScriptHex },
      ],
    });

    const rebuilt = buildDeterministicEphemeralRecoveryPayment({
      network: bitcoin.networks.bitcoin,
      networkId: 'mainnet',
      userXOnlyPubkey,
      ephemeralXOnlyPubkey,
    });

    expect(descriptorScript.length).toBe(34);
    expect(rebuilt.address).toBe(original.address);
    expect(rebuilt.outputScriptHex).toBe(original.outputScriptHex);
  });
});
