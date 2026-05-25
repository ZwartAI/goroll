import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";

/**
 * Returns props for a modal backdrop that only closes when the user BOTH
 * presses and releases the pointer directly on the backdrop itself.
 *
 * Fixes a UX bug where dragging a text selection from inside the modal and
 * releasing the mouse outside would treat the release as a backdrop click,
 * dismissing the modal mid-selection.
 */
export function backdropProps(onClose: () => void) {
  return {
    onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => {
      (e.currentTarget as any).__downOnBackdrop = e.target === e.currentTarget;
    },
    onMouseUp: (e: ReactMouseEvent<HTMLDivElement>) => {
      const down = (e.currentTarget as any).__downOnBackdrop === true;
      (e.currentTarget as any).__downOnBackdrop = false;
      if (down && e.target === e.currentTarget) onClose();
    },
    onTouchStart: (e: ReactTouchEvent<HTMLDivElement>) => {
      (e.currentTarget as any).__downOnBackdrop = e.target === e.currentTarget;
    },
    onTouchEnd: (e: ReactTouchEvent<HTMLDivElement>) => {
      const down = (e.currentTarget as any).__downOnBackdrop === true;
      (e.currentTarget as any).__downOnBackdrop = false;
      if (down && e.target === e.currentTarget) onClose();
    },
  };
}
