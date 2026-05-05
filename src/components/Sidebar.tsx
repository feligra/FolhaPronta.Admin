import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Users, CreditCard, Package, BarChart3, Mail, LogOut, Menu, X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Activity;
  disabled?: boolean;
}

// Fases 1–5 entregues: Health + Clientes + Assinaturas + Planos + Métricas + Emails.
const NAV: NavItem[] = [
  { to: "/metricas", label: "Métricas", icon: BarChart3 },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/assinaturas", label: "Assinaturas", icon: CreditCard },
  { to: "/planos", label: "Planos", icon: Package },
  { to: "/emails", label: "Logs de email", icon: Mail },
  { to: "/health", label: "Saúde do painel", icon: Activity },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Fecha o drawer ao navegar entre páginas.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      {/* Mobile header */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-tintaSoft-100 bg-creme px-4 lg:hidden">
        <button onClick={() => setMobileOpen(true)} aria-label="Abrir menu" className="p-2">
          <Menu size={20} />
        </button>
        <div className="font-display text-lg font-bold text-tinta">FolhaPronta · Admin</div>
        <div className="w-9" />
      </header>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-tinta/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-tintaSoft-100 bg-creme transition-transform lg:static lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-tintaSoft-100 px-5">
          <div>
            <div className="font-display text-lg font-bold leading-tight text-tinta">FolhaPronta</div>
            <div className="text-[11px] uppercase tracking-wider text-cinza">Painel Admin</div>
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
            className="p-1 lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            if (item.disabled) {
              return (
                <div
                  key={item.to}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-tintaSoft-200"
                  title="Disponível em fases futuras"
                >
                  <Icon size={16} />
                  <span className="flex-1">{item.label}</span>
                  <span className="rounded-full bg-tintaSoft-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                    em breve
                  </span>
                </div>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-coral-50 text-coral-800"
                      : "text-tinta hover:bg-tintaSoft-50"
                  }`
                }
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User + logout */}
        <div className="border-t border-tintaSoft-100 p-4">
          {user && (
            <div className="mb-3">
              <div className="truncate text-sm font-semibold text-tinta">{user.name}</div>
              <div className="truncate text-xs text-cinza">{user.email}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-tinta transition hover:bg-coral-50 hover:text-coral-800"
          >
            <LogOut size={16} />
            Sair
          </button>
        </div>
      </aside>
    </>
  );
}
