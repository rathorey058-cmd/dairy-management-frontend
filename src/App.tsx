import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/protected/ProtectedRoute';
import { DashboardLayout } from './layouts/DashboardLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { MilkEntry } from './pages/MilkEntry';
import { FarmersList } from './pages/FarmersList';
import { Orders } from './pages/Orders';
import { Production } from './pages/Production';
import { More } from './pages/More';
import { Payments } from './pages/Payments';
import { Galla } from './pages/Galla';
import { CloseDay } from './pages/CloseDay';
import { Assistant } from './pages/Assistant';
import { Menu } from './pages/Menu';
import { MilkBandhiPage } from './pages/MilkBandhiPage';
import { DuePaymentsPage } from './pages/DuePaymentsPage';
import { ThemeProvider } from './context/ThemeContext';

const App: React.FC = () => {
  React.useEffect(() => {
    const handleBackButton = () => {
      if (window.location.hash === '#/' || window.location.hash === '') {
        (window as any).Capacitor?.Plugins?.App?.exitApp();
      } else {
        window.history.back();
      }
    };
    document.addEventListener('backbutton', handleBackButton);
    return () => {
      document.removeEventListener('backbutton', handleBackButton);
    };
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
          
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Dashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/milk"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <MilkEntry />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/milk-collection"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <MilkEntry />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/milk-entry"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <MilkEntry />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/farmers"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <FarmersList />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Orders />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sales"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Orders />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/production"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Production />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Production />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Menu />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/more"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <More />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/payments"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Payments />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/galla"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Galla />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/closeday"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CloseDay />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/close-day"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <CloseDay />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/assistant"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Assistant />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/bandhi"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <MilkBandhiPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/milk-bandhi"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <MilkBandhiPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/udhari"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DuePaymentsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/due-payments"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <DuePaymentsPage />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
          {/* Wildcard fallback to prevent black screen on unknown routes */}
          <Route
            path="*"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Dashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;
