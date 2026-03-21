/** @vitest-environment jsdom */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SwapHeaderTabs from '../SwapHeaderTabs';

// Mock useTranslation to return English keys
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'swap.swapTab': 'SWAP',
        'swap.liquidityTab': 'LIQUIDITY',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
  }),
}));

describe('SwapHeaderTabs', () => {
  let onTabChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onTabChange = vi.fn();
  });

  it('renders three tab buttons', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('renders SWAP tab text', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    expect(screen.getByText('SWAP')).toBeDefined();
  });

  it('renders LIMIT tab text', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    expect(screen.getByText('LIMIT')).toBeDefined();
  });

  it('renders LIQUIDITY tab text', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    expect(screen.getByText('LIQUIDITY')).toBeDefined();
  });

  it('swap tab has active styling when selected', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    const swapButton = screen.getByText('SWAP').closest('button')!;
    expect(swapButton.className).toContain('bg-[color:var(--sf-primary)]');
    expect(swapButton.className).toContain('text-white');
  });

  it('limit tab has active styling when selected', () => {
    render(<SwapHeaderTabs selectedTab="limit" onTabChange={onTabChange} />);
    const limitButton = screen.getByText('LIMIT').closest('button')!;
    expect(limitButton.className).toContain('bg-[color:var(--sf-primary)]');
    expect(limitButton.className).toContain('text-white');
  });

  it('lp tab has active styling when selected', () => {
    render(<SwapHeaderTabs selectedTab="lp" onTabChange={onTabChange} />);
    const lpButton = screen.getByText('LIQUIDITY').closest('button')!;
    expect(lpButton.className).toContain('bg-[color:var(--sf-primary)]');
    expect(lpButton.className).toContain('text-white');
  });

  it('non-selected tabs have inactive styling', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    const limitButton = screen.getByText('LIMIT').closest('button')!;
    expect(limitButton.className).toContain('bg-[color:var(--sf-panel-bg)]');
    expect(limitButton.className).not.toContain('text-white');
  });

  it('clicking SWAP tab calls onTabChange with "swap"', () => {
    render(<SwapHeaderTabs selectedTab="limit" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('SWAP').closest('button')!);
    expect(onTabChange).toHaveBeenCalledWith('swap');
  });

  it('clicking LIMIT tab calls onTabChange with "limit"', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('LIMIT').closest('button')!);
    expect(onTabChange).toHaveBeenCalledWith('limit');
  });

  it('clicking LIQUIDITY tab calls onTabChange with "lp"', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('LIQUIDITY').closest('button')!);
    expect(onTabChange).toHaveBeenCalledWith('lp');
  });

  it('clicking currently selected tab still calls onTabChange', () => {
    render(<SwapHeaderTabs selectedTab="swap" onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText('SWAP').closest('button')!);
    expect(onTabChange).toHaveBeenCalledWith('swap');
    expect(onTabChange).toHaveBeenCalledTimes(1);
  });
});
