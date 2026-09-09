import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Globe, Lock, User, AlertCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { login, language, setLanguage, t } = useAuth();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginId || !password) {
      setErrorMsg('Please fill in all fields.');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await login(loginId, password);
      navigate('/');
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'hi' : 'en');
  };

  return (
    <div className="min-h-screen bg-dark-950 text-dark-50 flex flex-col justify-center items-center p-4 relative font-sans overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-primary-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-82 h-82 bg-blue-600/10 rounded-full blur-3xl" />

      {/* Language Switch */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-dark-900 border border-dark-800 text-xs font-semibold text-dark-200 hover:text-white transition-all active:scale-95 shadow-md"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>{language === 'en' ? 'हिंदी' : 'English'}</span>
        </button>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary-600 to-emerald-500 flex items-center justify-center font-black text-2xl text-white shadow-xl shadow-primary-500/20 mx-auto mb-4 border border-primary-400/20">
            DS
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white">
            {t('appName')}
          </h2>
          <p className="text-xs text-dark-400 font-medium mt-1">
            AI-Powered Smart Dairy SaaS
          </p>
        </div>

        <div className="bg-dark-900/40 backdrop-blur-xl border border-dark-800 rounded-3xl p-6 shadow-2xl relative">
          <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary-500/40 to-transparent" />
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-900/50 flex gap-2.5 text-xs text-red-400 font-medium animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Email / Mobile
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 w-4 h-4 text-dark-500" />
                <input
                  type="text"
                  placeholder="Demo: owner@krishnadairy.com"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-dark-950/60 border border-dark-800 text-sm placeholder-dark-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 text-white transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-dark-400 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-dark-500" />
                <input
                  type="password"
                  placeholder="Demo: password123"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-dark-950/60 border border-dark-800 text-sm placeholder-dark-600 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 text-white transition-all"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-dark-400 hover:text-dark-200">
                <input
                  type="checkbox"
                  className="rounded bg-dark-950 border-dark-800 text-primary-500 focus:ring-0 focus:ring-offset-0"
                  defaultChecked
                />
                <span>Remember me</span>
              </label>
              <a href="#forgot" className="text-primary-400 hover:underline font-semibold">
                Forgot password?
              </a>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary-600 to-emerald-500 text-sm font-bold text-white shadow-lg shadow-primary-500/25 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Quick 1-Click Demo Fill Button */}
          <div className="mt-6 pt-4 border-t border-dark-800/80 space-y-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={async () => {
                setLoginId('owner@krishnadairy.com');
                setPassword('password123');
                setErrorMsg(null);
                setIsSubmitting(true);
                try {
                  await login('owner@krishnadairy.com', 'password123');
                  navigate('/');
                } catch (err: any) {
                  setErrorMsg(err.message || 'Login failed. Please try again.');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="w-full py-2.5 px-3 rounded-2xl bg-teal-950/50 border border-teal-800/60 hover:border-teal-500 text-xs font-bold text-teal-300 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50"
            >
              <span>🥛 1-Click Demo Login (Krishna Dairy)</span>
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-dark-500 font-medium mt-6">
          Krishna Dairy credentials: owner@krishnadairy.com / password123
        </p>
      </div>
    </div>
  );
};
