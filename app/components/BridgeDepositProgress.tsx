'use client';

import { Globe } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

interface DepositTransaction {
  id: string;
  status: 'pendingAlkane' | 'processingAlkane' | 'broadcastedAlkane' | 'completedAlkane' | 'failedAlkane';
  amount: string;
  from_address: string;
  tx_id: string; // Ethereum tx hash
  destination_tx_id?: string; // Bitcoin tx hash
  token_type: 'USDC' | 'USDT';
  created_at?: string;
}

interface BridgeDepositProgressProps {
  deposits: DepositTransaction[];
  onDepositClick?: (deposit: DepositTransaction) => void;
}

export default function BridgeDepositProgress({ deposits, onDepositClick }: BridgeDepositProgressProps) {
  const { network } = useWallet();
  const config = getConfig(network);

  if (!deposits || deposits.length === 0) {
    return (
      <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-6 text-center backdrop-blur-md">
        <div className="flex flex-col items-center gap-3">
          <div className="rounded-full bg-[color:var(--sf-primary)]/10 p-4">
            <svg className="h-8 w-8 text-[color:var(--sf-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-[color:var(--sf-text)]">No incoming deposits</p>
            <p className="mt-1 text-sm text-[color:var(--sf-text)]/60">
              Your deposits will appear here once detected
            </p>
          </div>
        </div>
      </div>
    );
  }

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pendingAlkane':
        return {
          label: 'Confirming on Ethereum',
          progress: 25,
          color: 'blue',
          message: 'Waiting for Ethereum confirmation...',
        };
      case 'processingAlkane':
        return {
          label: 'Creating mint transaction',
          progress: 50,
          color: 'blue',
          message: 'Mint transaction created...',
        };
      case 'broadcastedAlkane':
        return {
          label: 'Broadcasting to Bitcoin',
          progress: 75,
          color: 'blue',
          message: 'Mint transaction sent to mempool...',
        };
      case 'completedAlkane':
        return {
          label: 'Completed',
          progress: 100,
          color: 'green',
          message: 'bUSD received!',
        };
      case 'failedAlkane':
        return {
          label: 'Failed',
          progress: 0,
          color: 'red',
          message: 'Transaction failed. Please contact support.',
        };
      default:
        return {
          label: 'Processing',
          progress: 10,
          color: 'blue',
          message: 'Processing deposit...',
        };
    }
  };

  const getProgressBarColor = (color: string) => {
    switch (color) {
      case 'green':
        return 'bg-green-500';
      case 'red':
        return 'bg-red-500';
      case 'blue':
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div className="space-y-3">
      {deposits.map((deposit) => {
        const statusInfo = getStatusInfo(deposit.status);
        const ethTxUrl = `${config.BLOCK_EXPLORER_URL_ETH}/tx/${deposit.tx_id}`;
        const btcTxUrl = deposit.destination_tx_id
          ? `${config.BLOCK_EXPLORER_URL_BTC}/tx/${deposit.destination_tx_id}`
          : null;
        const amount = parseFloat(deposit.amount) / 1e6;

        return (
          <div
            key={deposit.id}
            className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-5 backdrop-blur-md transition-all hover:shadow-lg cursor-pointer"
            onClick={() => onDepositClick?.(deposit)}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-[color:var(--sf-text)]">
                  {amount.toFixed(2)} {deposit.token_type} → bUSD
                </h3>
                <p className="mt-1 text-sm text-[color:var(--sf-text)]/60">
                  Est. arrival time ~15-30 mins
                </p>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
                statusInfo.color === 'green' ? 'bg-green-500/10 text-green-600' :
                statusInfo.color === 'red' ? 'bg-red-500/10 text-red-600' :
                'bg-blue-500/10 text-blue-600'
              }`}>
                {statusInfo.label}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className={`h-full transition-all duration-500 ${getProgressBarColor(statusInfo.color)} ${
                    statusInfo.progress < 100 && statusInfo.progress > 0 ? 'animate-pulse' : ''
                  }`}
                  style={{ width: `${statusInfo.progress}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs">
                <span className={`font-semibold ${
                  statusInfo.color === 'green' ? 'text-green-600' :
                  statusInfo.color === 'red' ? 'text-red-600' :
                  'text-blue-600'
                }`}>
                  {deposit.token_type} sent
                </span>
                <span className="text-[color:var(--sf-text)]/60">
                  bUSD {statusInfo.progress === 100 ? 'received' : 'pending'}
                </span>
              </div>
            </div>

            {/* Transaction Steps */}
            <div className="space-y-3">
              {/* Step 1: Ethereum */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-[color:var(--sf-text)]/80">
                    <span className="font-medium">1. Sent {amount.toFixed(2)} {deposit.token_type}</span> on Ethereum
                  </p>
                  <p className="mt-1 font-mono text-xs text-[color:var(--sf-text)]/60">
                    {deposit.from_address?.slice(0, 10)}...{deposit.from_address?.slice(-8)}
                  </p>
                </div>
                <a
                  href={ethTxUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--sf-outline)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all hover:border-[color:var(--sf-primary)]/40 hover:shadow-md"
                >
                  <Globe size={14} />
                  Etherscan
                </a>
              </div>

              {/* Step 2: Bitcoin */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-[color:var(--sf-text)]/80">
                    <span className="font-medium">2. Mint bUSD</span> on Bitcoin
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--sf-text)]/60">
                    {statusInfo.message}
                  </p>
                </div>
                {btcTxUrl ? (
                  <a
                    href={btcTxUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--sf-outline)] bg-white px-3 py-1.5 text-xs font-semibold text-[color:var(--sf-text)] transition-all hover:border-[color:var(--sf-primary)]/40 hover:shadow-md"
                  >
                    <Globe size={14} />
                    {network === 'signet' ? 'Mempool' : 'Ordiscan'}
                  </a>
                ) : (
                  <button
                    disabled
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--sf-outline)] bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-400 cursor-not-allowed opacity-50"
                  >
                    <Globe size={14} />
                    {network === 'signet' ? 'Mempool' : 'Ordiscan'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
