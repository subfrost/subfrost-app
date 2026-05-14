import { useCallback, useEffect, useRef, useState } from 'react';

/** Must match the `.sf-popup-closing` animation duration in `globals.css`. */
export const MODAL_EXIT_DURATION_MS = 140;

/**
 * Modal close-gate: drives the 140ms `.sf-popup-closing` exit animation
 * before calling the parent's `onClose`. Reset on every (re)open so the
 * same instance can be reused. Pending timer is cleared on unmount.
 */
export function useModalCloseAnimation(onClose: () => void, isOpen: boolean) {
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) setIsClosing(false);
  }, [isOpen]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClose = useCallback(() => {
    if (timerRef.current) return; // already closing
    setIsClosing(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onClose();
      setIsClosing(false);
    }, MODAL_EXIT_DURATION_MS);
  }, [onClose]);

  return { isClosing, handleClose };
}
