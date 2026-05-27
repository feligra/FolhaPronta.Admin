import type { PaymentRecordStatus, SubscriptionStatus } from "@/types";

// Espelha o enum UserType do backend (FolhaPronta.Domain.AggregateModel.User.Enums).
// Mantenha sincronizado com a definição do C#.
export const USER_TYPE_LABEL: Record<number, string> = {
  0: "Pais/Responsável",
  1: "Professor(a)",
  2: "Escola",
};

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  PendingPayment: "Pagamento pendente",
  Active: "Ativa",
  Trialing: "Trial",
  Cancelled: "Cancelada",
  Paused: "Pausada",
  PastDue: "Em atraso",
  Expired: "Expirada",
};

// Tom (cor) sugerido pra cada status — usado pelo StatusPill.
export const SUBSCRIPTION_STATUS_TONE: Record<SubscriptionStatus, "erva" | "amarelo" | "coral" | "neutral"> = {
  Active: "erva",
  Trialing: "amarelo",
  PendingPayment: "amarelo",
  Cancelled: "coral",
  Paused: "neutral",
  PastDue: "coral",
  Expired: "neutral",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentRecordStatus, string> = {
  Pending: "Pendente",
  InProcess: "Em análise",
  Approved: "Aprovado",
  Rejected: "Recusado",
  Refunded: "Reembolsado",
  Cancelled: "Cancelado",
  ChargedBack: "Estorno",
};

export const PAYMENT_STATUS_TONE: Record<PaymentRecordStatus, "erva" | "amarelo" | "coral" | "neutral"> = {
  Approved: "erva",
  Pending: "amarelo",
  InProcess: "amarelo",
  Rejected: "coral",
  Cancelled: "coral",
  Refunded: "coral",
  ChargedBack: "coral",
};

// Label friendly pros tipos de atividade (espelha ActivityType do backend).
// Mantém ordem nos painéis e nomes em pt-BR pro admin não decorar enum.
export const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  WritingSounding: "Sondagem de escrita",
  Syllable: "Família silábica",
  Labyrinth: "Labirinto",
  ConnectDots: "Ligue os pontos",
  WordSearch: "Caça-palavras",
  NameFigure: "Nome da figura",
  SymbolHunt: "Caça ao símbolo",
  VisionScreening: "Cartelão de visão",
  Handwriting: "Caligrafia",
  Coloring: "Colorir",
  DrawingCopy: "Copia o desenho",
  Arithmetic: "Continhas armadas",
  NumberSequence: "Sequência numérica",
  Counting: "Quantos tem",
  NumberToWords: "Números por extenso",
  Crossword: "Palavras cruzadas",
  LogicPattern: "Continue o padrão",
  LogicOddOneOut: "Qual não pertence",
  LogicClassify: "Classifique",
  LogicCauseEffect: "Causa e efeito",
  LogicSudoku: "Sudoku infantil",
  ShapeArithmetic: "Continhas com formas",
  MatchColors: "Ligue as cores iguais",
  GeographyFlags: "Bandeiras dos países",
  ColorNaming: "Nome das cores",
  Bingo: "Bingo",
  CountSticks: "Contar pauzinhos",
  Adedonha: "Adedonha",
  TimeClock: "Lendo as horas",
};
