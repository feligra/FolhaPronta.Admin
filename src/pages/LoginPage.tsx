import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { login, isAuthenticated, isAdmin, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Já logado como admin → manda direto pro painel.
  useEffect(() => {
    if (isAuthenticated && isAdmin) navigate("/health", { replace: true });
  }, [isAuthenticated, isAdmin, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Preencha e-mail e senha.");
      return;
    }
    try {
      const user = await login({ email: email.trim(), password });
      if (user.role !== "Admin") {
        // Login funcionou mas user comum — limpa a sessão e mostra erro.
        // Sem isso o usuário ficaria com token válido mas todas as rotas
        // do painel cairiam no ForbiddenScreen, o que é confuso.
        await logout();
        setError("Esta conta não tem acesso ao painel administrativo.");
        return;
      }
      navigate("/health", { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
        "Credenciais inválidas.";
      setError(msg);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-creme px-4">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-tinta">
            <span className="font-display text-xl font-bold text-creme">F</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-tinta">FolhaPronta · Admin</h1>
          <p className="mt-1 text-sm text-cinza">Acesso restrito a administradores.</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-coral-50 p-3 text-sm text-coral-800">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="label">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@folhapronta.org"
              autoComplete="email"
              className="input"
            />
          </div>

          <div>
            <label className="label">Senha</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-cinza hover:text-tinta"
                aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="btn-primary w-full">
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
