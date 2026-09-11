import React from 'react';
import { Sun, Moon, LogOut, Menu } from 'lucide-react';
import { useTheme } from '../../theme/ThemeContext';
import { useAuth } from '../../context/AuthContext';

function initials(name) {
  return (name || '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function Header({ onOpenMobileNav }) {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-800 sm:px-5">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open menu"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="mx-1 hidden text-right sm:block">
          <p className="text-sm font-medium text-gray-900 dark:text-white">{user?.name}</p>
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{user?.roleLabel}</p>
        </div>
        <div className="theme-gradient flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white">{initials(user?.name)}</div>
        <button
          type="button"
          onClick={logout}
          aria-label="Log out"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-600 active:scale-95 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
