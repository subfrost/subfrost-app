/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import SfPopup, { type SfPopupHandle } from '../SfPopup';

// Match MODAL_EXIT_DURATION_MS in `hooks/useModalCloseAnimation.ts`.
const EXIT_MS = 140;

// jsdom has no ResizeObserver — stub once.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;

describe('SfPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cleanup();
  });

  it('renders nothing when isOpen=false', () => {
    const { container } = render(
      <SfPopup isOpen={false} onClose={() => {}}>body</SfPopup>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders children inside .sf-popup when isOpen=true', () => {
    render(<SfPopup isOpen onClose={() => {}} testId="t">hello</SfPopup>);
    const panel = screen.getByTestId('t');
    expect(panel).toBeTruthy();
    expect(panel.textContent).toBe('hello');
    expect(panel.className).toContain('sf-popup');
  });

  it('backdrop click triggers exit animation, then calls onClose after 140ms', () => {
    const onClose = vi.fn();
    render(<SfPopup isOpen onClose={onClose} testId="t">x</SfPopup>);
    const panel = screen.getByTestId('t');
    const overlay = panel.parentElement!;

    fireEvent.click(overlay);
    // Mid-animation: exit class applied, onClose not yet called.
    expect(panel.className).toContain('sf-popup-closing');
    expect(onClose).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(EXIT_MS); });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('panel click does NOT close (stopPropagation)', () => {
    const onClose = vi.fn();
    render(<SfPopup isOpen onClose={onClose} testId="t">x</SfPopup>);
    fireEvent.click(screen.getByTestId('t'));
    act(() => { vi.advanceTimersByTime(EXIT_MS); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disableBackdropClose suppresses backdrop click', () => {
    const onClose = vi.fn();
    render(
      <SfPopup isOpen onClose={onClose} testId="t" disableBackdropClose>x</SfPopup>,
    );
    const overlay = screen.getByTestId('t').parentElement!;
    fireEvent.click(overlay);
    act(() => { vi.advanceTimersByTime(EXIT_MS); });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ref.close() runs the same exit gate', () => {
    const onClose = vi.fn();
    const ref = createRef<SfPopupHandle>();
    render(<SfPopup ref={ref} isOpen onClose={onClose} testId="t">x</SfPopup>);

    act(() => { ref.current!.close(); });
    expect(screen.getByTestId('t').className).toContain('sf-popup-closing');
    expect(onClose).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(EXIT_MS); });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('duplicate close calls during exit do not stack', () => {
    const onClose = vi.fn();
    const ref = createRef<SfPopupHandle>();
    render(<SfPopup ref={ref} isOpen onClose={onClose}>x</SfPopup>);

    act(() => {
      ref.current!.close();
      ref.current!.close();
      ref.current!.close();
    });
    act(() => { vi.advanceTimersByTime(EXIT_MS); });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('pending exit timer is cleared on unmount', () => {
    const onClose = vi.fn();
    const ref = createRef<SfPopupHandle>();
    const { unmount } = render(
      <SfPopup ref={ref} isOpen onClose={onClose}>x</SfPopup>,
    );

    act(() => { ref.current!.close(); });
    unmount();
    act(() => { vi.advanceTimersByTime(EXIT_MS * 2); });
    // onClose must not fire after unmount.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('trackHeight wraps children in .sf-popup-content', () => {
    const { container } = render(
      <SfPopup isOpen onClose={() => {}} trackHeight>
        <p>inner</p>
      </SfPopup>,
    );
    expect(container.querySelector('.sf-popup-content')).toBeTruthy();
  });

  it('without trackHeight there is no .sf-popup-content wrapper', () => {
    const { container } = render(
      <SfPopup isOpen onClose={() => {}}>
        <p>inner</p>
      </SfPopup>,
    );
    expect(container.querySelector('.sf-popup-content')).toBeNull();
  });
});
