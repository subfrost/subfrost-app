'use client';

/**
 * CrossChainBridgePanel -- Main cross-chain bridge UI.
 *
 * Replaces the normal swap form when `isCrossChainSwap` is true.
 * Handles all 6 cross-chain paths:
 *   BTC <-> ETH, BTC <-> ZEC, ETH <-> ZEC
 *
 * Each path routes through frAssets and synth pools on Bitcoin:
 *   e.g. ETH -> frETH -> (swap) -> frBTC -> BTC
 *
 * Destination address handling:
 *   - BTC: auto-filled from connected wallet taproot address
 *   - ETH: manual 0x address input (or future MetaMask auto-fill)
 *   - ZEC: derived t-address from keystore mnemonic, with override toggle
 *
 * JOURNAL (2026-03-27): Initial implementation.
 * Pattern follows BridgeDepositFlow.tsx for quote display and step flow.
 * Uses sf-* design system classes exclusively -- no raw borders on cards.
 */

import React, { useState, useMemo, useCallback } from 'react';
import { ArrowRight, AlertCircle, Check, Loader2, X, Fuel, ChevronDown, ChevronUp } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { deriveZcashAddress, toZcashNetwork } from '@/lib/zcash/address';

// ---- Types ----

interface CrossChainBridgePanelProps {
  fromChain: string;  // 'btc' | 'eth' | 'zec'
  toChain: string;
  onClose?: () => void;
}

type BridgeStep = 'input' | 'confirm' | 'processing' | 'complete' | 'error';

// ---- Route helper ----

function getBridgeSteps(from: string, to: string): string[] {
  const routes: Record<string, string[]> = {
    'btc-eth': ['BTC', 'frBTC', 'frETH', 'ETH'],
    'eth-btc': ['ETH', 'frETH', 'frBTC', 'BTC'],
    'btc-zec': ['BTC', 'frBTC', 'frZEC', 'ZEC'],
    'zec-btc': ['ZEC', 'frZEC', 'frBTC', 'BTC'],
    'eth-zec': ['ETH', 'frETH', 'frBTC', 'frZEC', 'ZEC'],
    'zec-eth': ['ZEC', 'frZEC', 'frBTC', 'frETH', 'ETH'],
  };
  return routes[`${from}-${to}`] || [from.toUpperCase(), to.toUpperCase()];
}

function formatChainLabel(chain: string): string {
  return chain.toUpperCase();
}

// ---- Component ----

export function CrossChainBridgePanel({
  fromChain,
  toChain,
  onClose,
}: CrossChainBridgePanelProps) {
  // State
  const [amount, setAmount] = useState('');
  const [customZecAddress, setCustomZecAddress] = useState('');
  const [useCustomZecAddr, setUseCustomZecAddr] = useState(false);
  const [ethRecipient, setEthRecipient] = useState('');
  const [step, setStep] = useState<BridgeStep>('input');
  const [errorMessage, setErrorMessage] = useState('');
  // ETH gas provisioning — when bridging TO eth/stables
  const [ethSplitEnabled, setEthSplitEnabled] = useState(false);
  const [ethSplitPct, setEthSplitPct] = useState(5); // default 5%
  const [showEthSplitDetails, setShowEthSplitDetails] = useState(false);

  const { account, network, isConnected, walletType } = useWallet();

  const taprootAddress = account?.taproot?.address;
  const segwitAddress = account?.nativeSegwit?.address;

  // Derive ZEC address from keystore mnemonic
  const walletZecAddress = useMemo(() => {
    try {
      const mnemonic =
        typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem('subfrost_session_mnemonic')
          : null;
      if (!mnemonic) return null;
      const zecNet = toZcashNetwork(network || 'devnet');
      return deriveZcashAddress(mnemonic, zecNet).address;
    } catch {
      return null;
    }
  }, [network]);

  // Destination address based on target chain
  const destinationAddress = useMemo(() => {
    if (toChain === 'btc') return taprootAddress || '';
    if (toChain === 'eth') return ethRecipient;
    if (toChain === 'zec')
      return useCustomZecAddr ? customZecAddress : walletZecAddress || '';
    return '';
  }, [toChain, taprootAddress, ethRecipient, useCustomZecAddr, customZecAddress, walletZecAddress]);

  // Validation
  const addressError = useMemo(() => {
    if (!destinationAddress) return null; // Not filled yet, no error shown
    if (toChain === 'eth' && !/^0x[0-9a-fA-F]{40}$/.test(destinationAddress)) {
      return 'Invalid ETH address. Must be 0x-prefixed with 40 hex characters.';
    }
    if (toChain === 'zec') {
      if (destinationAddress.startsWith('zs') || destinationAddress.startsWith('zc')) {
        return 'Shielded z-addresses are not supported. Use a transparent t-address.';
      }
      if (!/^t[123m]/.test(destinationAddress)) {
        return 'Invalid ZEC address. Must start with t1, t3, tm, or t2.';
      }
    }
    return null;
  }, [toChain, destinationAddress]);

  const parsedAmount = parseFloat(amount);
  const hasValidAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const canSubmit =
    hasValidAmount &&
    !!destinationAddress &&
    !addressError &&
    step === 'input' &&
    isConnected;

  const bridgeRoute = useMemo(
    () => getBridgeSteps(fromChain, toChain),
    [fromChain, toChain],
  );

  // Handlers
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return;
    setStep('confirm');
    // In a full implementation this would call the appropriate bridge mutation
    // (useBridgeZecMutation or useBridgeEthMutation) depending on the route.
    const ethSplitBps = ethSplitEnabled ? ethSplitPct * 100 : 0; // pct → bps
    console.log('[CrossChainBridgePanel] Submit:', {
      fromChain,
      toChain,
      amount,
      destinationAddress,
      ethSplitBps,
    });
  }, [canSubmit, fromChain, toChain, amount, destinationAddress]);

  const handleReset = useCallback(() => {
    setStep('input');
    setErrorMessage('');
  }, []);

  // Button label
  const buttonLabel = useMemo(() => {
    if (!isConnected) return 'Connect Wallet';
    if (step === 'confirm') return 'Confirming...';
    if (step === 'processing') return 'Processing bridge...';
    if (step === 'complete') return 'Complete';
    if (step === 'error') return 'Retry';
    if (!hasValidAmount) return 'Enter amount';
    if (!destinationAddress) {
      if (toChain === 'eth') return 'Enter ETH address';
      if (toChain === 'zec') return 'Enter ZEC address';
      return 'Connect wallet';
    }
    if (addressError) return 'Fix address';
    return `Swap ${formatChainLabel(fromChain)} to ${formatChainLabel(toChain)}`;
  }, [isConnected, step, hasValidAmount, destinationAddress, toChain, addressError, fromChain]);

  // ---- Render ----

  return (
    <div className="sf-card p-0 overflow-hidden">
      {/* Header */}
      <div className="sf-card-header">
        <h3 className="text-base font-bold text-[color:var(--sf-text)]">
          Cross-Chain Swap
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[color:var(--sf-text)]/60">
            {formatChainLabel(fromChain)} {'\u2192'} {formatChainLabel(toChain)}
          </span>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors"
            >
              <X size={16} className="text-[color:var(--sf-text)]/60" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Bridge path visualization */}
        <div className="sf-panel p-3">
          <label className="text-[10px] font-bold tracking-wider uppercase text-[color:var(--sf-text)]/50 mb-2 block">
            Route
          </label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {bridgeRoute.map((routeStep, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <ArrowRight
                    size={12}
                    className="text-[color:var(--sf-primary)]/60 flex-shrink-0"
                  />
                )}
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md ${
                    i === 0 || i === bridgeRoute.length - 1
                      ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                      : 'bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/60'
                  }`}
                >
                  {routeStep}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Amount input */}
        <div className="sf-panel p-3">
          <label className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-1.5 block">
            You Send ({formatChainLabel(fromChain)})
          </label>
          <input
            className="sf-input w-full text-2xl font-bold"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={step !== 'input'}
          />
        </div>

        {/* Destination address -- varies by target chain */}
        <div className="sf-panel p-3">
          <label className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-1.5 block">
            Receive at ({formatChainLabel(toChain)} address)
          </label>

          {toChain === 'btc' && (
            <div className="sf-input p-3 text-sm font-mono truncate text-[color:var(--sf-text)]/80">
              {taprootAddress || 'Connect wallet'}
            </div>
          )}

          {toChain === 'eth' && (
            <input
              className="sf-input w-full text-sm font-mono"
              placeholder="0x... Ethereum address"
              value={ethRecipient}
              onChange={(e) => setEthRecipient(e.target.value)}
              disabled={step !== 'input'}
            />
          )}

          {toChain === 'zec' && (
            <>
              {useCustomZecAddr ? (
                <input
                  className="sf-input w-full text-sm font-mono"
                  placeholder="t1... or t3... address"
                  value={customZecAddress}
                  onChange={(e) => setCustomZecAddress(e.target.value)}
                  disabled={step !== 'input'}
                />
              ) : (
                <div className="sf-input p-3 text-sm font-mono truncate text-[color:var(--sf-text)]/80">
                  {walletZecAddress || 'No ZEC address (create keystore wallet)'}
                </div>
              )}
              <label className="flex items-center gap-2 mt-2 text-xs text-[color:var(--sf-text)]/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useCustomZecAddr}
                  onChange={(e) => setUseCustomZecAddr(e.target.checked)}
                  className="rounded"
                />
                Send to a different address
              </label>
            </>
          )}

          {/* Address validation error */}
          {addressError && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
              <AlertCircle size={12} className="flex-shrink-0" />
              <span>{addressError}</span>
            </div>
          )}
        </div>

        {/* ETH Gas Provisioning — shown when target is ETH/stables */}
        {toChain === 'eth' && hasValidAmount && step === 'input' && (
          <div className="sf-panel p-0 overflow-hidden">
            <button
              className="sf-collapsible-trigger w-full flex items-center justify-between p-3"
              onClick={() => setShowEthSplitDetails(!showEthSplitDetails)}
            >
              <div className="flex items-center gap-2">
                <Fuel size={14} className="text-[color:var(--sf-primary)]" />
                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60">
                  ETH for Gas
                </span>
                {ethSplitEnabled && (
                  <span className="sf-badge-apy text-[10px]">
                    {ethSplitPct}%
                  </span>
                )}
              </div>
              {showEthSplitDetails
                ? <ChevronUp size={14} className="text-[color:var(--sf-text)]/40" />
                : <ChevronDown size={14} className="text-[color:var(--sf-text)]/40" />
              }
            </button>

            {showEthSplitDetails && (
              <div className="px-3 pb-3 space-y-3 border-t border-[color:var(--sf-outline)]/10">
                {/* Toggle */}
                <label className="flex items-center justify-between pt-3 cursor-pointer select-none">
                  <span className="text-xs text-[color:var(--sf-text)]/80">
                    Receive some ETH for gas fees
                  </span>
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${
                      ethSplitEnabled ? 'bg-[color:var(--sf-primary)]' : 'bg-[color:var(--sf-surface)]'
                    }`}
                    onClick={() => setEthSplitEnabled(!ethSplitEnabled)}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        ethSplitEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </label>

                {ethSplitEnabled && (
                  <>
                    {/* Percentage selector */}
                    <div>
                      <label className="text-[10px] font-bold tracking-wider uppercase text-[color:var(--sf-text)]/50 mb-1.5 block">
                        Portion swapped to ETH
                      </label>
                      <div className="flex items-center gap-2">
                        {[2, 5, 10, 20].map((pct) => (
                          <button
                            key={pct}
                            className={`sf-percent-btn-pill ${
                              ethSplitPct === pct
                                ? 'bg-[color:var(--sf-primary)] text-white'
                                : ''
                            }`}
                            onClick={() => setEthSplitPct(pct)}
                          >
                            {pct}%
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={50}
                          className="sf-pill-input"
                          value={ethSplitPct}
                          onChange={(e) => {
                            const v = Math.min(50, Math.max(1, parseInt(e.target.value) || 5));
                            setEthSplitPct(v);
                          }}
                        />
                        <span className="text-xs text-[color:var(--sf-text)]/50">%</span>
                      </div>
                    </div>

                    {/* Estimated breakdown */}
                    <div className="sf-panel p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[color:var(--sf-text)]/50">USDC received</span>
                        <span className="font-mono text-[color:var(--sf-text)]/80">
                          ~${(parsedAmount * (100 - ethSplitPct) / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[color:var(--sf-text)]/50">ETH received</span>
                        <span className="font-mono text-[color:var(--sf-primary)]">
                          ~{(parsedAmount * ethSplitPct / 100 / 3333).toFixed(4)} ETH
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[color:var(--sf-text)]/50">Covers approx.</span>
                        <span className="font-mono text-[color:var(--sf-text)]/80">
                          ~{Math.floor(parsedAmount * ethSplitPct / 100 / 3333 / 0.001)} txs
                        </span>
                      </div>
                    </div>

                    {/* Info note */}
                    <div className="sf-alert sf-alert-blue text-[10px]">
                      <div className="flex items-start gap-1.5">
                        <AlertCircle size={10} className="flex-shrink-0 mt-0.5" />
                        <span>
                          A portion of your USDC output is swapped to ETH via Uniswap
                          so you have gas for your first transactions. Swap has a 0.3% DEX fee.
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Fee / info notice */}
        {hasValidAmount && bridgeRoute.length > 3 && (
          <div className="sf-alert sf-alert-blue text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>
                This route passes through {bridgeRoute.length - 2} intermediate
                steps. Each step incurs a small protocol fee.
              </span>
            </div>
          </div>
        )}

        {/* Step feedback */}
        {step === 'processing' && (
          <div className="flex items-center justify-center gap-2 py-3 text-sm text-[color:var(--sf-primary)]">
            <Loader2 size={16} className="animate-spin" />
            <span>Processing bridge transaction...</span>
          </div>
        )}

        {step === 'complete' && (
          <div className="sf-alert sf-alert-green text-sm">
            <div className="flex items-center gap-2">
              <Check size={16} />
              <span>
                Bridge complete. {formatChainLabel(toChain)} sent to{' '}
                <span className="font-mono text-xs">
                  {destinationAddress.slice(0, 12)}...
                  {destinationAddress.slice(-6)}
                </span>
              </span>
            </div>
          </div>
        )}

        {step === 'error' && errorMessage && (
          <div className="sf-alert sf-alert-red text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Action button */}
        <button
          className="sf-btn-primary w-full"
          disabled={!canSubmit && step === 'input'}
          onClick={step === 'error' ? handleReset : handleSubmit}
        >
          {step === 'processing' && (
            <Loader2 size={16} className="animate-spin mr-2 inline" />
          )}
          {step === 'complete' && <Check size={16} className="mr-2 inline" />}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

export default CrossChainBridgePanel;
