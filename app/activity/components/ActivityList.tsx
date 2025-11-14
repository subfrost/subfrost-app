'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import TransactionCard from './TransactionCard';
import type { Transaction, TransactionType } from '../types';
import { useAddressTransactions } from '@/hooks/useAddressTransactions';
import { useBridgeDepositHistory } from '@/hooks/useBridgeDepositHistory';
import BridgeDepositProgress from '@/app/components/BridgeDepositProgress';

type FilterType = 'All' | TransactionType | 'Bridge';

export default function ActivityList() {
  const { isConnected, address, network } = useWallet();
  const [filter, setFilter] = useState<FilterType>('All');
  const [useMockData, setUseMockData] = useState(true); // Toggle for testing

  // Fetch real transactions from mempool
  const { data: realTransactions = [], isLoading } = useAddressTransactions(
    isConnected ? address : undefined,
    network
  );

  // Fetch bridge deposit history
  const { data: bridgeData } = useBridgeDepositHistory(isConnected ? address : undefined);
  const incomingBridgeDeposits = bridgeData?.incoming || [];

  // Mock data for demonstration (will be removed once real data is working)
  const mockTransactions = useMemo<Transaction[]>(() => {
    if (!isConnected) return [];
    
    // Mock data for demonstration
    return [
      {
        id: '1',
        type: 'Swap',
        txHash: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
        fromToken: {
          id: '2:0',
          symbol: 'METHANE',
          name: 'Methane',
        },
        toToken: {
          id: '2:1',
          symbol: 'bUSD',
          name: 'bUSD',
        },
        amountFrom: '1000.0',
        amountTo: '50.25',
        timestamp: Date.now() - 3600000,
        status: 'confirmed',
      },
      {
        id: '2',
        type: 'Wrap',
        txHash: 'def456ghi789jkl012mno345pqr678stu901vwx234yz567abc',
        fromToken: {
          id: 'btc',
          symbol: 'BTC',
          name: 'Bitcoin',
        },
        toToken: {
          id: '2:2',
          symbol: 'frBTC',
          name: 'frBTC',
        },
        amountFrom: '0.5',
        amountTo: '0.5',
        timestamp: Date.now() - 7200000,
        status: 'confirmed',
      },
      {
        id: '3',
        type: 'Swap',
        txHash: 'ghi789jkl012mno345pqr678stu901vwx234yz567abc123def',
        fromToken: {
          id: '2:1',
          symbol: 'bUSD',
          name: 'bUSD',
        },
        toToken: {
          id: '2:2',
          symbol: 'frBTC',
          name: 'frBTC',
        },
        amountFrom: '1000.0',
        amountTo: '0.0125',
        timestamp: Date.now() - 86400000,
        status: 'confirmed',
      },
      {
        id: '4',
        type: 'Unwrap',
        txHash: 'jkl012mno345pqr678stu901vwx234yz567abc123def456ghi',
        fromToken: {
          id: '2:2',
          symbol: 'frBTC',
          name: 'frBTC',
        },
        toToken: {
          id: 'btc',
          symbol: 'BTC',
          name: 'Bitcoin',
        },
        amountFrom: '0.25',
        amountTo: '0.25',
        timestamp: Date.now() - 172800000,
        status: 'confirmed',
      },
    ];
  }, [isConnected]);

  // Use mock data or real data based on toggle
  const allTransactions = useMockData ? mockTransactions : realTransactions;

  const transactions = useMemo(() => {
    if (filter === 'All') return allTransactions;
    return allTransactions.filter(tx => tx.type === filter);
  }, [allTransactions, filter]);

  if (!isConnected) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[color:var(--sf-outline)] bg-white/50 backdrop-blur-sm p-12 text-center">
        <svg className="mx-auto h-16 w-16 text-[color:var(--sf-text)]/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h3 className="text-xl font-bold text-[color:var(--sf-text)] mb-2">Connect Your Wallet</h3>
        <p className="text-sm text-[color:var(--sf-text)]/60 max-w-md mx-auto">
          Connect your wallet to view your transaction history and activity.
        </p>
      </div>
    );
  }

  const filters: FilterType[] = ['All', 'Bridge', 'Swap', 'Wrap', 'Unwrap'];

  if (allTransactions.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[color:var(--sf-outline)] bg-white/50 backdrop-blur-sm p-12 text-center">
        <svg className="mx-auto h-16 w-16 text-[color:var(--sf-text)]/30 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="text-xl font-bold text-[color:var(--sf-text)] mb-2">No Transactions Yet</h3>
        <p className="text-sm text-[color:var(--sf-text)]/60 max-w-md mx-auto">
          Your transaction history will appear here once you start trading.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Incoming Bridge Deposits */}
      {incomingBridgeDeposits.length > 0 && (filter === 'All' || filter === 'Bridge') && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-[color:var(--sf-text)]">
            Incoming Deposits ({incomingBridgeDeposits.length})
          </h3>
          <BridgeDepositProgress deposits={incomingBridgeDeposits} />
        </div>
      )}

      {/* Filter Tabs & Data Source Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap sf-focus-ring ${
                filter === f
                  ? 'bg-[color:var(--sf-primary)] text-white shadow-[0_2px_8px_rgba(40,67,114,0.3)]'
                  : 'bg-white border-2 border-[color:var(--sf-outline)] text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/40 hover:shadow-sm'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseMockData(!useMockData)}
            className="text-xs font-semibold text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-primary)] transition-colors underline"
          >
            {useMockData ? 'Using Mock Data' : 'Using Real Data'}
          </button>
          <span className="text-sm font-medium text-[color:var(--sf-text)]/60">
            {isLoading && !useMockData ? 'Loading...' : `${transactions.length} ${transactions.length === 1 ? 'Transaction' : 'Transactions'}`}
          </span>
        </div>
      </div>

      {/* Transaction List */}
      {transactions.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[color:var(--sf-outline)] bg-white/50 backdrop-blur-sm p-8 text-center">
          <h3 className="text-lg font-bold text-[color:var(--sf-text)] mb-2">No {filter} Transactions</h3>
          <p className="text-sm text-[color:var(--sf-text)]/60">
            Try selecting a different filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {transactions.map((tx) => (
            <TransactionCard key={tx.id} transaction={tx} network={network} />
          ))}
        </div>
      )}
    </div>
  );
}
