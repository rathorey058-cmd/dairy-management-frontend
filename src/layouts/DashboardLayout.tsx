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
  const { isDark, toggleTheme, timeScheduleInfo } = useTheme();
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
    <div className="min-h-screen bg-dark-950 text-dark-100 flex transition-colors duration-200 relative overflow-x-hidden">
      {/* Subtle Ambient Accent (Dark Mode Only) */}
      {isDark && (
        <div className="fixed top-0 left-0 w-full h-72 pointer-events-none z-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_-20%,rgba(16,185,129,0.09),rgba(0,0,0,0))]" />
      )}

      {/* ========================================================
          DESKTOP SIDEBAR (Executive SaaS Style)
         ======================================================== */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-dark-900 border-r border-dark-800 sticky top-0 h-screen z-40 select-none">
        
        {/* Brand Header */}
        <div className="px-5 py-4 border-b border-dark-800 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 keep-white-text flex items-center justify-center shadow-sm shrink-0">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
              </svg>
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-bold text-white truncate tracking-tight">
                {tenant?.name || 'DairySmart OS'}
              </h1>
              <p className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>AI Vision Suite</span>
              </p>
            </div>
          </div>
        </div>

        {/* Quick Shift CTA */}
        <div className="p-3.5 border-b border-dark-800">
          <button
            onClick={() => navigate('/milk')}
            className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white keep-white-text font-semibold text-xs shadow-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>त्वरित दूध संकलन (Milk Entry)</span>
          </button>
        </div>

        {/* Navigation Link Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5 custom-scrollbar">
          {sidebarGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-dark-400">
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
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-[13px] font-medium transition-all group ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20'
                          : 'text-dark-300 hover:text-white hover:bg-dark-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${
                          isActive ? 'text-emerald-400' : 'text-dark-400 group-hover:text-dark-200'
                        }`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
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
        <div className="p-3 border-t border-dark-800 bg-dark-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-dark-800 border border-dark-700 flex items-center justify-center font-semibold text-xs text-white shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-semibold text-white truncate">{user?.name || 'Operator'}</p>
              <p className="text-[10px] text-dark-400 truncate">{tenant?.ownerName || user?.role || 'Admin'}</p>
            </div>
          </div>
          <button
            onClick={() => setIsWizardOpen(true)}
            className="p-1.5 rounded-lg bg-dark-800 text-dark-400 hover:text-white border border-dark-700 transition-colors"
            title="विज़ार्ड सेटिंग्स"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

      </aside>

      {/* ========================================================
          RIGHT CONTENT WRAPPER
         ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-6 relative z-10">
        
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 bg-dark-900/90 backdrop-blur-md border-b border-dark-800 px-4 sm:px-6 py-2.5 flex items-center justify-between">
          
          {/* Left Brand info on Mobile / Quick Navigation on Desktop */}
          <div className="flex items-center gap-3">
            <div className="lg:hidden flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 keep-white-text flex items-center justify-center shadow-sm">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-white truncate max-w-[140px] sm:max-w-xs">
                  {tenant?.name || 'DairySmart OS'}
                </h1>
                <p className="text-[10px] text-emerald-400 font-medium -mt-0.5">AI Vision & POS</p>
              </div>
            </div>

            {/* Clean Executive Quick Action Buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => {
                  sound.playClick();
                  navigate('/milk');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/15 transition-all"
              >
                <Droplets className="w-3.5 h-3.5" />
                <span>{t('quickMilkEntryBtn')}</span>
              </button>

              <button
                onClick={() => {
                  sound.playCashRegister();
                  navigate('/payments');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                <span>{t('billingDecadeBtn')}</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  navigate('/ai-camera');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all"
              >
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t('aiTheftAlertsBtn')}</span>
              </button>

              <button
                onClick={() => {
                  sound.playClick();
                  setIsWizardOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all"
              >
                <Settings className="w-3.5 h-3.5 text-dark-400" />
                <span>{t('setupWizardBtn')}</span>
              </button>
            </div>
          </div>

          {/* Right Header Action Icons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            
            {/* Audio Feedback Sound Toggle */}
            <button
              onClick={toggleSound}
              className={`p-2 rounded-lg border transition-all ${
                isSoundOn
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                  : 'bg-dark-800 border-dark-700 text-dark-400'
              }`}
              title={isSoundOn ? 'साउंड ऑन (Audio Effects ON)' : 'साउंड म्यूट (Audio Effects OFF)'}
            >
              {isSoundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
            
            {/* Universal Quick Refresh Button */}
            <button
              onClick={handleGlobalRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-xs font-medium text-dark-200 hover:text-white transition-all"
              title="डेटा रीफ्रेश करें (Refresh Data)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : 'text-dark-400'}`} />
              <span className="text-[11px] hidden md:inline">{isRefreshing ? 'रीफ्रेश...' : 'रीफ्रेश'}</span>
            </button>

            {/* Gemini AI Side Board Trigger */}
            <button
              onClick={() => setIsGeminiChatOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/15 transition-all"
              title="AI Assistant"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden xs:inline">AI सहायक</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-xs font-medium text-dark-200 hover:text-white transition-all"
              title={`${timeScheduleInfo} (बदलने के लिए क्लिक करें)`}
            >
              {isDark ? (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden sm:inline">Dark</span>
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Light</span>
                </span>
              )}
            </button>

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="px-2.5 py-1.5 rounded-lg bg-dark-800 border border-dark-700 text-xs font-semibold text-dark-200 hover:text-white transition-all"
            >
              <Globe className="w-3.5 h-3.5 inline mr-1 text-dark-400" />
              <span className="text-[11px]">{language === 'en' ? 'हिंदी' : 'EN'}</span>
            </button>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-dark-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
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
