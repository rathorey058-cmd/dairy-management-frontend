import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { 
  Home, ShoppingCart, Droplets, Factory, Menu, Globe, LogOut, 
  Sun, Moon, Sparkles, RefreshCw, Camera, Calendar, Wallet, 
  Users, Truck, CreditCard, Lock, Settings, Plus, UtensilsCrossed,
  Volume2, VolumeX
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { GeminiChatBoard } from '../components/GeminiChatBoard';
import { DraggableGeminiButton } from '../components/DraggableGeminiButton';
import { FirstTimeSetupWizard } from '../components/onboarding/FirstTimeSetupWizard';
import { sound } from '../utils/soundEngine';

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, tenant, language, setLanguage, logout, t } = useAuth();
  const { themeMode, isDark, toggleTheme, timeScheduleInfo } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [isGeminiChatOpen, setIsGeminiChatOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(true);

  const toggleSound = () => {
    const nextState = !isSoundOn;
    setIsSoundOn(nextState);
    sound.enabled = nextState;
    if (nextState) sound.playClick();
  };

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

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  // Sidebar navigation structure
  const sidebarGroups = [
    {
      title: t('navOperations'),
      items: [
        { path: '/', label: t('dashboard'), icon: Home },
        { path: '/milk', label: t('milk'), icon: Droplets, badge: language === 'hi' ? 'लाइव' : 'Live' },
        { path: '/payments', label: t('navBilling'), icon: Calendar, badge: language === 'hi' ? 'दशक' : '10-Day' },
        { path: '/ai-camera', label: t('navAiCamera'), icon: Camera, badge: 'AI' },
      ]
    },
    {
      title: t('navRetail'),
      items: [
        { path: '/orders', label: t('orders'), icon: ShoppingCart },
        { path: '/galla', label: t('galla'), icon: Wallet },
        { path: '/bandhi', label: t('navBandhi'), icon: Truck },
        { path: '/udhari', label: t('navUdhari'), icon: CreditCard },
      ]
    },
    {
      title: t('navManagement'),
      items: [
        { path: '/farmers', label: t('farmers'), icon: Users },
        { path: '/production', label: t('production'), icon: Factory },
        { path: '/menu', label: t('navMenu'), icon: UtensilsCrossed },
        { path: '/close-day', label: t('navCloseDay'), icon: Lock },
        { path: '/more', label: t('more'), icon: Settings },
      ]
    }
  ];

  // Mobile Bottom Nav items (Essential 5)
  const mobileNavItems = [
    { path: '/', label: t('dashboard'), icon: Home },
    { path: '/milk', label: t('milk'), icon: Droplets },
    { path: '/payments', label: t('navBilling'), icon: Calendar },
    { path: '/ai-camera', label: t('navAiCamera'), icon: Camera },
    { path: '/more', label: t('more'), icon: Menu },
  ];

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex transition-colors duration-300 relative overflow-x-hidden">
      
      {/* 🌄 Subtle Ambient Depth Lighting */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.12),rgba(255,255,255,0))]" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed top-1/2 left-0 w-80 h-80 bg-teal-500/10 rounded-full blur-[140px] pointer-events-none z-0" />

      {/* ========================================================
          DESKTOP SIDEBAR (Visible on lg: screens and up)
         ======================================================== */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 bg-[#0F1424] border-r-2 border-slate-800 sticky top-0 h-screen z-40 select-none shadow-2xl">
        
        {/* Brand Header */}
        <div className="p-5 border-b border-dark-800/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-indigo-600 flex items-center justify-center font-black text-white shadow-lg shadow-emerald-950/50 text-base">
              🐄
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-black text-white truncate tracking-tight">
                {tenant?.name || 'Dairy Smart Engine'}
              </h1>
              <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>AI POS V2.0 • Online</span>
              </p>
            </div>
          </div>
        </div>

        {/* Quick Shift CTA */}
        <div className="p-4 border-b border-dark-800/50">
          <button
            onClick={() => navigate('/milk')}
            className="w-full py-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-md shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all active:scale-95 group"
          >
            <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
            <span>+ त्वरित दूध संकलन (Milk Entry)</span>
          </button>
        </div>

        {/* Navigation Link Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5 custom-scrollbar">
          {sidebarGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <p className="px-3 text-[10px] font-black uppercase tracking-wider text-dark-400">
                {group.title}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-500/15 to-indigo-500/15 text-white border border-emerald-500/30 shadow-sm font-bold'
                          : 'text-dark-300 hover:text-white hover:bg-dark-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                          isActive ? 'text-emerald-400' : 'text-dark-400 group-hover:text-dark-200'
                        }`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase tracking-wider border ${
                          item.badge === '2-Line' 
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : item.badge === 'दशक'
                            ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Profile / Quick Settings in Sidebar */}
        <div className="p-3 border-t border-dark-800/80 bg-dark-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-8 h-8 rounded-xl bg-dark-800 border border-dark-700 flex items-center justify-center font-bold text-xs text-white shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white truncate">{user?.name || 'Operator'}</p>
              <p className="text-[10px] text-dark-400 truncate">{tenant?.ownerName || user?.role || 'Admin'}</p>
            </div>
          </div>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="p-1.5 rounded-xl bg-dark-800 text-dark-400 hover:text-white border border-dark-700 transition-colors"
            title="विज़ार्ड सेटिंग्स"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </aside>

      {/* ========================================================
          RIGHT CONTENT WRAPPER
         ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-6">
        
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-dark-900/80 backdrop-blur-xl border-b border-dark-800 px-4 sm:px-6 py-3 flex items-center justify-between shadow-lg">
          
          {/* Left Brand info on Mobile / Breadcrumb on Desktop */}
          <div className="flex items-center gap-3">
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center font-bold text-white text-sm shadow-md">
                🐄
              </div>
              <div>
                <h1 className="text-sm font-black text-white truncate max-w-[140px] sm:max-w-xs">
                  {tenant?.name || 'Smart Dairy'}
                </h1>
                <p className="text-[9px] text-emerald-400 font-bold -mt-0.5">10-Day Cycle • AI Engine</p>
              </div>
            </div>

            {/* Desktop Quick Action Chips for Fast 1-Click Operations */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => {
                  sound.playClick();
                  navigate('/milk');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 text-xs font-black text-emerald-300 hover:bg-emerald-500/30 transition-all active:scale-95 shadow-sm"
              >
                <Droplets className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('quickMilkEntryBtn')}</span>
              </button>

              <button
                onClick={() => {
                  sound.playCashRegister();
                  navigate('/payments');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/20 border-2 border-indigo-500/50 text-xs font-black text-indigo-300 hover:bg-indigo-500/30 transition-all active:scale-95 shadow-sm"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t('billingDecadeBtn')}</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  navigate('/ai-camera');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500/20 border-2 border-rose-500/50 text-xs font-black text-rose-300 hover:bg-rose-500/30 transition-all active:scale-95 shadow-sm"
              >
                <Camera className="w-3.5 h-3.5 text-rose-400" />
                <span>{t('aiTheftAlertsBtn')}</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setIsWizardOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800 border-2 border-slate-700 text-xs font-black text-slate-200 hover:text-white hover:border-slate-500 transition-all active:scale-95 shadow-sm"
              >
                <Settings className="w-3.5 h-3.5 text-amber-400" />
                <span>{t('setupWizardBtn')}</span>
              </button>
            </div>
          </div>

          {/* Right Header Action Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Audio Feedback Sound Toggle */}
            <button
              onClick={toggleSound}
              className={`p-2 rounded-full border-2 transition-all active:scale-95 ${
                isSoundOn
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-sm'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
              title={isSoundOn ? 'साउंड ऑन (Audio Effects ON)' : 'साउंड म्यूट (Audio Effects OFF)'}
            >
              {isSoundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            
            {/* Universal Quick Refresh Button */}
            <button
              onClick={handleGlobalRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-emerald-400 hover:border-emerald-500/40 transition-all active:scale-95 shadow-sm"
              title="डेटा रीफ्रेश करें (Refresh Data)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : 'text-dark-300'}`} />
              <span className="text-[11px] hidden md:inline">{isRefreshing ? 'रीफ्रेश...' : 'रीफ्रेश'}</span>
            </button>

            {/* Gemini AI Side Board Trigger */}
            <button
              onClick={() => setIsGeminiChatOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 border border-indigo-500/40 text-xs font-bold text-indigo-300 hover:text-white transition-all active:scale-95 shadow-sm"
              title="Google Gemini AI Assistant"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span className="text-[11px] hidden xs:inline">Gemini AI</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-full bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all active:scale-95"
              title={`${timeScheduleInfo} (Click to toggle)`}
            >
              {themeMode === 'auto' ? (
                <span className="flex items-center gap-1 text-[11px] text-teal-400 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  <span className="hidden sm:inline">Auto</span>
                </span>
              ) : isDark ? (
                <span className="flex items-center gap-1 text-[11px] text-indigo-400 font-bold">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Dark</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-amber-400 font-bold">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Light</span>
                </span>
              )}
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="px-2.5 py-1.5 rounded-full bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all active:scale-95"
            >
              <Globe className="w-3.5 h-3.5 inline mr-1" />
              <span className="text-[11px] font-bold">{language === 'en' ? 'हिंदी' : 'EN'}</span>
            </button>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-xl text-dark-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
              title={t('logout')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Content: Fluid & Responsive (Wide container on desktop) */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5">
          {children}
        </main>

      </div>

      {/* ========================================================
          MOBILE BOTTOM NAVIGATION (Only visible on < lg screens)
         ======================================================== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-dark-900/95 backdrop-blur-xl border-t border-dark-800/90 shadow-2xl">
        <div className="flex justify-around items-center h-16 px-2 max-w-md mx-auto">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center transition-all relative ${
                  isActive ? 'text-emerald-400 font-bold' : 'text-dark-400 hover:text-dark-200'
                }`}
              >
                {isActive && (
                  <span className="absolute top-0 w-8 h-1 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full" />
                )}
                <Icon className={`w-5 h-5 mb-0.5 transition-transform ${isActive ? 'scale-110 text-emerald-400' : ''}`} />
                <span className="text-[10px] tracking-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Setup Wizard Modal (Accessible from anywhere) */}
      <FirstTimeSetupWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
      />

      {/* Floating Gemini AI Launcher */}
      <DraggableGeminiButton onClick={() => setIsGeminiChatOpen(true)} />

      {/* Gemini AI Side Drawer */}
      <GeminiChatBoard
        isOpen={isGeminiChatOpen}
        onClose={() => setIsGeminiChatOpen(false)}
      />

    </div>
  );
};
