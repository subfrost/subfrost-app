'use client';

import { useState, useMemo } from 'react';
import { hasPermission } from '@/lib/admin-permissions';
import DashboardTab from './DashboardTab';
import CodesTab from './CodesTab';
import RedemptionsTab from './RedemptionsTab';
import HierarchyTab from './HierarchyTab';
import BulkTab from './BulkTab';
import ToolsTab from './ToolsTab';
import UsersTab from './UsersTab';
import FuelTab from './FuelTab';

const TAB_DEFINITIONS = [
  { key: 'dashboard', label: 'Dashboard', permission: 'stats.read' },
  { key: 'codes', label: 'Codes', permission: 'codes.read' },
  { key: 'redemptions', label: 'Redemptions', permission: 'redemptions.read' },
  { key: 'hierarchy', label: 'Hierarchy', permission: 'codes.read' },
  { key: 'bulk', label: 'Bulk Generate', permission: 'bulk.create' },
  { key: 'tools', label: 'Tools', permission: 'tools.access' },
  { key: 'fuel', label: 'FUEL Allocations', permission: 'fuel.read' },
  { key: 'users', label: 'Users', permission: 'iam.owner' },
] as const;

type TabKey = (typeof TAB_DEFINITIONS)[number]['key'];

interface AdminTabsProps {
  userPermissions: string[];
}

export default function AdminTabs({ userPermissions }: AdminTabsProps) {
  const visibleTabs = useMemo(
    () => TAB_DEFINITIONS.filter((tab) => hasPermission(userPermissions, tab.permission)),
    [userPermissions]
  );

  const [activeTab, setActiveTab] = useState<TabKey>(
    visibleTabs.length > 0 ? visibleTabs[0].key : 'dashboard'
  );

  // If current tab is no longer visible, reset to first visible
  const resolvedTab = visibleTabs.some((t) => t.key === activeTab)
    ? activeTab
    : visibleTabs[0]?.key || 'dashboard';

  if (visibleTabs.length === 0) {
    return (
      <div className="rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-8 text-center text-[color:var(--sf-muted)]">
        No permissions assigned. Contact an administrator.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-1">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              resolvedTab === tab.key
                ? 'bg-[color:var(--sf-primary)] text-white'
                : 'text-[color:var(--sf-muted)] hover:text-[color:var(--sf-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {resolvedTab === 'dashboard' && <DashboardTab />}
        {resolvedTab === 'codes' && <CodesTab />}
        {resolvedTab === 'redemptions' && <RedemptionsTab />}
        {resolvedTab === 'hierarchy' && <HierarchyTab />}
        {resolvedTab === 'bulk' && <BulkTab />}
        {resolvedTab === 'tools' && <ToolsTab />}
        {resolvedTab === 'fuel' && <FuelTab />}
        {resolvedTab === 'users' && <UsersTab />}
      </div>
    </div>
  );
}
