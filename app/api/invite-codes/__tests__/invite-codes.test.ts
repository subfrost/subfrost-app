/**
 * Invite Code API Tests
 *
 * Tests for the invite code validation and redemption endpoints.
 *
 * Run with: pnpm test app/api/invite-codes/__tests__/invite-codes.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules - factories must not reference external variables
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    inviteCode: {
      findUnique: vi.fn(),
    },
    inviteCodeRedemption: {
      upsert: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/db/redis', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

// Import after mocking
import { prisma } from '@/lib/db/prisma';
import { cache } from '@/lib/db/redis';
import { POST as validatePOST } from '../validate/route';
import { POST as redeemPOST } from '../redeem/route';

// Helper to create mock NextRequest
function createMockRequest(body: object): Request {
  return new Request('http://localhost:3000/api/invite-codes/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/invite-codes/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return valid: true for an active code', async () => {
    vi.mocked(cache.get).mockResolvedValue(null); // Cache miss
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-123',
      code: 'TESTCODE',
      isActive: true,
      description: null,
      createdAt: new Date(),
    });

    const request = createMockRequest({ code: 'testcode' });
    const response = await validatePOST(request as any);
    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(prisma.inviteCode.findUnique).toHaveBeenCalledWith({
      where: { code: 'TESTCODE' },
      select: { isActive: true },
    });
  });

  it('should return cached result if code was recently validated', async () => {
    vi.mocked(cache.get).mockResolvedValue(true); // Cache hit

    const request = createMockRequest({ code: 'CACHEDCODE' });
    const response = await validatePOST(request as any);
    const data = await response.json();

    expect(data.valid).toBe(true);
    expect(prisma.inviteCode.findUnique).not.toHaveBeenCalled();
  });

  it('should return valid: false for non-existent code', async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue(null);

    const request = createMockRequest({ code: 'FAKECODE' });
    const response = await validatePOST(request as any);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.error).toBe('Invalid invite code');
  });

  it('should return valid: false for inactive code', async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-456',
      code: 'OLDCODE',
      isActive: false,
      description: null,
      createdAt: new Date(),
    });

    const request = createMockRequest({ code: 'OLDCODE' });
    const response = await validatePOST(request as any);
    const data = await response.json();

    expect(data.valid).toBe(false);
    expect(data.error).toBe('This invite code is no longer active');
  });

  it('should return error for empty code', async () => {
    const request = createMockRequest({ code: '' });
    const response = await validatePOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.valid).toBe(false);
    expect(data.error).toBe('Code is required');
  });

  it('should normalize code to uppercase', async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-789',
      code: 'MIXEDCASE',
      isActive: true,
      description: null,
      createdAt: new Date(),
    });

    const request = createMockRequest({ code: 'MixedCase' });
    await validatePOST(request as any);

    expect(prisma.inviteCode.findUnique).toHaveBeenCalledWith({
      where: { code: 'MIXEDCASE' },
      select: { isActive: true },
    });
  });

  it('should cache valid codes', async () => {
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-123',
      code: 'NEWCODE',
      isActive: true,
      description: null,
      createdAt: new Date(),
    });

    const request = createMockRequest({ code: 'NEWCODE' });
    await validatePOST(request as any);

    expect(cache.set).toHaveBeenCalledWith('invite:valid:NEWCODE', true, 60);
  });
});

describe('POST /api/invite-codes/redeem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create user and redemption for valid code', async () => {
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-123',
      code: 'TESTCODE',
      isActive: true,
      description: null,
      createdAt: new Date(),
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        user: {
          upsert: vi.fn().mockResolvedValue({ id: 'user-abc' }),
        },
        inviteCodeRedemption: {
          upsert: vi.fn().mockResolvedValue({ id: 'redemption-xyz' }),
        },
      });
    });

    const request = createMockRequest({
      code: 'TESTCODE',
      taprootAddress: 'bc1p_test_address',
      segwitAddress: 'bc1q_test_address',
    });

    const response = await redeemPOST(request as any);
    const data = await response.json();

    expect(data.success).toBe(true);
    expect(data.userId).toBe('user-abc');
  });

  it('should return error for missing code', async () => {
    const request = createMockRequest({
      taprootAddress: 'bc1p_test_address',
    });

    const response = await redeemPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Code is required');
  });

  it('should return error for missing taproot address', async () => {
    const request = createMockRequest({
      code: 'TESTCODE',
    });

    const response = await redeemPOST(request as any);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Taproot address is required');
  });

  it('should return error for invalid code', async () => {
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue(null);

    const request = createMockRequest({
      code: 'FAKECODE',
      taprootAddress: 'bc1p_test_address',
    });

    const response = await redeemPOST(request as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid invite code');
  });

  it('should return error for inactive code', async () => {
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-456',
      code: 'OLDCODE',
      isActive: false,
      description: null,
      createdAt: new Date(),
    });

    const request = createMockRequest({
      code: 'OLDCODE',
      taprootAddress: 'bc1p_test_address',
    });

    const response = await redeemPOST(request as any);
    const data = await response.json();

    expect(data.success).toBe(false);
    expect(data.error).toBe('This invite code is no longer active');
  });

  it('should invalidate cache after redemption', async () => {
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-123',
      code: 'TESTCODE',
      isActive: true,
      description: null,
      createdAt: new Date(),
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        user: {
          upsert: vi.fn().mockResolvedValue({ id: 'user-abc' }),
        },
        inviteCodeRedemption: {
          upsert: vi.fn().mockResolvedValue({ id: 'redemption-xyz' }),
        },
      });
    });

    const request = createMockRequest({
      code: 'TESTCODE',
      taprootAddress: 'bc1p_test_address',
    });

    await redeemPOST(request as any);

    expect(cache.del).toHaveBeenCalledWith('invite:valid:TESTCODE');
  });

  it('should normalize code to uppercase', async () => {
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-123',
      code: 'MIXEDCASE',
      isActive: true,
      description: null,
      createdAt: new Date(),
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        user: {
          upsert: vi.fn().mockResolvedValue({ id: 'user-abc' }),
        },
        inviteCodeRedemption: {
          upsert: vi.fn().mockResolvedValue({ id: 'redemption-xyz' }),
        },
      });
    });

    const request = createMockRequest({
      code: 'mixedCase',
      taprootAddress: 'bc1p_test_address',
    });

    await redeemPOST(request as any);

    expect(prisma.inviteCode.findUnique).toHaveBeenCalledWith({
      where: { code: 'MIXEDCASE' },
      select: { id: true, isActive: true },
    });
  });
});

describe('Invite Code Flow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate then redeem a code successfully', async () => {
    // Setup mocks for both operations
    vi.mocked(cache.get).mockResolvedValue(null);
    vi.mocked(prisma.inviteCode.findUnique).mockResolvedValue({
      id: 'code-123',
      code: 'FLOWTEST',
      isActive: true,
      description: null,
      createdAt: new Date(),
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        user: {
          upsert: vi.fn().mockResolvedValue({ id: 'user-flow-123' }),
        },
        inviteCodeRedemption: {
          upsert: vi.fn().mockResolvedValue({ id: 'redemption-flow-123' }),
        },
      });
    });

    // Step 1: Validate
    const validateRequest = createMockRequest({ code: 'FLOWTEST' });
    const validateResponse = await validatePOST(validateRequest as any);
    const validateData = await validateResponse.json();

    expect(validateData.valid).toBe(true);

    // Step 2: Redeem
    const redeemRequest = createMockRequest({
      code: 'FLOWTEST',
      taprootAddress: 'bc1p_flow_test_address',
      segwitAddress: 'bc1q_flow_test_address',
      taprootPubkey: '02abc123',
    });
    const redeemResponse = await redeemPOST(redeemRequest as any);
    const redeemData = await redeemResponse.json();

    expect(redeemData.success).toBe(true);
    expect(redeemData.userId).toBe('user-flow-123');
  });
});
