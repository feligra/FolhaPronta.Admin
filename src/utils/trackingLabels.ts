export const TRACKING_ACTIVITY_LABELS: Record<string, string> = {
  syllable: "Família silábica", "writing-sounding": "Sondagem de escrita", labyrinth: "Labirinto",
  "connect-dots": "Ligue os pontos", "name-figure": "Nome da figura", "color-naming": "Nome das cores",
  "symbol-hunt": "Caça ao símbolo", "vision-screening": "Cartelão de visão", coloring: "Desenhos para colorir",
  "drawing-copy": "Copia o desenho", handwriting: "Caligrafia", arithmetic: "Continhas armadas",
  "number-sequence": "Sequência numérica", counting: "Quantos tem?", "word-search": "Caça-palavras",
  "number-to-words": "Números por extenso", "logic-sudoku": "Sudoku infantil", "connect-pairs": "Ligue sem cruzar",
  "logic-cause-effect": "Ligue causa e efeito", "logic-classify": "Classifique", "logic-odd-one-out": "Qual não pertence",
  "logic-pattern": "Continue o padrão", "match-colors": "Ligue as cores iguais", "shape-arithmetic": "Continhas com formas",
  crossword: "Palavras cruzadas", "time-clock": "Lendo as horas", adedonha: "Adedonha", "count-sticks": "Contar pauzinhos",
  "secret-code": "Código secreto", "count-blocks": "Conte os blocos", bingo: "Bingo", "geography-flags": "Bandeiras dos países",
  "before-after": "Antes e depois", "compare-numbers": "Maior, menor ou igual", "body-safety": "Meu corpo é meu",
};

export const TRACKING_EVENT_LABELS: Record<string, string> = {
  page_view: "Visitou a página", activity_opened: "Abriu a atividade", public_preview_opened: "Ampliou uma prévia pública",
  activity_preview_requested: "Solicitou uma prévia no editor", activity_generate_requested: "Solicitou a geração",
  activity_generate_succeeded: "Recebeu a atividade gerada", activity_generate_failed: "Encontrou falha na geração",
  download_clicked: "Solicitou um download", signup_started: "Iniciou o cadastro", checkout_started: "Solicitou uma assinatura ou troca de plano",
};

const PATH_LABELS: Record<string, string> = {
  "/": "Página inicial", "/catalogo": "Catálogo", "/preco": "Planos", "/funcionalidades": "Funcionalidades",
  "/para-familias": "Para famílias", "/para-educadores": "Para educadores", "/cadastro": "Cadastro",
  "/login": "Login", "/contratar": "Cadastro e assinatura", "/dashboard": "Início do sistema", "/atividades": "Atividades",
  "/assinatura": "Minha assinatura", "/escolher-plano": "Escolher plano", "/conta": "Minha conta",
  "/planejador": "Planejador", "/turmas": "Turmas", "/coordenacao": "Coordenação",
  "/turmas/:id": "Detalhes da turma", "/turmas/:id/plano": "Plano da turma", "/turmas/:id/alunos/:studentId": "Aluno da turma",
  "/coordenacao/:id": "Detalhes da coordenação", "/convites/:token/aceitar": "Aceitar convite",
};

const ACTIVITY_ROUTE_KINDS: Record<string, string> = {
  silabas: "syllable", sondagem: "writing-sounding", labirinto: "labyrinth", "ligue-os-pontos": "connect-dots",
  "nome-figura": "name-figure", "nome-cores": "color-naming", "caca-simbolo": "symbol-hunt", "cartelao-visao": "vision-screening",
  colorir: "coloring", "copia-desenho": "drawing-copy", caligrafia: "handwriting", continhas: "arithmetic",
  "sequencia-numerica": "number-sequence", "quantos-tem": "counting", "caca-palavras": "word-search", "numeros-extenso": "number-to-words",
  sudoku: "logic-sudoku", "ligue-sem-cruzar": "connect-pairs", "causa-efeito": "logic-cause-effect", classifique: "logic-classify",
  "qual-nao-pertence": "logic-odd-one-out", "continue-padrao": "logic-pattern", "ligar-cores": "match-colors", "continhas-formas": "shape-arithmetic",
  "palavras-cruzadas": "crossword", horas: "time-clock", adedonha: "adedonha", "contar-pauzinhos": "count-sticks",
  "codigo-secreto": "secret-code", "conte-os-blocos": "count-blocks", bingo: "bingo", "geografia-bandeiras": "geography-flags",
  "antes-depois": "before-after", "maior-menor-igual": "compare-numbers", "meu-corpo": "body-safety",
};

export const trackingPathLabel = (path: string) => {
  const kind = path.startsWith("/atividades/") ? ACTIVITY_ROUTE_KINDS[path.slice("/atividades/".length)] : null;
  return PATH_LABELS[path] ?? (kind ? `Atividade: ${TRACKING_ACTIVITY_LABELS[kind]}` : path);
};
export const trackingActivityLabel = (kind: string) => TRACKING_ACTIVITY_LABELS[kind] ?? kind;
