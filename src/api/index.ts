import axios from 'axios';

const isCapacitorNative = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform?.();

const isDevBrowser =
  typeof window !== 'undefined' &&
  !isCapacitorNative &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const baseUrl = isDevBrowser 
  ? 'http://localhost:5000/api' 
  : (import.meta.env.VITE_API_URL || 'https://dairy-management-backendd.onrender.com/api');

const API = axios.create({
  baseURL: baseUrl,
  timeout: 120000,
});

// Add a request interceptor to attach JWT token
API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle authentication expiry
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login if unauthorized
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default API;
