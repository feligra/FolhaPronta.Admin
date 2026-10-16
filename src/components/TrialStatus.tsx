import type { AdminTrialStatus } from "@/types";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatDateTime } from "@/utils/format";

const STATUS: Record<AdminTrialStatus, { label: string; description: string; tone: Tone }> = {
  WaitingForEmail: { label: "Teste grátis aguardando confirmação", description: "O e-mail precisa ser confirmado. Testes já utilizados mantêm o prazo original.", tone: "amarelo" },
  NotStarted: { label: "Teste grátis não iniciado", description: "Não há um período de teste registrado para este cliente.", tone: "neutral" },
  Active: { label: "Teste grátis ativo", description: "O cliente pode gerar atividades durante o período de teste.", tone: "erva" },
  Expired: { label: "Teste grátis encerrado", description: "O período de teste deste cliente terminou.", tone: "neutral" },
  Subscribed: { label: "Assinatura ativa", description: "Este cliente possui uma assinatura com período vigente.", tone: "lavanda" },
  Inactive: { label: "Conta desativada", description: "A conta está desativada e o acesso permanece bloqueado.", tone: "coral" },
};

type TrialUser = {
  trialStatus?: AdminTrialStatus;
  isTrialActive: boolean;
  trialEndsAt: string | null;
};

export function TrialStatus({ user, details = false }: { user: TrialUser; details?: boolean }) {
  // O backend resolve elegibilidade e assinatura. Não inferir acesso apenas pelas datas.
  const status = user.trialStatus ? STATUS[user.trialStatus] : user.isTrialActive ? STATUS.Active : undefined;
  return (
    <div className="min-w-0 space-y-1" data-trial-status={user.trialStatus ?? "Unknown"}>
      <StatusPill tone={status?.tone ?? "neutral"} className="max-w-full">
        {status?.label ?? "Teste grátis: situação indisponível"}
      </StatusPill>
      {details && (
        <p className="text-xs text-cinza">
          {user.trialStatus === "Active" && user.trialEndsAt
            ? `Disponível até ${formatDateTime(user.trialEndsAt)} (Brasília).`
            : user.trialStatus === "Expired" && user.trialEndsAt
              ? `Encerrado em ${formatDateTime(user.trialEndsAt)} (Brasília).`
              : status?.description ?? "Atualize a página para consultar o período de teste."}
        </p>
      )}
    </div>
  );
}
