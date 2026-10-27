import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatDateTime } from "@/utils/format";
import { getCustomerTrialStatus, type CustomerTrial, type CustomerAccessStatus } from "@/utils/customerTrial";
import { useAccessClock } from "@/hooks/useAccessClock";

const STATUS: Record<CustomerAccessStatus, { label: string; description: string; tone: Tone }> = {
  WaitingForEmail: { label: "Teste grátis aguardando confirmação", description: "O e-mail precisa ser confirmado. Testes já utilizados mantêm o prazo original.", tone: "amarelo" },
  NotStarted: { label: "Teste grátis não iniciado", description: "Não há um período de teste registrado para este cliente.", tone: "neutral" },
  Active: { label: "Teste grátis ativo", description: "O cliente pode gerar atividades durante o período de teste.", tone: "erva" },
  Expired: { label: "Teste grátis encerrado", description: "O período de teste deste cliente terminou.", tone: "neutral" },
  Subscribed: { label: "Assinatura ativa", description: "Este cliente possui uma assinatura com período vigente.", tone: "lavanda" },
  SubscriptionExpired: { label: "Assinatura expirada", description: "O período da assinatura terminou. Atualize os dados para consultar novas contratações.", tone: "neutral" },
  Inactive: { label: "Conta desativada", description: "A conta está desativada e o acesso permanece bloqueado.", tone: "coral" },
};

export function TrialStatus({ user, details = false }: { user: CustomerTrial; details?: boolean }) {
  const now = useAccessClock(user.trialStatus === "Subscribed" ? user.subscriptionEndsAt : user.trialEndsAt);
  const resolvedStatus = getCustomerTrialStatus(user, now);
  const status = resolvedStatus ? STATUS[resolvedStatus] : undefined;
  return (
    <div className="min-w-0 space-y-1" data-trial-status={resolvedStatus ?? "Unknown"}>
      <StatusPill tone={status?.tone ?? "neutral"} className="max-w-full">
        {status?.label ?? "Teste grátis: situação indisponível"}
      </StatusPill>
      {details && (
        <p className="text-xs text-cinza">
          {resolvedStatus === "Active" && user.trialEndsAt
            ? `Disponível até ${formatDateTime(user.trialEndsAt)} (Brasília).`
            : resolvedStatus === "Expired" && user.trialEndsAt && formatDateTime(user.trialEndsAt) !== "—"
              ? `Encerrado em ${formatDateTime(user.trialEndsAt)} (Brasília).`
              : status?.description ?? "Atualize a página para consultar o período de teste."}
        </p>
      )}
    </div>
  );
}
