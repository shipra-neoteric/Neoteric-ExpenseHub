import React from 'react';
import { STATUS_META } from '../../utils/permissions';

export default function StatusPill({ status }) {
  const meta = STATUS_META[status] || { label: status, pill: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      <span>{meta.label}</span>
    </span>
  );
}
