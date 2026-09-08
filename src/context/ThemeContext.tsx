import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeMode = 'auto' | 'dark' | 'light';

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
    return (localStorage.getItem('dairy_theme_mode') as ThemeMode) || 'auto';
  });

  const calculateIsDark = (mode: ThemeMode): boolean => {
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    
    // Auto Mode: Morning / Day (< 18:00 / 6:00 PM) = Dark; Evening / Night (>= 18:00 / 6:00 PM) = Light
    const hour = new Date().getHours();
    return hour < 18;
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

    // Check every 30 seconds for automatic 6:00 PM shift transition
    const interval = setInterval(updateTheme, 30000);
    return () => clearInterval(interval);
  }, [themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    localStorage.setItem('dairy_theme_mode', mode);
  };

  const toggleTheme = () => {
    if (themeMode === 'auto') {
      setThemeMode('dark');
    } else if (themeMode === 'dark') {
      setThemeMode('light');
    } else {
      setThemeMode('auto');
    }
  };

  const currentHour = new Date().getHours();
  const timeScheduleInfo = themeMode === 'auto' 
    ? (currentHour < 18 ? 'Auto: Morning Dark (till 6 PM)' : 'Auto: Evening Light (after 6 PM)')
    : themeMode === 'dark' ? 'Manual Dark' : 'Manual Light';

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
