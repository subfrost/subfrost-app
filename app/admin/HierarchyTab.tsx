'use client';

import { useEffect, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';

interface TreeNode {
  id: string;
  code: string;
  description: string | null;
  isActive: boolean;
  ownerTaprootAddress: string | null;
  _count: { redemptions: number };
  children: TreeNode[];
}

function aggregateRedemptions(node: TreeNode): number {
  return node._count.redemptions + node.children.reduce((sum, c) => sum + aggregateRedemptions(c), 0);
}

function countNodes(node: TreeNode): number {
  return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return [...nodes]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((n) => ({ ...n, children: sortTree(n.children) }));
}

function LeafRow({ node, depth }: { node: TreeNode; depth: number }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[color:var(--sf-glass-bg)]"
      style={{ paddingLeft: `${depth * 24 + 12}px` }}
    >
      <span className="w-5" />
      <span className="font-mono text-sm text-[color:var(--sf-text)]">{node.code}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          node.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}
      >
        {node.isActive ? 'Active' : 'Inactive'}
      </span>
      <span className="text-xs text-[color:var(--sf-muted)]">
        {node._count.redemptions} redemptions
      </span>
    </div>
  );
}

function TreeItem({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;

  if (!hasChildren) {
    return <LeafRow node={node} depth={depth} />;
  }

  const totalRedemptions = aggregateRedemptions(node);
  const totalCodes = countNodes(node);

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-[color:var(--sf-glass-bg)]"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-5 text-center text-xs text-[color:var(--sf-muted)]"
        >
          {expanded ? '▼' : '▶'}
        </button>
        <span className="font-mono text-sm font-semibold text-[color:var(--sf-text)]">{node.code}</span>
        <span className="text-xs text-[color:var(--sf-muted)]">
          {totalRedemptions} redemptions
        </span>
        <span className="text-xs text-[color:var(--sf-muted)]">
          {totalCodes} codes
        </span>
      </div>
      {expanded && (
        <div>
          <LeafRow node={node} depth={depth + 1} />
          {node.children.map((child) => (
            <TreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HierarchyTab() {
  const adminFetch = useAdminFetch();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await adminFetch('/api/admin/codes/tree');
        if (!res.ok) throw new Error('Failed to fetch tree');
        const data = await res.json();
        if (!cancelled) setTree(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminFetch]);

  if (loading) return <div className="text-[color:var(--sf-muted)]">Loading...</div>;
  if (error) return <div className="text-red-400">{error}</div>;

  if (tree.length === 0) {
    return <div className="text-[color:var(--sf-muted)]">No codes found</div>;
  }

  const sorted = sortTree(tree);

  return (
    <div className="rounded-xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[color:var(--sf-text)]">
        Code Hierarchy
      </h3>
      <div className="divide-y divide-[color:var(--sf-row-border)]/30">
        {sorted.map((node) => (
          <TreeItem key={node.id} node={node} />
        ))}
      </div>
    </div>
  );
}
