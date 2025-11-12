'use client';

import { useState } from 'react';
import { Coins } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';

export default function MintTestTokensButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintResult, setMintResult] = useState<string | null>(null);
  const { address, isConnected } = useWallet() as any;

  const handleMint = async () => {
    if (!isConnected || !address) {
      setMintResult('❌ Please connect your wallet first');
      return;
    }

    setIsMinting(true);
    setMintResult(null);

    try {
      console.log('Minting tokens for address:', address);
      
      // Call the mint API endpoint
      const response = await fetch('/api/regtest/mint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: address,
          tokens: {
            btc: 1.0,
            diesel: 1000,
            frbtc: 10,
            busd: 10000,
          }
        }),
      });

      console.log('Mint API response status:', response.status);

      let data;
      try {
        data = await response.json();
        console.log('Mint API response data:', data);
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError);
        throw new Error('Invalid response from mint API');
      }

      if (!response.ok) {
        const errorMsg = data.error || data.details || 'Failed to mint tokens';
        console.error('Mint API error:', data);
        throw new Error(errorMsg);
      }

      setMintResult(
        `✅ Successfully minted tokens!\n\n` +
        `Address: ${address.slice(0, 8)}...${address.slice(-6)}\n\n` +
        `Minted:\n` +
        `- 1.0 BTC\n` +
        `- 1,000 DIESEL\n` +
        `- 10 frBTC\n` +
        `- 10,000 bUSD\n\n` +
        `${data.blocksGenerated ? `Mined ${data.blocksGenerated} blocks\n` : ''}` +
        `\nRefresh your wallet to see the new balance!`
      );

      // Auto-close after 5 seconds
      setTimeout(() => {
        setIsOpen(false);
        setMintResult(null);
      }, 5000);
      
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      console.error('Mint error:', error);
      
      // Check if we have setup instructions from the API
      if (errorMsg.includes('Bitcoin regtest node is not running') || 
          errorMsg.includes('not running') ||
          data?.setup) {
        setMintResult(
          `⚠️ Bitcoin regtest node not running\n\n` +
          `The automated minting requires Bitcoin Core.\n\n` +
          `Quick setup:\n` +
          `1. Install Bitcoin Core\n` +
          `2. Run: bitcoind -regtest -daemon\n` +
          `3. Create wallet and generate blocks\n\n` +
          `See docs/REGTEST_SETUP.md for details.\n\n` +
          `Note: You can still use the app without this!`
        );
      } else {
        setMintResult(
          `❌ Failed to mint tokens\n\n` +
          `Error: ${errorMsg}\n\n` +
          `Check:\n` +
          `- Bitcoin regtest node is running\n` +
          `- RPC credentials in .env.local\n` +
          `- Server logs for details`
        );
      }
    } finally {
      setIsMinting(false);
    }
  };

  const isRegtest = typeof window !== 'undefined' && 
    (process.env.NEXT_PUBLIC_NETWORK === 'regtest' || window.location.host.startsWith('localhost'));

  if (!isRegtest) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold tracking-wider uppercase bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors sf-focus-ring"
        title="Mint test tokens (Regtest only)"
      >
        <Coins size={14} />
        MINT TOKENS
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[color:var(--sf-glass-bg)] backdrop-blur-md border border-[color:var(--sf-glass-border)] rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h2 className="text-xl font-bold text-[color:var(--sf-text)] mb-4">
              Mint Test Tokens
            </h2>
            
            {!isConnected ? (
              <p className="text-sm text-[color:var(--sf-text)]/70 mb-6 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                ⚠️ Please connect your wallet first to mint tokens.
              </p>
            ) : (
              <p className="text-sm text-[color:var(--sf-text)]/70 mb-6">
                This will mint test tokens to your connected wallet: <br />
                <span className="font-mono text-xs">{address?.slice(0, 8)}...{address?.slice(-6)}</span>
              </p>
            )}

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-sm font-medium text-[color:var(--sf-text)]">BTC</span>
                <span className="text-sm text-[color:var(--sf-text)]/70">1.0 BTC</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-sm font-medium text-[color:var(--sf-text)]">DIESEL</span>
                <span className="text-sm text-[color:var(--sf-text)]/70">1,000 tokens</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-sm font-medium text-[color:var(--sf-text)]">frBTC</span>
                <span className="text-sm text-[color:var(--sf-text)]/70">10 tokens</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <span className="text-sm font-medium text-[color:var(--sf-text)]">bUSD</span>
                <span className="text-sm text-[color:var(--sf-text)]/70">10,000 tokens</span>
              </div>
            </div>

            {mintResult && (
              <div className="mb-4 p-3 bg-white/5 rounded-lg text-xs text-[color:var(--sf-text)] whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                {mintResult}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setMintResult(null);
                }}
                disabled={isMinting}
                className="flex-1 px-4 py-2 text-sm font-semibold text-[color:var(--sf-text)] bg-white/10 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed sf-focus-ring"
              >
                {mintResult ? 'Close' : 'Cancel'}
              </button>
              {!mintResult && (
                <button
                  type="button"
                  onClick={handleMint}
                  disabled={isMinting || !isConnected}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed sf-focus-ring"
                >
                  {isMinting ? 'Minting...' : 'Mint Tokens'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
