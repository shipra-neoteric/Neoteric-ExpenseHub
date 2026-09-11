import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function toValue(d) {
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}
function fromValue(v) {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatDisplay(v) {
  const d = fromValue(v);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Bordered trigger + portal popup with a theme-colored selected day, following
// the same visual language as ThemedSelect (section 11) — never a native
// <input type="date">.
export default function ThemedDatePicker({ label, value, onChange, max, min, required = false, error, id, disabled = false, compact = false }) {
  const { getThemeColor } = useTheme();
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [viewMonth, setViewMonth] = useState(() => fromValue(value) || new Date());
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  const maxDate = max ? fromValue(max) : null;
  const minDate = min ? fromValue(min) : null;
  const selectedDate = fromValue(value);

  const openPopup = () => {
    if (disabled) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setViewMonth(selectedDate || new Date());
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (triggerRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const isDisabled = (day) => {
    const d = new Date(year, month, day);
    if (maxDate && d > maxDate) return true;
    if (minDate && d < minDate) return true;
    return false;
  };

  const pick = (day) => {
    if (isDisabled(day)) return;
    onChange(toValue(new Date(year, month, day)));
    setOpen(false);
  };

  return (
    <div className="flex flex-col gap-1">
      {label &&
        (compact ? (
          <label htmlFor={inputId} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        ) : (
          <label htmlFor={inputId} className="mb-0.5 text-sm font-medium text-gray-700 dark:text-gray-300">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        ))}
      <button
        type="button"
        id={inputId}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPopup())}
        style={open ? { boxShadow: `0 0 0 2px ${getThemeColor()}` } : undefined}
        className={`flex w-full items-center justify-between rounded-md border text-left shadow-sm transition
          bg-white text-gray-900 border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600
          disabled:cursor-not-allowed disabled:opacity-60 ${error ? 'border-red-400' : ''}
          ${compact ? 'h-9 px-2.5 rounded-lg text-[13px]' : 'h-10 px-3 py-2 text-sm'}`}
      >
        <span className={!value ? 'text-gray-400' : ''}>{value ? formatDisplay(value) : 'Select date'}</span>
        <Calendar className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {error && <span className="mt-1 text-[11px] text-red-500">{error}</span>}

      {open &&
        createPortal(
          <div ref={popupRef} style={{ position: 'fixed', top: pos.top, left: pos.left }} className="z-[10050] w-64 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setViewMonth(new Date(year, month - 1, 1))} className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{viewMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
              <button type="button" onClick={() => setViewMonth(new Date(year, month + 1, 1))} className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">
              {WEEKDAYS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((day, i) => {
                if (!day) return <span key={`empty-${i}`} />;
                const isSelected = selectedDate && selectedDate.getFullYear() === year && selectedDate.getMonth() === month && selectedDate.getDate() === day;
                const today = new Date();
                const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                const disabledDay = isDisabled(day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabledDay}
                    onClick={() => pick(day)}
                    style={isSelected ? { backgroundColor: getThemeColor(), color: '#fff' } : undefined}
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm transition
                      ${disabledDay ? 'cursor-not-allowed text-gray-300 dark:text-gray-600' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'}
                      ${isToday && !isSelected ? 'font-bold' : ''}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
