import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function AdminDialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const saving = useRef(busy);
  close.current = onClose; saving.current = busy;
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("input,button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving.current) close.current();
      if (event.key !== "Tab") return;
      const controls = panel.current?.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),a[href],select,textarea");
      if (!controls?.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); active?.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-tinta/40 p-3 backdrop-blur-sm sm:p-4" onClick={() => { if (!busy) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="admin-dialog w-full max-w-xl rounded-xl bg-creme p-4 shadow-xl sm:p-6" onClick={(event) => event.stopPropagation()}>
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
        <button type="button" aria-label="Fechar" onClick={onClose} disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-md hover:bg-tintaSoft-50"><X size={20} /></button>
      </div>
      {children}
    </div>
  </div>;
}
