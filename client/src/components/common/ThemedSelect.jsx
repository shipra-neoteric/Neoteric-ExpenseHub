import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';

// Custom button + portal-rendered popup — never a native <select>, per
// UI_STYLE_GUIDE.md section 11. Positioned with getBoundingClientRect() so it
// is never clipped by a scrollable ancestor, and auto-flips upward when there
// isn't room below.
export default function ThemedSelect({ label, value, onChange, options, placeholder = 'Select...', disabled = false, required = false, error, id, compact = false }) {
  const { getThemeColor } = useTheme();
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUp: false });
  const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

  const filtered = search ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase())) : options;
  const selected = options.find((o) => String(o.value) === String(value));

  const openPopup = () => {
    if (disabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 250 && rect.top > spaceBelow;
    setPos({ top: openUp ? rect.top : rect.bottom, left: rect.left, width: rect.width, openUp });
    setSearch('');
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (triggerRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (val) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      {label &&
        (compact ? (
          <label htmlFor={selectId} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        ) : (
          <label htmlFor={selectId} className="mb-0.5 text-sm font-medium text-gray-700 dark:text-gray-300">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        ))}
      <button
        type="button"
        id={selectId}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPopup())}
        style={open ? { boxShadow: `0 0 0 2px ${getThemeColor()}` } : undefined}
        className={`flex w-full items-center justify-between rounded-md border text-left shadow-sm transition
          bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600
          disabled:cursor-not-allowed disabled:opacity-60 ${error ? 'border-red-400' : ''}
          ${compact ? 'h-9 px-2.5 rounded-lg text-[13px]' : 'h-10 px-3 py-2 text-sm'}`}
      >
        <span className={`truncate ${!selected ? 'text-gray-400' : ''}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {error && <span className="mt-1 text-[11px] text-red-500">{error}</span>}

      {open &&
        createPortal(
          <div
            ref={popupRef}
            style={{ position: 'fixed', left: pos.left, width: Math.max(pos.width, 200), ...(pos.openUp ? { bottom: window.innerHeight - pos.top + 4 } : { top: pos.top + 4 }) }}
            className="z-[10050] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {options.length > 8 && (
              <div className="relative border-b border-gray-100 p-1.5 dark:border-gray-700">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full rounded border border-gray-200 bg-white py-1.5 pl-8 pr-2 text-sm outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                />
              </div>
            )}
            <ul className="custom-scrollbar max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">No options</li>}
              {filtered.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onClick={() => select(opt.value)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check className="h-4 w-4 shrink-0" style={{ color: getThemeColor() }} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
