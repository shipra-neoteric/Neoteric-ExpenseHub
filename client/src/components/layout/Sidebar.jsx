import React from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Wallet, ShieldCheck, Users, FileBarChart, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PERMISSIONS } from '../../utils/permissions';

const NAV_ITEMS = [
  { to: '/', label: 'Site Expenses', icon: LayoutDashboard, permission: PERMISSIONS.VIEW },
  { to: '/funds', label: 'Funds / Imprest', icon: Wallet, permission: PERMISSIONS.FUND_VIEW },
  { to: '/reports', label: 'Reports', icon: FileBarChart, permission: PERMISSIONS.REPORT_EXPORT },
  { to: '/master', label: 'Master', icon: ShieldCheck, permission: PERMISSIONS.MASTER_MANAGE },
  { to: '/users', label: 'User Management', icon: Users, permission: PERMISSIONS.USER_SCOPE_MANAGE },
];

function Logo() {
  return (
    <div className="flex h-16 items-center gap-2.5 px-5">
      <div className="theme-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white">N</div>
      <span className="text-lg font-semibold text-gray-900 dark:text-white">Neoteric</span>
    </div>
  );
}

function Nav({ onNavigate }) {
  const { hasPermission } = useAuth();
  return (
    <nav className="flex-1 space-y-1 px-3 py-2">
      {NAV_ITEMS.filter((item) => hasPermission(item.permission)).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-2.5 py-2 text-[15px] transition ${
              isActive ? 'theme-text bg-[var(--theme-primary)]/10 font-semibold' : 'theme-nav-hover text-gray-600 dark:text-gray-300'
            }`
          }
        >
          <item.icon className="h-4.5 w-4.5" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  return (
    <>
      <aside className="hidden shrink-0 flex-col bg-white/90 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl dark:bg-gray-800/95 lg:my-1 lg:ml-1 lg:flex lg:w-64 lg:rounded-xl">
        <Logo />
        <Nav />
      </aside>

      {mobileOpen &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCloseMobile} aria-hidden="true" />
            <div className="relative flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-2xl dark:bg-gray-800">
              <div className="flex items-center justify-between pr-3">
                <Logo />
                <button type="button" onClick={onCloseMobile} aria-label="Close menu" className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <Nav onNavigate={onCloseMobile} />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
