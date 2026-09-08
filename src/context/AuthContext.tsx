import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../api';
import { translations, type Language } from '../utils/localization';

type TranslationKeys = keyof typeof translations['en'];

interface AuthContextType {
  token: string | null;
  user: any | null;
  tenant: any | null;
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKeys) => string;
  login: (loginId: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<any | null>(null);
  const [tenant, setTenant] = useState<any | null>(null);
  const [language, setLanguageState] = useState<Language>('en');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    // Load stored language preference
    const storedLang = localStorage.getItem('language') as Language;
    if (storedLang === 'en' || storedLang === 'hi') {
      setLanguageState(storedLang);
    }

    const storedUser = localStorage.getItem('user');
    const storedTenant = localStorage.getItem('tenant');
    if (storedUser) setUser(JSON.parse(storedUser));
    if (storedTenant) setTenant(JSON.parse(storedTenant));

    // Verify session
    const initAuth = async () => {
      if (token) {
        try {
          const res = await API.get('/auth/me');
          setUser(res.data.user);
          setTenant(res.data.tenant);
          localStorage.setItem('user', JSON.stringify(res.data.user));
          if (res.data.tenant) {
            localStorage.setItem('tenant', JSON.stringify(res.data.tenant));
          }
        } catch (error) {
          console.error('Session verification failed', error);
          logout();
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [token]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  const t = (key: TranslationKeys): string => {
    return translations[language][key] || translations['en'][key] || String(key);
  };

  const login = async (loginId: string, password: string) => {
    setLoading(true);
    try {
      const res = await API.post('/auth/login', { loginId, password });
      const { token: receivedToken, user: receivedUser, tenant: receivedTenant } = res.data;
      
      setToken(receivedToken);
      setUser(receivedUser);
      setTenant(receivedTenant);

      localStorage.setItem('token', receivedToken);
      localStorage.setItem('user', JSON.stringify(receivedUser));
      if (receivedTenant) {
        localStorage.setItem('tenant', JSON.stringify(receivedTenant));
      }
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenant(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
  };

  return (
    <AuthContext.Provider value={{ token, user, tenant, language, setLanguage, t, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
