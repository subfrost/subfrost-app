'use client';

import {
  CSSProperties,
  ReactNode,
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
} from 'react';
import { useModalCloseAnimation } from '@/hooks/useModalCloseAnimation';
import { useModalContentHeight } from '@/hooks/useModalContentHeight';

/** Imperative handle — call `popupRef.current?.close()` to trigger the
 * 140ms exit animation before the parent unmounts. */
export type SfPopupHandle = { close: () => void };

interface Props {
  isOpen: boolean;
  /** Parent close handler — invoked after the exit animation completes. */
  onClose: () => void;
  /** Class applied to the `.sf-popup` panel (sizing utilities, etc.). */
  panelClassName?: string;
  /** Class added to `.sf-popup-overlay` (e.g. `px-4`). */
  overlayClassName?: string;
  /** Inline styles for the `.sf-popup-overlay` (e.g. z-index overrides). */
  overlayStyle?: CSSProperties;
  /** Suppress backdrop click → close (e.g. during a connecting flow). */
  disableBackdropClose?: boolean;
  /** `data-testid` forwarded to the `.sf-popup` panel. */
  testId?: string;
  /** Track inner content height via ResizeObserver and tween the wrapper
   *  between sizes (300ms cubic-bezier). Use for multi-view / multi-step
   *  modals where content swaps cause natural height changes. */
  trackHeight?: boolean;
  children: ReactNode;
}

const SfPopup = forwardRef<SfPopupHandle, Props>(function SfPopup({
  isOpen,
  onClose,
  panelClassName = '',
  overlayClassName = '',
  overlayStyle,
  disableBackdropClose,
  testId,
  trackHeight = false,
  children,
}, ref) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isEntered, setIsEntered] = useState(false);
  const backdropPointerStartedRef = useRef(false);
  const { isClosing, handleClose } = useModalCloseAnimation(() => {
    setShouldRender(false);
    setIsEntered(false);
    onClose();
  }, isOpen);
  const { innerRef, contentStyle } = useModalContentHeight(trackHeight && shouldRender);

  const closeWithAnimation = useCallback(() => {
    setIsEntered(false);
    handleClose();
  }, [handleClose]);

  const handleOverlayPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    backdropPointerStartedRef.current = event.target === event.currentTarget;
  }, []);

  const handleOverlayClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const shouldClose =
      backdropPointerStartedRef.current &&
      event.target === event.currentTarget;

    backdropPointerStartedRef.current = false;
    if (shouldClose) closeWithAnimation();
  }, [closeWithAnimation]);

  useImperativeHandle(ref, () => ({ close: closeWithAnimation }), [closeWithAnimation]);

  useEffect(() => {
    if (!isOpen) return;

    setShouldRender(true);
    setIsEntered(false);

    let innerFrameId = 0;
    const frameId = requestAnimationFrame(() => {
      innerFrameId = requestAnimationFrame(() => {
        setIsEntered(true);
      });
    });

    return () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(innerFrameId);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen && shouldRender && !isClosing) {
      closeWithAnimation();
    }
  }, [closeWithAnimation, isClosing, isOpen, shouldRender]);

  if (!shouldRender) return null;

  // Height-tracking wrapper must NOT be `flex-1`: `.sf-popup` is a flex
  // column, and a flex-grow child overrides any inline `height` style,
  // killing the transition.
  const content = trackHeight ? (
    <div className="sf-popup-content" style={contentStyle}>
      <div ref={innerRef}>{children}</div>
    </div>
  ) : children;

  return (
    <div
      className={`sf-popup-overlay${isEntered ? ' sf-popup-open' : ''}${overlayClassName ? ' ' + overlayClassName : ''}${isClosing ? ' sf-popup-closing' : ''}`}
      style={overlayStyle}
      onPointerDown={disableBackdropClose ? undefined : handleOverlayPointerDown}
      onClick={disableBackdropClose ? undefined : handleOverlayClick}
    >
      <div
        data-testid={testId}
        className={`sf-popup${isEntered ? ' sf-popup-open' : ''}${panelClassName ? ' ' + panelClassName : ''}${isClosing ? ' sf-popup-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
});

export default SfPopup;
