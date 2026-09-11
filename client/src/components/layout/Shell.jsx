import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Shell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
