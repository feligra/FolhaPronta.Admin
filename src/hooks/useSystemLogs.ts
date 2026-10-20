import { useCallback, useEffect, useRef, useState } from "react";
import { adminApi } from "@/services/api";
import type { AdminLogsResponse, SystemLogEntry, SystemLogLevel } from "@/types";

export const SYSTEM_LOG_LIMIT = 2000;
type Connection = "loading" | "live" | "reconnecting" | "paused" | "hidden";
type WindowState = {
  key: string | null; reload: number; ready: boolean; cursor: number; nextBefore: number | null;
  entries: SystemLogEntry[]; historyRequested: boolean; fetchAt: number; omitted: number;
  instanceId?: string;
};

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) { resolve(); return; }
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, Math.max(0, ms));
    signal.addEventListener("abort", finish, { once: true });
  });
}

export function useSystemLogs() {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<SystemLogLevel | "">("");
  const [live, setLive] = useState(true);
  const [visible, setVisible] = useState(document.visibilityState !== "hidden");
  const [reload, setReload] = useState(0);
  const [historyRequest, setHistoryRequest] = useState(0);
  const [entries, setEntries] = useState<SystemLogEntry[]>([]);
  const [metadata, setMetadata] = useState<AdminLogsResponse | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [connection, setConnection] = useState<Connection>("loading");
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [omitted, setOmitted] = useState(0);
  const [resetNotice, setResetNotice] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const active = useRef<AbortController | null>(null);
  const version = useRef(0);
  const worker = useRef<Promise<void>>(Promise.resolve());
  const windowState = useRef<WindowState>({ key: null, reload: -1, ready: false, cursor: 0,
    nextBefore: null, entries: [], historyRequested: false, fetchAt: 0, omitted: 0 });
  const stop = useCallback(() => { version.current++; active.current?.abort(); }, []);

  useEffect(() => {
    const changed = () => setVisible(current => {
      const next = document.visibilityState !== "hidden";
      if (next !== current) stop();
      return next;
    });
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, [stop]);

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    const signal = controller.signal;
    const currentVersion = ++version.current;
    const current = () => !signal.aborted && version.current === currentVersion;
    const key = JSON.stringify([search.trim(), level]);
    const previous = windowState.current;
    if (previous.key !== key || previous.reload !== reload) {
      windowState.current = { key, reload, ready: false, cursor: 0, nextBefore: null, entries: [],
        historyRequested: false, fetchAt: Date.now() + (previous.key !== null && previous.key !== key ? 350 : 0), omitted: 0 };
      setEntries([]); setMetadata(null); setNextBefore(null); setOmitted(0); setResetNotice(false);
      setError(null); setHistoryError(null);
    }
    const state = windowState.current;
    setHistoryLoading(false);
    const query = { search: search.trim() || undefined, level: level || undefined, limit: 100 };
    const merge = (items: SystemLogEntry[]) => {
      const merged = new Map(state.entries.map(item => [item.id, item]));
      for (const item of items) merged.set(item.id, item);
      const sorted = [...merged.values()].sort((a, b) => b.id - a.id);
      state.omitted += Math.max(0, sorted.length - SYSTEM_LOG_LIMIT);
      state.entries = sorted.slice(0, SYSTEM_LOG_LIMIT);
      setEntries(state.entries); setOmitted(state.omitted);
    };
    const reset = () => {
      state.ready = false; state.cursor = 0; state.nextBefore = null; state.entries = [];
      state.historyRequested = false; state.omitted = 0; state.fetchAt = 0;
      setEntries([]); setNextBefore(null); setOmitted(0); setResetNotice(true); setHistoryError(null);
    };

    async function run() {
      if (!visible) { if (current()) setConnection("hidden"); return; }
      let failures = 0;
      while (current()) {
        try {
          if (!state.ready) {
            setConnection("loading");
            await wait(state.fetchAt - Date.now(), signal);
            if (!current()) return;
            const result = await adminApi.logs.list(query, signal);
            if (!current()) return;
            state.ready = true; state.cursor = result.cursor; state.nextBefore = result.nextBefore;
            state.instanceId = result.instanceId;
            merge(result.items); setMetadata(result); setNextBefore(result.nextBefore); setError(null);
            failures = 0;
          }
          if (state.historyRequested) {
            setHistoryLoading(true); setHistoryError(null);
            try {
              if (state.nextBefore !== null && state.entries.length < SYSTEM_LOG_LIMIT) {
                const result = await adminApi.logs.list({ ...query, before: state.nextBefore }, signal);
                if (!current()) return;
                if (state.instanceId && result.instanceId && state.instanceId !== result.instanceId) {
                  reset(); setHistoryLoading(false); continue;
                }
                merge(result.items); state.nextBefore = result.nextBefore;
                setNextBefore(result.nextBefore); setMetadata(result);
                // A history response must never advance the live cursor.
              }
            } catch {
              if (!current()) return;
              setHistoryError("Não foi possível carregar os registros anteriores. Tente novamente.");
            }
            if (!current()) return;
            state.historyRequested = false; setHistoryLoading(false);
          }
          if (!live) { setConnection("paused"); return; }
          setConnection(failures ? "reconnecting" : "live");
          const started = Date.now();
          const result = await adminApi.logs.live({ ...query, after: state.cursor, waitSeconds: 20 }, signal);
          if (!current()) return;
          if (result.resetRequired || (state.instanceId && result.instanceId && state.instanceId !== result.instanceId)) {
            reset(); await wait(250, signal); continue;
          }
          state.cursor = result.cursor;
          merge(result.items); setMetadata(result); setError(null); setRetrySeconds(0);
          failures = 0; setConnection("live");
          // Long polling normally waits on the server. Also bound an empty early response.
          if (!result.hasMore && result.items.length === 0) await wait(250 - (Date.now() - started), signal);
        } catch {
          if (!current()) return;
          setError(state.ready ? "A conexão com os logs foi interrompida. Os registros exibidos foram preservados."
            : "Não foi possível carregar os logs do sistema.");
          if (!live) { setConnection("paused"); return; }
          const delay = Math.min(30000, 1000 * 2 ** Math.min(failures++, 5));
          setConnection("reconnecting"); setRetrySeconds(delay / 1000);
          await wait(delay, signal);
        }
      }
    }
    // Abort settles the previous request before another worker may issue one.
    worker.current = worker.current.catch(() => {}).then(() => { if (current()) return run(); });
    return () => { controller.abort(); version.current++; };
  }, [search, level, reload, historyRequest, live, visible]);

  return {
    search, level, live, entries, metadata, nextBefore, error, historyError, historyLoading, omitted, resetNotice, retrySeconds,
    connection: !visible ? "hidden" as const : !live && windowState.current.ready ? "paused" as const : connection,
    changeSearch: (value: string) => { if (value !== search) { stop(); setSearch(value); } },
    changeLevel: (value: SystemLogLevel | "") => { if (value !== level) { stop(); setLevel(value); } },
    toggleLive: () => { stop(); setLive(value => !value); },
    reload: () => { stop(); setReload(value => value + 1); },
    loadOlder: () => {
      const state = windowState.current;
      if (!visible || state.historyRequested || state.nextBefore === null || state.entries.length >= SYSTEM_LOG_LIMIT) return;
      state.historyRequested = true; stop(); setHistoryRequest(value => value + 1);
    },
  };
}
