// Shared field styling for every drawer form, matching the live Neoteric VMS
// Add Project drawer: compact uppercase labels, 36px-tall inputs, tight text.
export const fieldLabelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

export const fieldInputClass = (hasError) =>
  `w-full h-9 px-2.5 rounded-lg border text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
    hasError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
  }`;

export const fieldTextareaClass = (hasError) =>
  `w-full px-2.5 py-2 rounded-lg border text-[13px] bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
    hasError ? 'border-red-400' : 'border-gray-300 dark:border-gray-600'
  }`;

export const fieldErrorClass = 'mt-1 text-[11px] text-red-500';

export const primaryButtonClass = 'rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50 flex items-center gap-2';
