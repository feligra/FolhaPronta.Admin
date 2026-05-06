import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "fp_admin_theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    // Sem preferência salva — segue o sistema.
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  } catch {
    /* noop */
  }
  return "light";
}

/**
 * Hook que sincroniza o atributo `data-theme` no <html> com o estado React e
 * persiste a escolha do usuário em localStorage. Inicializa com a preferência
 * do sistema na primeira visita.
 *
 * IMPORTANTE: pra evitar flash do tema claro antes do JS rodar, o `main.tsx`
 * aplica o tema sincronamente ANTES do React montar (ver applyInitialTheme).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggle };
}

/**
 * Aplica o tema inicial no <html> ANTES do React montar — chamado uma vez
 * no main.tsx. Sem isso, todo refresh dá um flash de tema claro antes do
 * useTheme() rodar.
 */
export function applyInitialTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", readInitialTheme());
}
