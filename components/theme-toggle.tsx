'use client';

import { Lightbulb, LightbulbOff } from 'lucide-react';
import { useTheme } from './theme-provider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="border border-foreground p-1.5 hover:bg-foreground hover:text-background transition-colors"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? (
        <LightbulbOff className="h-3.5 w-3.5" strokeWidth={1.5} />
      ) : (
        <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.5} />
      )}
    </button>
  );
}
