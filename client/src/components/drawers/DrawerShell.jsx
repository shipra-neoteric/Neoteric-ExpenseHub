import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const WIDTHS = {
  lg: 'max-w-lg',
  '2xl': 'max-w-2xl',
};

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Right-side drawer matching the live Neoteric VMS Add Project drawer:
// fixed inset-0 dark overlay, w-full {max-w-lg|max-w-2xl} h-full panel,
// fixed header/footer with only the middle content scrolling.
export default function DrawerShell({ open, onClose, title, subtitle, icon: Icon, children, footer, headerActions, width = 'lg', confirmBeforeClose }) {
  const panelRef = useRef(null);
  const previousFocusRef = useRef(null);

  const requestClose = async () => {
    if (confirmBeforeClose) {
      const ok = await confirmBeforeClose();
      if (!ok) return;
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;

    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const focusable = panelRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      (focusable?.[0] || panelRef.current)?.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = '';
      if (previousFocusRef.current instanceof HTMLElement) previousFocusRef.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-[#0F172A]/60 transition-opacity" onClick={requestClose} aria-hidden="true" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative flex h-full w-full ${WIDTHS[width]} flex-col bg-white shadow-xl outline-none dark:bg-[#0F172A]`}
        style={{ animation: 'slideInRight 0.3s ease-out' }}
      >
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <Icon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold leading-tight text-gray-900 dark:text-white">{title}</h2>
              {subtitle && <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>

        {footer && <div className="flex flex-shrink-0 justify-end gap-3 border-t border-gray-200 px-4 py-4 dark:border-gray-700 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function DrawerCancelButton({ onClick, children = 'Cancel' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800"
    >
      {children}
    </button>
  );
}
