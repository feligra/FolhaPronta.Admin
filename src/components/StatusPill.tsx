import { classNames } from "@/utils/format";

export type Tone = "erva" | "amarelo" | "coral" | "lavanda" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  erva: "bg-erva text-creme",
  amarelo: "bg-amarelo-100 text-amarelo-900",
  coral: "bg-coral-100 text-coral-800",
  lavanda: "bg-lavanda-100 text-lavanda-800",
  neutral: "bg-tintaSoft-50 text-tinta",
};

export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONE_CLASS[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
