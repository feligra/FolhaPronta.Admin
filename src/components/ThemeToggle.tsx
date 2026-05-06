import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

/**
 * Toggle claro/escuro pra sidebar do admin. Mesma estética dos outros
 * itens de nav (ícone + label esquerda → ação à direita) pra não destoar.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-tinta transition hover:bg-tintaSoft-50"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span className="flex-1 text-left">Tema {isDark ? "claro" : "escuro"}</span>
    </button>
  );
}
