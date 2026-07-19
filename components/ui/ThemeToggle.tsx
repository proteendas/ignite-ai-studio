'use client';

import { useEffect, useState } from 'react';

/**
 * Dark-mode-first theme toggle. The app defaults to dark (html.dark is set at
 * render); this flips and persists the choice to localStorage. Uses Bootstrap
 * Icons (bi-moon-stars / bi-sun) per the design system.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem('igniteai-theme') as 'dark' | 'light' | null) ?? 'dark';
    setTheme(stored);
    document.documentElement.classList.toggle('dark', stored === 'dark');
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('igniteai-theme', next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className="focus-ignite inline-flex h-9 w-9 items-center justify-center rounded-md border border-surface-3 text-content-muted transition-colors hover:text-content hover-glow"
    >
      <i className={`bi ${theme === 'dark' ? 'bi-sun' : 'bi-moon-stars'}`} aria-hidden="true" />
    </button>
  );
}
