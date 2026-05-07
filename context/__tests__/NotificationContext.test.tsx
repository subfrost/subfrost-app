/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { NotificationProvider, useNotification } from '../NotificationContext';

// Mock the SwapSuccessNotification module for the OperationType import
vi.mock('@/app/components/SwapSuccessNotification', () => ({
  default: () => null,
}));

// Helper component that exposes context methods for testing
function TestConsumer({
  onContext,
}: {
  onContext?: (ctx: ReturnType<typeof useNotification>) => void;
}) {
  const ctx = useNotification();
  React.useEffect(() => {
    onContext?.(ctx);
  }, [ctx, onContext]);
  return (
    <div>
      <span data-testid="count">{ctx.notifications.length}</span>
      {ctx.notifications.map((n) => (
        <div key={n.id} data-testid={`notif-${n.id}`}>
          <span data-testid={`type-${n.id}`}>{n.operationType}</span>
          <span data-testid={`txid-${n.id}`}>{n.txId}</span>
          {n.stepContext && (
            <span data-testid={`step-${n.id}`}>{n.stepContext}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function renderWithProvider(
  onContext?: (ctx: ReturnType<typeof useNotification>) => void,
) {
  return render(
    <NotificationProvider>
      <TestConsumer onContext={onContext} />
    </NotificationProvider>,
  );
}

describe('NotificationContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with zero notifications', () => {
    renderWithProvider();
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('adds a notification via showNotification', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx123', 'swap');
    });

    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('notification has correct txId and operationType', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('abc456', 'wrap');
    });

    const notifs = ctx!.notifications;
    expect(notifs).toHaveLength(1);
    expect(notifs[0].txId).toBe('abc456');
    expect(notifs[0].operationType).toBe('wrap');
  });

  it('removes a notification via dismissNotification', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx1', 'swap');
    });

    const notifId = ctx!.notifications[0].id;

    await act(async () => {
      ctx!.dismissNotification(notifId);
    });

    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('supports multiple notification stacking', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx1', 'swap');
      ctx!.showNotification('tx2', 'wrap');
      ctx!.showNotification('tx3', 'unwrap');
    });

    expect(screen.getByTestId('count').textContent).toBe('3');
  });

  it('each notification gets a unique id', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx1', 'swap');
      ctx!.showNotification('tx2', 'swap');
    });

    const ids = ctx!.notifications.map((n) => n.id);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('dismissing one notification leaves others intact', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx1', 'swap');
      ctx!.showNotification('tx2', 'wrap');
      ctx!.showNotification('tx3', 'addLiquidity');
    });

    const idToRemove = ctx!.notifications[1].id;

    await act(async () => {
      ctx!.dismissNotification(idToRemove);
    });

    expect(ctx!.notifications).toHaveLength(2);
    expect(ctx!.notifications.map((n) => n.txId)).toEqual(['tx1', 'tx3']);
  });

  it('supports all operation types', async () => {
    const types = ['swap', 'wrap', 'unwrap', 'addLiquidity', 'removeLiquidity', 'send'] as const;
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      for (const type of types) {
        ctx!.showNotification(`tx-${type}`, type);
      }
    });

    expect(ctx!.notifications).toHaveLength(types.length);
    for (const type of types) {
      expect(ctx!.notifications.find((n) => n.operationType === type)).toBeDefined();
    }
  });

  it('includes stepContext when provided', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx-step', 'swap', '1/2');
    });

    expect(ctx!.notifications[0].stepContext).toBe('1/2');
  });

  it('stepContext is undefined when not provided', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx-no-step', 'swap');
    });

    expect(ctx!.notifications[0].stepContext).toBeUndefined();
  });

  it('notification has a createdAt timestamp', async () => {
    const before = Date.now();
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx-time', 'swap');
    });

    const after = Date.now();
    const createdAt = ctx!.notifications[0].createdAt;
    expect(createdAt).toBeGreaterThanOrEqual(before);
    expect(createdAt).toBeLessThanOrEqual(after);
  });

  it('throws when useNotification is used outside provider', () => {
    function Orphan() {
      useNotification();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(
      'useNotification must be used within NotificationProvider',
    );
  });

  it('dismissing a non-existent id does not change notifications', async () => {
    let ctx: ReturnType<typeof useNotification> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.showNotification('tx1', 'swap');
    });

    await act(async () => {
      ctx!.dismissNotification('nonexistent-id');
    });

    expect(ctx!.notifications).toHaveLength(1);
  });
});
