import React from 'react';
import { useAuth } from '../context/AuthContext';

export default function RequirePermission({ permission, children }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
        <p className="text-lg font-medium">Not permitted</p>
        <p className="text-sm">You don't have access to this section.</p>
      </div>
    );
  }
  return children;
}
