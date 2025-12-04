/**
 * API Route: Send BTC via alkanes-cli
 *
 * Uses alkanes-cli for robust transaction building, signing, and broadcasting.
 * This solves the PSBT/witness issues we had with ts-sdk.
 */

import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import * as ecc from 'tiny-secp256k1';

const execAsync = promisify(exec);
const bip32 = BIP32Factory(ecc);

interface SendRequest {
  mnemonic: string;
  recipient: string;
  amount: string; // BTC amount as string (e.g., "0.001")
  feeRate?: number; // sat/vB
  fromAddresses?: string[]; // Optional: specific addresses to spend from
  lockAlkanes?: boolean; // Skip UTXOs with alkanes
  network?: 'regtest' | 'mainnet' | 'signet';
}

// Derive private key from mnemonic (with optional BIP39 passphrase)
function derivePrivateKey(mnemonic: string, password: string = '', network: string = 'regtest'): string {
  // The ts-sdk/WASM uses empty string for BIP39 passphrase (password only encrypts the keystore)
  const seed = bip39.mnemonicToSeedSync(mnemonic, '');
  const root = bip32.fromSeed(seed);

  // IMPORTANT: The alkanes ts-sdk uses BIP84 path (m/84'/0'/0'/0/0) for taproot addresses!
  // This is a quirk - BIP84 is normally for native segwit, but ts-sdk uses it for P2TR
  const path = `m/84'/0'/0'/0/0`;

  const child = root.derivePath(path);
  if (!child.privateKey) {
    throw new Error('Failed to derive private key');
  }

  return Buffer.from(child.privateKey).toString('hex');
}

export async function POST(request: NextRequest) {
  console.log('[API:send] Send via CLI called');

  try {
    const body: SendRequest = await request.json();
    const { mnemonic, recipient, amount, feeRate, fromAddresses, lockAlkanes, network = 'regtest' } = body;

    // Validate required fields
    if (!mnemonic) {
      return NextResponse.json({ error: 'Mnemonic is required' }, { status: 400 });
    }
    if (!recipient) {
      return NextResponse.json({ error: 'Recipient address is required' }, { status: 400 });
    }
    if (!amount) {
      return NextResponse.json({ error: 'Amount is required' }, { status: 400 });
    }

    // Validate mnemonic
    if (!bip39.validateMnemonic(mnemonic)) {
      return NextResponse.json({ error: 'Invalid mnemonic phrase' }, { status: 400 });
    }

    // Validate amount is a valid number
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    const alkanesDir = process.env.ALKANES_DIR || `${process.env.HOME}/alkanes-rs`;
    const cliPath = `${alkanesDir}/target/release/alkanes-cli`;

    // Derive private key from mnemonic
    console.log('[API:send] Deriving private key from mnemonic...');
    const privateKeyHex = derivePrivateKey(mnemonic, '', network);
    console.log('[API:send] Private key derived successfully');

    // Build the send command using --wallet-key
    let sendCommand = `${cliPath} -p ${network} --wallet-key "${privateKeyHex}" wallet send`;

    // Add from addresses if specified
    if (fromAddresses && fromAddresses.length > 0) {
      for (const addr of fromAddresses) {
        sendCommand += ` --from "${addr}"`;
      }
    }

    // Add lock-alkanes flag if specified
    if (lockAlkanes) {
      sendCommand += ' --lock-alkanes';
    }

    // Add fee rate if specified
    if (feeRate && feeRate > 0) {
      sendCommand += ` --fee-rate ${feeRate}`;
    }

    // Add auto-confirm to skip interactive prompts
    sendCommand += ' -y';

    // Add recipient and amount
    sendCommand += ` "${recipient}" "${amount}"`;

    console.log('[API:send] Executing send command...');
    // Log command without the private key for security
    console.log('[API:send] Command (key redacted):', sendCommand.replace(privateKeyHex, '[PRIVATE_KEY]'));

    const { stdout, stderr } = await execAsync(sendCommand, {
      timeout: 60000, // 60 second timeout for send
    });

    console.log('[API:send] stdout:', stdout);
    if (stderr) {
      console.log('[API:send] stderr:', stderr);
    }

    // Parse the output to extract txid
    // alkanes-cli outputs: "Transaction sent: <txid>"
    const txidMatch = stdout.match(/Transaction sent:\s*([a-f0-9]{64})/i);
    const txid = txidMatch ? txidMatch[1] : null;

    if (!txid) {
      // Check if there's an error in the output
      if (stdout.includes('Error') || stdout.includes('error') || stderr) {
        throw new Error(stdout || stderr || 'Unknown error during send');
      }
      // Try to extract any hex string that looks like a txid
      const anyTxid = stdout.match(/[a-f0-9]{64}/i);
      if (anyTxid) {
        return NextResponse.json({
          success: true,
          txid: anyTxid[0],
          output: stdout,
        });
      }
      throw new Error('Could not extract txid from output: ' + stdout);
    }

    console.log('[API:send] Success! txid:', txid);

    return NextResponse.json({
      success: true,
      txid,
      output: stdout,
    });

  } catch (error) {
    // Log error but redact sensitive info
    const rawError = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API:send] ERROR (redacted):', rawError.replace(/--wallet-key\s+"[^"]+"/g, '--wallet-key "[REDACTED]"'));

    let errorMessage = 'Transaction failed';
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();

      // Parse common alkanes-cli errors into user-friendly messages
      if (msg.includes('insufficient funds') || msg.includes('not enough')) {
        errorMessage = 'Insufficient funds for this transaction';
      } else if (msg.includes('no clean utxos') || msg.includes('no utxos')) {
        errorMessage = 'No spendable UTXOs available (all may have inscriptions/runes/alkanes)';
      } else if (msg.includes('invalid address') || (msg.includes('address') && msg.includes('invalid'))) {
        errorMessage = 'Invalid recipient address';
      } else if (msg.includes('invalid checksum') || msg.includes('bech32') || msg.includes('hrp') ||
                 msg.includes('address resolution') || msg.includes('addresstoolong') || msg.includes('addresstooshort')) {
        errorMessage = 'Invalid recipient address format';
      } else if (msg.includes('invalid mnemonic')) {
        errorMessage = 'Invalid wallet mnemonic. Please reconnect your wallet.';
      } else if (msg.includes('timeout')) {
        errorMessage = 'Transaction timed out. Please try again.';
      } else if (msg.includes('connection refused') || msg.includes('econnrefused')) {
        errorMessage = 'Cannot connect to Bitcoin node. Please check if the node is running.';
      } else {
        // Try to extract a clean error message from CLI output
        // Look for the final "Error: ..." line (not log lines with timestamps)
        // CLI errors look like: "Error: Wallet error: Some message"
        const lines = error.message.split('\n');
        for (const line of lines) {
          // Skip log lines (they have timestamps like [2025-12-03T...])
          if (line.includes('[20') && line.includes('Z ')) continue;
          // Skip lines that are just the command
          if (line.includes('Command failed:')) continue;

          // Look for actual error lines
          const errorMatch = line.match(/^Error:\s*(.+)/i);
          if (errorMatch) {
            let extracted = errorMatch[1].trim();
            // Remove wallet error prefix
            extracted = extracted.replace(/^Wallet error:\s*/i, '');
            // Limit length
            if (extracted.length > 100) {
              extracted = extracted.substring(0, 100) + '...';
            }
            if (extracted.length > 0) {
              errorMessage = extracted;
              break;
            }
          }
        }
      }
    }

    return NextResponse.json(
      {
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
