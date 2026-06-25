import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import HealthPage from "@/pages/HealthPage";
import CustomersPage from "@/pages/CustomersPage";
import CustomerDetailPage from "@/pages/CustomerDetailPage";
import SubscriptionsPage from "@/pages/SubscriptionsPage";
import PlansPage from "@/pages/PlansPage";
import LessonsPage from "@/pages/LessonsPage";
import MetricsPage from "@/pages/MetricsPage";
import EmailLogsPage from "@/pages/EmailLogsPage";

export default function App() {
  const location = useLocation();
  const isAuthFlow = location.pathname === "/login";

  if (isAuthFlow) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/clientes" replace />} />
        <Route
          path="/health"
          element={
            <ProtectedRoute>
              <HealthPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes"
          element={
            <ProtectedRoute>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clientes/:id"
          element={
            <ProtectedRoute>
              <CustomerDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assinaturas"
          element={
            <ProtectedRoute>
              <SubscriptionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/planos"
          element={
            <ProtectedRoute>
              <PlansPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/licoes"
          element={
            <ProtectedRoute>
              <LessonsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/metricas"
          element={
            <ProtectedRoute>
              <MetricsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/emails"
          element={
            <ProtectedRoute>
              <EmailLogsPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/clientes" replace />} />
      </Routes>
    </AdminLayout>
  );
}
