import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  themeMode: ThemeMode;
  isDark: boolean;
  setThemeMode: (mode: ThemeMode) => void;
  toggleTheme: () => void;
  timeScheduleInfo: string;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('dairy_theme_mode_v2') as ThemeMode | null;
    return saved || 'light';
  });

  const calculateIsDark = (mode: ThemeMode): boolean => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    const hour = new Date().getHours();
    return hour >= 20 || hour < 6;
  };

  const [isDark, setIsDark] = useState<boolean>(() => calculateIsDark(themeMode));

  useEffect(() => {
    const updateTheme = () => {
      const darkActive = calculateIsDark(themeMode);
      setIsDark(darkActive);

      const root = document.documentElement;
      const body = document.body;

      if (darkActive) {
        root.classList.remove('light');
        root.classList.add('dark');
        body.classList.remove('light');
        body.classList.add('dark');
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        body.classList.remove('dark');
        body.classList.add('light');
      }
    };

    updateTheme();
    const interval = setInterval(updateTheme, 60000);
    return () => clearInterval(interval);
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('dairy_theme_mode_v2', mode);
  };

  const toggleTheme = () => {
    setThemeMode(isDark ? 'light' : 'dark');
  };

  const timeScheduleInfo = isDark ? 'Obsidian Dark' : 'Pearl Light';

  return (
    <ThemeContext.Provider value={{ themeMode, isDark, setThemeMode, toggleTheme, timeScheduleInfo }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
