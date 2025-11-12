'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check, Wallet, Smartphone, Clock } from 'lucide-react';
import { useEthereumWallet } from '@/context/EthereumWalletContext';
import { useBridgeMintMutation } from '@/hooks/useBridgeMintMutation';
import { useBoundMappedAddress } from '@/hooks/useBoundMappedAddress';
import { useWallet } from '@/context/WalletContext';

interface BridgeDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenType: 'USDT' | 'USDC';
  amount: string;
  targetToken?: string; // If set, this is a multi-hop swap (bridge + swap to target)
  onSuccess?: (txHash: string) => void;
}

export default function BridgeDepositModal({
  isOpen,
  onClose,
  tokenType,
  amount,
  targetToken,
  onSuccess,
}: BridgeDepositModalProps) {
  const [copied, setCopied] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(3600); // 1 hour in seconds
  const { address: btcAddress, network } = useWallet();
  const { data: boundEthAddress, isLoading: isLoadingAddress } = useBoundMappedAddress(btcAddress);
  const { isConnected: isEthConnected, connect: connectEth } = useEthereumWallet();
  const bridgeMintMutation = useBridgeMintMutation();

  // Countdown timer
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // Reset timer when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeRemaining(3600); // Reset to 1 hour
    }
  }, [isOpen]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  };

  if (!isOpen) return null;

  const handleCopyAddress = async () => {
    if (!boundEthAddress) return;
    await navigator.clipboard.writeText(boundEthAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMetaMaskTransfer = async () => {
    if (!isEthConnected) {
      await connectEth();
      return;
    }

    setIsTransferring(true);
    try {
      const result = await bridgeMintMutation.mutateAsync({
        tokenType,
        amount,
      });

      if (result.success && result.txHash) {
        onSuccess?.(result.txHash);
      }
    } catch (error: any) {
      console.error('Transfer failed:', error);
      alert(error?.message || 'Transfer failed. Please try again.');
    } finally {
      setIsTransferring(false);
    }
  };

  const handleWalletConnect = async () => {
    try {
      await connectEth('walletconnect');
      // After connection, proceed with transfer using same logic as MetaMask
      if (!boundEthAddress) {
        throw new Error('Deposit address not available');
      }
      
      setIsTransferring(true);
      const result = await bridgeMintMutation.mutateAsync({
        tokenType,
        amount,
      });
      
      if (result.success && result.txHash) {
        onSuccess?.(result.txHash);
      }
    } catch (err: any) {
      console.error('WalletConnect failed:', err);
      window.alert(err.message || 'WalletConnect connection failed. Please try MetaMask or use the QR code.');
    } finally {
      setIsTransferring(false);
    }
  };

  const networkName = network === 'signet' ? 'Sepolia Testnet' : 'Ethereum Mainnet';
  const estimatedTime = '~15-30 minutes';
  const expiryTime = 'No expiry';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-2xl backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[color:var(--sf-glass-border)] p-6 pb-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">
              {targetToken ? `Swap ${tokenType} → ${targetToken}` : `Bridge ${tokenType} → bUSD`}
            </h2>
            <p className="mt-1 text-sm text-[color:var(--sf-text)]/60">
              {targetToken 
                ? `Deposit ${amount} ${tokenType} (will bridge to bUSD, then swap to ${targetToken})`
                : `Deposit ${amount} ${tokenType} to receive bUSD`}
            </p>
            {/* Countdown Timer */}
            <div className="mt-2 flex items-center gap-2">
              <Clock size={14} className={timeRemaining < 300 ? 'text-orange-500' : 'text-[color:var(--sf-text)]/60'} />
              <span className={`text-xs font-semibold ${timeRemaining < 300 ? 'text-orange-500' : 'text-[color:var(--sf-text)]/60'}`}>
                Deposit valid for: {formatTime(timeRemaining)}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[color:var(--sf-text)]/60 transition-colors hover:bg-black/10 hover:text-[color:var(--sf-text)]"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Quick Transfer Options - Stacked */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/70 mb-3">
              Quick Transfer (Optional)
            </h3>
            
            {/* MetaMask Button - Full Width */}
            <button
              onClick={handleMetaMaskTransfer}
              disabled={isTransferring || isLoadingAddress}
              className="w-full flex items-center gap-4 rounded-xl border-2 border-[color:var(--sf-outline)] bg-white px-5 py-4 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-white/95 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--sf-primary)]/10 flex-shrink-0">
                <Wallet size={24} className="text-[color:var(--sf-primary)]" />
              </div>
              <div className="flex flex-col items-start text-left flex-1">
                <span className="text-base font-bold text-[color:var(--sf-text)]">
                  {isTransferring ? 'Processing...' : isEthConnected ? 'Transfer with MetaMask' : 'Connect MetaMask'}
                </span>
                <span className="text-xs text-[color:var(--sf-text)]/60">
                  One-click transfer from browser wallet
                </span>
              </div>
            </button>

            {/* WalletConnect Button - Full Width */}
            <button
              onClick={handleWalletConnect}
              className="w-full flex items-center gap-4 rounded-xl border-2 border-[color:var(--sf-outline)] bg-white px-5 py-4 transition-all hover:border-[color:var(--sf-primary)]/40 hover:bg-white/95 hover:shadow-lg"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[color:var(--sf-primary)]/10 flex-shrink-0">
                <Smartphone size={24} className="text-[color:var(--sf-primary)]" />
              </div>
              <div className="flex flex-col items-start text-left flex-1">
                <span className="text-base font-bold text-[color:var(--sf-text)]">
                  Transfer with WalletConnect
                </span>
                <span className="text-xs text-[color:var(--sf-text)]/60">
                  Use mobile wallet or other dapps
                </span>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[color:var(--sf-glass-border)]" />
            <span className="text-xs font-semibold uppercase text-[color:var(--sf-text)]/50">
              Or transfer manually
            </span>
            <div className="flex-1 h-px bg-[color:var(--sf-glass-border)]" />
          </div>

          {/* QR Code Section */}
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-[color:var(--sf-glass-border)] bg-white/5 p-6">
              {/* QR Code */}
              {isLoadingAddress ? (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg bg-white">
                  <div className="text-sm text-gray-500">Loading...</div>
                </div>
              ) : boundEthAddress ? (
                <div className="rounded-lg bg-white p-4">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${boundEthAddress}`}
                    alt="Deposit address QR code"
                    className="h-[200px] w-[200px]"
                  />
                </div>
              ) : (
                <div className="flex h-[200px] w-[200px] items-center justify-center rounded-lg bg-white">
                  <div className="text-sm text-gray-500">Address unavailable</div>
                </div>
              )}

              {/* Network Badge */}
              <div className="inline-flex items-center rounded-full border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 py-1">
                <span className="text-xs font-semibold text-[color:var(--sf-text)]">
                  {networkName}
                </span>
              </div>
            </div>

            {/* Deposit Address */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-[color:var(--sf-text)]/70">
                Deposit Address
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-4 py-3">
                  <code className="break-all text-sm font-mono text-[color:var(--sf-text)]">
                    {isLoadingAddress ? 'Loading...' : boundEthAddress || 'N/A'}
                  </code>
                </div>
                <button
                  onClick={handleCopyAddress}
                  disabled={!boundEthAddress}
                  className="rounded-xl border-2 border-[color:var(--sf-outline)] bg-white px-4 py-3 transition-all hover:border-[color:var(--sf-primary)]/40 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copied ? (
                    <Check size={20} className="text-green-600" />
                  ) : (
                    <Copy size={20} className="text-[color:var(--sf-text)]" />
                  )}
                </button>
              </div>
            </div>

            {/* Amount to Send */}
            <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[color:var(--sf-text)]/70">
                  Amount to send:
                </span>
                <span className="text-lg font-bold text-[color:var(--sf-text)]">
                  {amount} {tokenType}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-[color:var(--sf-text)]/60">You will receive:</span>
                <span className="font-semibold text-[color:var(--sf-text)]/80">
                  ~{amount} bUSD
                </span>
              </div>
            </div>
          </div>

          {/* Important Info */}
          <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white">
                i
              </div>
              <div className="flex-1 space-y-2 text-sm text-[color:var(--sf-text)]/80">
                <div className="flex justify-between">
                  <span className="font-medium">Estimated arrival time:</span>
                  <span className="font-semibold text-[color:var(--sf-text)]">{estimatedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Deposit validity:</span>
                  <span className="font-semibold text-[color:var(--sf-text)]">{expiryTime}</span>
                </div>
                <p className="pt-2 text-xs leading-relaxed text-[color:var(--sf-text)]/60">
                  Send exactly <strong>{amount} {tokenType}</strong> to the address above. 
                  Your bUSD will arrive automatically after Ethereum confirmation (~{estimatedTime}). 
                  You can close this window and check progress in the Activity page.
                </p>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
            <p className="text-xs leading-relaxed text-[color:var(--sf-text)]/70">
              ⚠️ <strong>Only send {tokenType}</strong> on {networkName}. 
              Sending other tokens or using a different network will result in loss of funds.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-[color:var(--sf-glass-border)] p-6 pt-4">
          <button
            onClick={onClose}
            className="rounded-xl border-2 border-[color:var(--sf-outline)] bg-white px-6 py-2.5 text-sm font-semibold text-[color:var(--sf-text)] transition-all hover:bg-white/90 hover:shadow-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
