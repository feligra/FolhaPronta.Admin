import type { PaymentProvider } from "@/types";
import { paymentProviderLabel } from "@/utils/billing";

export function BillingProviderReference({ provider, reference }: {
  provider?: PaymentProvider; reference?: string | null;
}) {
  return (
    <div className="min-w-0 text-xs text-cinza">
      <span className="font-medium text-tinta">{paymentProviderLabel(provider)}</span>
      {reference && <p className="mt-0.5 break-all font-mono text-[11px] select-all">{reference}</p>}
    </div>
  );
}
