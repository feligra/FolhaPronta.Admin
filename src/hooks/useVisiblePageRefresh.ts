import { useEffect, useRef } from "react";

/** Atualiza dados que também podem mudar em outra aba, sem recarregar a tela. */
export function useVisiblePageRefresh(refresh: () => void, intervalMs = 30_000) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    let lastRefresh = 0;
    const update = () => {
      if (document.visibilityState !== "visible") return;
      // Voltar para a aba pode disparar visibilitychange e focus juntos.
      const now = Date.now();
      if (now - lastRefresh < 500) return;
      lastRefresh = now;
      refreshRef.current();
    };
    const timer = window.setInterval(update, intervalMs);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [intervalMs]);
}
