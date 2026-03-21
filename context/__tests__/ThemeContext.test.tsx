/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../ThemeContext';

function TestConsumer({
  onContext,
}: {
  onContext?: (ctx: ReturnType<typeof useTheme>) => void;
}) {
  const ctx = useTheme();
  React.useEffect(() => {
    onContext?.(ctx);
  }, [ctx, onContext]);
  return <span data-testid="theme">{ctx.theme}</span>;
}

function renderWithProvider(
  onContext?: (ctx: ReturnType<typeof useTheme>) => void,
) {
  return render(
    <ThemeProvider>
      <TestConsumer onContext={onContext} />
    </ThemeProvider>,
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark theme', () => {
    renderWithProvider();
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('sets data-theme attribute on mount', () => {
    renderWithProvider();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('setTheme changes to light', async () => {
    let ctx: ReturnType<typeof useTheme> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.setTheme('light');
    });

    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('toggleTheme switches from dark to light', async () => {
    let ctx: ReturnType<typeof useTheme> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.toggleTheme();
    });

    expect(screen.getByTestId('theme').textContent).toBe('light');
  });

  it('toggleTheme switches from light back to dark', async () => {
    let ctx: ReturnType<typeof useTheme> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.setTheme('light');
    });

    await act(async () => {
      ctx!.toggleTheme();
    });

    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('setTheme updates data-theme attribute for each change', async () => {
    let ctx: ReturnType<typeof useTheme> | undefined;
    renderWithProvider((c) => {
      ctx = c;
    });

    await act(async () => {
      ctx!.setTheme('light');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    await act(async () => {
      ctx!.setTheme('dark');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('throws when useTheme is used outside provider', () => {
    function Orphan() {
      useTheme();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      'useTheme must be used within a ThemeProvider',
    );
  });
});
