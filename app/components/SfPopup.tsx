'use client';

import {
  ReactNode,
  forwardRef, useImperativeHandle,
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
  disableBackdropClose,
  testId,
  trackHeight = false,
  children,
}, ref) {
  const { isClosing, handleClose } = useModalCloseAnimation(onClose, isOpen);
  const { innerRef, contentStyle } = useModalContentHeight(trackHeight && isOpen);

  useImperativeHandle(ref, () => ({ close: handleClose }), [handleClose]);

  if (!isOpen) return null;

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
      className={`sf-popup-overlay${overlayClassName ? ' ' + overlayClassName : ''}${isClosing ? ' sf-popup-closing' : ''}`}
      onClick={disableBackdropClose ? undefined : handleClose}
    >
      <div
        data-testid={testId}
        className={`sf-popup${panelClassName ? ' ' + panelClassName : ''}${isClosing ? ' sf-popup-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
});

export default SfPopup;
