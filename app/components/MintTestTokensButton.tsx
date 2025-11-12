'use client';

import { useState } from 'react';
import { Coins } from 'lucide-react';

export default function MintTestTokensButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [mintResult, setMintResult] = useState<string | null>(null);

  const handleMint = async () => {
    setIsMinting(true);
    setMintResult(null);

    try {
      // In regtest mode, we need to:
      // 1. Get connected wallet address
      // 2. Call Bitcoin regtest RPC to send BTC and mine blocks
      // 3. Mint Alkane tokens via OYL API or direct protocol calls
      
      // For now, this provides instructions to the user
      setMintResult(
        '💡 To mint test tokens in regtest:\n\n' +
        '1. Fund your wallet:\n' +
        '   bitcoin-cli -regtest sendtoaddress <your_address> 1.0\n\n' +
        '2. Mine blocks:\n' +
        '   bitcoin-cli -regtest generatetoaddress 6 <address>\n\n' +
        '3. Use OYL SDK to mint alkane tokens via protocol operations\n\n' +
        'See docs/REGTEST_SETUP.md for detailed instructions.'
      );
      
      // TODO: Implement automated minting when OYL API endpoints are available
      // This would require:
      // - Getting wallet address from context
      // - Calling local Bitcoin RPC to fund wallet
      // - Calling OYL API to mint tokens
      // - Mining blocks to confirm
      
    } catch (error) {
      setMintResult('❌ Failed to mint tokens. Check console for details.');
      console.error('Mint error:', error);
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
            
            <p className="text-sm text-[color:var(--sf-text)]/70 mb-6">
              This will mint test tokens to your connected wallet for testing purposes. Only available in regtest mode.
            </p>

            <div className="space-y-3 mb-6">
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
                  disabled={isMinting}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed sf-focus-ring"
                >
                  {isMinting ? 'Loading...' : 'Show Instructions'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
