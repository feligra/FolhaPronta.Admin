import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Gateway de rota: exige usuário autenticado E com role=Admin. Sem token →
 * /login; com token mas role != Admin → /forbidden (renderizado direto, sem
 * limpar a sessão — usuário comum logado não deveria sequer ter chegado aqui).
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (!isAdmin) {
    return <ForbiddenScreen />;
  }
  return <>{children}</>;
}

function ForbiddenScreen() {
  return (
    <div className="grid min-h-screen place-items-center bg-creme p-6">
      <div className="card max-w-md text-center">
        <h1 className="font-display text-2xl font-bold text-tinta">Acesso negado</h1>
        <p className="mt-2 text-sm text-cinza">
          Sua conta não tem permissão de administrador. Entre com uma conta admin
          ou volte ao app principal.
        </p>
        <a href="/login" className="btn-primary mt-5 inline-flex">Voltar ao login</a>
      </div>
    </div>
  );
}
