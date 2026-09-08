import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Home, ShoppingCart, Droplets, Factory, Menu, Globe, LogOut, Sun, Moon, Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { GeminiChatBoard } from '../components/GeminiChatBoard';

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, tenant, language, setLanguage, logout, t } = useAuth();
  const { themeMode, isDark, toggleTheme, timeScheduleInfo } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isGeminiChatOpen, setIsGeminiChatOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleGlobalRefresh = () => {
    setIsRefreshing(true);
    window.dispatchEvent(new CustomEvent('app:refresh'));
    setTimeout(() => {
      setIsRefreshing(false);
    }, 800);
  };

  const navItems = [
    { path: '/', label: t('dashboard'), icon: Home },
    { path: '/orders', label: t('orders'), icon: ShoppingCart },
    { path: '/milk', label: t('milk'), icon: Droplets },
    { path: '/production', label: t('production'), icon: Factory },
    { path: '/more', label: t('more'), icon: Menu },
  ];

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  return (
    <div className="min-h-screen bg-dark-950 text-dark-50 flex flex-col pb-16 font-sans transition-colors duration-300">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-dark-900/80 backdrop-blur-md border-b border-dark-800 px-4 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center font-bold text-white shadow-md shadow-primary-500/20">
            K
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">
              {tenant ? tenant.name : t('appName')}
            </h1>
            <p className="text-[10px] text-dark-400 font-medium -mt-1">
              {user ? `${user.name} (${user.role})` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Universal Quick Refresh Button */}
          <button
            onClick={handleGlobalRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-emerald-400 hover:border-emerald-500/40 transition-all active:scale-95 shadow-sm"
            title="डेटा रीफ्रेश करें (Refresh Data)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : 'text-dark-300'}`} />
            <span className="text-[11px] hidden sm:inline">{isRefreshing ? 'रीफ्रेश...' : 'रीफ्रेश'}</span>
          </button>

          {/* Gemini AI Side Board Header Trigger */}
          <button
            onClick={() => setIsGeminiChatOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 border border-indigo-500/40 text-xs font-bold text-indigo-300 hover:text-white transition-all active:scale-95 shadow-sm"
            title="Google Gemini AI Chat Board"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span className="text-[11px]">Gemini AI</span>
          </button>

          {/* Automatic Theme Mode Toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all active:scale-95"
            title={`${timeScheduleInfo} (Click to switch)`}
          >
            {themeMode === 'auto' ? (
              <span className="flex items-center gap-1 text-[11px] text-teal-400 font-bold">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>Auto</span>
              </span>
            ) : isDark ? (
              <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-bold">
                <Moon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dark</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[11px] text-amber-400 font-bold">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </span>
            )}
          </button>

          {/* Language Toggle */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all active:scale-95"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{language === 'en' ? 'हिंदी' : 'EN'}</span>
          </button>

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-dark-800 transition-colors"
            title={t('logout')}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-lg mx-auto p-4 md:max-w-xl lg:max-w-2xl">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-dark-900 border-t border-dark-800 shadow-xl max-w-lg mx-auto md:max-w-xl lg:max-w-2xl rounded-t-2xl">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all relative ${
                  isActive ? 'text-primary-400 font-semibold' : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 w-8 h-1 bg-primary-500 rounded-full animate-pulse" />
                )}
                <Icon className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[10px] tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Floating Google Gemini AI Chat Board Launcher */}
      <button
        onClick={() => setIsGeminiChatOpen(true)}
        className="fixed bottom-20 right-4 z-40 p-3.5 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-600/30 hover:brightness-110 active:scale-95 transition-all border border-indigo-400/40 group"
        title="Google Gemini AI Chat Board (बातचीत और कमांड बोर्ड)"
      >
        <Sparkles className="w-5 h-5 animate-pulse" />
      </button>

      {/* Google Gemini AI Side Chat Board Drawer */}
      <GeminiChatBoard
        isOpen={isGeminiChatOpen}
        onClose={() => setIsGeminiChatOpen(false)}
      />
    </div>
  );
};
