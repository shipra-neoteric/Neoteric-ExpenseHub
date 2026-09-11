import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';

const ThemeContext = createContext(null);

// Per-company brand color, resolved at runtime. Default matches
// UI_STYLE_GUIDE.md's documented default (orange-500).
const BRAND_PRESETS = {
  neoteric: { primary: '#f97316', primaryLight: '#fb923c', primaryDark: '#ea580c' },
};

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('theme') || 'dark');
  const [brandKey] = useState('neoteric');
  const appliedOnce = useRef(false);

  // Applied synchronously before paint (not a useEffect) to avoid a flash of
  // the wrong theme, per UI_STYLE_GUIDE.md section 4.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (mode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', mode);

    if (!appliedOnce.current) {
      const preset = BRAND_PRESETS[brandKey];
      root.style.setProperty('--theme-primary', preset.primary);
      root.style.setProperty('--theme-primary-light', preset.primaryLight);
      root.style.setProperty('--theme-primary-dark', preset.primaryDark);
      appliedOnce.current = true;
    }
  }, [mode, brandKey]);

  const value = useMemo(
    () => ({
      mode,
      isDark: mode === 'dark',
      toggleTheme: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
      toggleMode: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')),
      getThemeColor: (shade = 'DEFAULT') => {
        const preset = BRAND_PRESETS[brandKey];
        if (shade === 'light') return preset.primaryLight;
        if (shade === 'dark') return preset.primaryDark;
        return preset.primary;
      },
    }),
    [mode, brandKey]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
