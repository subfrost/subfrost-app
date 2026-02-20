/**
 * Admin permission constants and helpers.
 *
 * Permissions are stored as a String[] on AdminUser.
 * `iam.owner` is a super-permission that implicitly grants everything.
 */

export const ADMIN_PERMISSIONS = {
  CODES_READ: 'codes.read',
  CODES_EDIT: 'codes.edit',
  REDEMPTIONS_READ: 'redemptions.read',
  REDEMPTIONS_EXPORT: 'redemptions.export',
  STATS_READ: 'stats.read',
  BULK_CREATE: 'bulk.create',
  TOOLS_ACCESS: 'tools.access',
  POOLS_READ: 'pools.read',
  POOLS_EDIT: 'pools.edit',
  TOKENS_READ: 'tokens.read',
  TOKENS_EDIT: 'tokens.edit',
  TRANSACTIONS_READ: 'transactions.read',
  USERS_READ: 'users.read',
  USERS_EDIT: 'users.edit',
  FUEL_READ: 'fuel.read',
  FUEL_EDIT: 'fuel.edit',
  CONFIG_READ: 'config.read',
  CONFIG_EDIT: 'config.edit',
  IAM_OWNER: 'iam.owner',
} as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[keyof typeof ADMIN_PERMISSIONS];

/** All permission values as an array (useful for UI iteration). */
export const ALL_PERMISSIONS: AdminPermission[] = Object.values(ADMIN_PERMISSIONS);

/** Human-readable labels for each permission. */
export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  'codes.read': 'View invite codes',
  'codes.edit': 'Create/edit/delete invite codes',
  'redemptions.read': 'View redemptions',
  'redemptions.export': 'Export redemption data',
  'stats.read': 'View dashboard statistics',
  'bulk.create': 'Bulk generate codes',
  'tools.access': 'Access tools tab',
  'pools.read': 'View pool metadata',
  'pools.edit': 'Edit pool metadata',
  'tokens.read': 'View token metadata',
  'tokens.edit': 'Edit token metadata',
  'transactions.read': 'View transaction logs',
  'users.read': 'View app users',
  'users.edit': 'Edit app users',
  'fuel.read': 'View FUEL allocations',
  'fuel.edit': 'Manage FUEL allocations',
  'config.read': 'View system configuration',
  'config.edit': 'Edit system configuration',
  'iam.owner': 'Manage admin users (super admin)',
};

/** Permissions grouped by resource, for the UI. */
export const PERMISSION_GROUPS: { label: string; permissions: AdminPermission[] }[] = [
  {
    label: 'Dashboard',
    permissions: ['stats.read'],
  },
  {
    label: 'Invite Codes',
    permissions: ['codes.read', 'codes.edit', 'bulk.create'],
  },
  {
    label: 'Redemptions',
    permissions: ['redemptions.read', 'redemptions.export'],
  },
  {
    label: 'Tools',
    permissions: ['tools.access'],
  },
  {
    label: 'Pools',
    permissions: ['pools.read', 'pools.edit'],
  },
  {
    label: 'Tokens',
    permissions: ['tokens.read', 'tokens.edit'],
  },
  {
    label: 'Transactions',
    permissions: ['transactions.read'],
  },
  {
    label: 'Users',
    permissions: ['users.read', 'users.edit'],
  },
  {
    label: 'FUEL',
    permissions: ['fuel.read', 'fuel.edit'],
  },
  {
    label: 'Configuration',
    permissions: ['config.read', 'config.edit'],
  },
  {
    label: 'Admin IAM',
    permissions: ['iam.owner'],
  },
];

/**
 * Check if a user's permission list grants the requested permission.
 * `iam.owner` implicitly grants all permissions.
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (userPermissions.includes('iam.owner')) return true;
  return userPermissions.includes(required);
}
