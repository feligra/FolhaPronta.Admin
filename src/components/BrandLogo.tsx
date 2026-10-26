type BrandLogoProps = {
  variant?: "sidebar" | "compact" | "login";
  className?: string;
};

/** One official symbol and wordmark for the administrative surfaces. */
export function BrandLogo({ variant = "sidebar", className = "" }: BrandLogoProps) {
  const login = variant === "login";
  const compact = variant === "compact";
  const symbolSize = login ? 80 : compact ? 32 : 40;

  return (
    <span
      role="img"
      aria-label="FolhaPronta — painel administrativo"
      className={`inline-flex min-w-0 items-center ${login ? "flex-col gap-3" : "gap-2"} ${className}`}
    >
      <img
        src="/brand/folhapronta-mark.svg?v=20261025"
        width={symbolSize}
        height={symbolSize}
        alt=""
        aria-hidden="true"
        className="block shrink-0"
      />
      <span aria-hidden="true" className={`min-w-0 ${login ? "text-center" : "text-left"}`}>
        <span className={`block whitespace-nowrap font-display font-bold leading-none tracking-[-0.025em] text-tinta ${
          login ? "text-[34px]" : compact ? "text-[19px]" : "text-[22px]"
        }`}>
          Folha<span className="font-normal italic text-coral">Pronta</span>
        </span>
        <span className={`mt-1.5 block font-sans font-medium uppercase tracking-[0.14em] text-cinza ${
          login ? "text-[11px]" : "text-[9px]"
        }`}>
          Painel Admin
        </span>
      </span>
    </span>
  );
}
