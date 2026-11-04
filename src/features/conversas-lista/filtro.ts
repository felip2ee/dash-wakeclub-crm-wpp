// Filtro da lista "Conversas" (referência 05): chips Todas / Não lidas / Follow-ups /
// Quentes e a busca por nome, telefone ou mensagem. Puro, para testar sem tela.

export type FiltroConversa = "todas" | "nao-lidas" | "followups" | "quentes";

/** O que a lista precisa de cada lead; `Conversa` (admin) e `MeuLead` já têm este formato. */
export type ItemConversa = {
  id: string;
  nome: string | null;
  telefone: string;
  temperatura: "quente" | "morno" | "frio" | null;
  ultimaTexto: string | null;
  ultimaMsgEm: string | null;
  msgsLeadSemResposta: number;
  /** "Não lida" = lead esperando resposta da equipe. */
  aguardandoEquipe: boolean;
  /** Há follow-up `aguardando_aprovacao` para este lead. */
  followupAguardando: boolean;
};

const PASSA: Record<FiltroConversa, (c: ItemConversa) => boolean> = {
  todas: () => true,
  "nao-lidas": (c) => c.aguardandoEquipe,
  followups: (c) => c.followupAguardando,
  quentes: (c) => c.temperatura === "quente",
};

const normalizar = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();

export function filtrarConversas<T extends ItemConversa>(
  lista: T[],
  filtro: FiltroConversa,
  busca: string,
): T[] {
  const termo = normalizar(busca);
  const digitos = busca.replace(/\D/g, "");
  return lista.filter(
    (c) =>
      PASSA[filtro](c) &&
      (!termo ||
        normalizar(c.nome ?? "").includes(termo) ||
        normalizar(c.ultimaTexto ?? "").includes(termo) ||
        (digitos.length > 0 && c.telefone.replace(/\D/g, "").includes(digitos))),
  );
}
