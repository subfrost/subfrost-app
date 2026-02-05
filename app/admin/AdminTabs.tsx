'use client';

import { useState } from 'react';
import DashboardTab from './DashboardTab';
import CodesTab from './CodesTab';
import RedemptionsTab from './RedemptionsTab';
import HierarchyTab from './HierarchyTab';
import BulkTab from './BulkTab';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'codes', label: 'Codes' },
  { key: 'redemptions', label: 'Redemptions' },
  { key: 'hierarchy', label: 'Hierarchy' },
  { key: 'bulk', label: 'Bulk Generate' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function AdminTabs() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[color:var(--sf-primary)] text-white'
                : 'text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'codes' && <CodesTab />}
        {activeTab === 'redemptions' && <RedemptionsTab />}
        {activeTab === 'hierarchy' && <HierarchyTab />}
        {activeTab === 'bulk' && <BulkTab />}
      </div>
    </div>
  );
}
