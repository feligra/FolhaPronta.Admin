import { StatusPill } from "@/components/StatusPill";

export function EmailConfirmationPill({ confirmed }: { confirmed: boolean }) {
  return (
    <StatusPill tone={confirmed ? "erva" : "amarelo"}>
      {confirmed ? "E-mail confirmado" : "E-mail não confirmado"}
    </StatusPill>
  );
}
