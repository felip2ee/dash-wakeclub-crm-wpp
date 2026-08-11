import type { LeadFilaOperacional } from "@/server/followups";

export type SecaoMinhaFila = "agora" | "esperando" | "depois" | "feitos";

export type ItemMinhaFila = LeadFilaOperacional & {
  secao: SecaoMinhaFila;
  explicacao: string;
  prioridade: number;
};

export type MinhaFilaOrganizada = Record<SecaoMinhaFila, ItemMinhaFila[]>;

const diaEmSaoPaulo = (data: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);

function horasDesde(iso: string, agora: Date) {
  return Math.max(0, Math.floor((agora.getTime() - Date.parse(iso)) / 3_600_000));
}

function classificar(lead: LeadFilaOperacional, agora: Date): ItemMinhaFila {
  const followup = lead.followup;
  const tocadoHoje = Boolean(
    followup?.ultimoToqueEm &&
    diaEmSaoPaulo(new Date(followup.ultimoToqueEm)) === diaEmSaoPaulo(agora),
  );

  if (lead.aguardandoEquipe) {
    const horas = lead.horasEsperando ?? 0;
    return {
      ...lead,
      secao: "agora",
      prioridade: 400_000 + horas,
      explicacao:
        horas > 0
          ? `O lead está aguardando sua resposta há ${horas} ${horas === 1 ? "hora" : "horas"}.`
          : "O lead enviou uma mensagem e está aguardando sua resposta.",
    };
  }

  if (tocadoHoje && followup) {
    return {
      ...lead,
      secao: "feitos",
      prioridade: Date.parse(followup.ultimoToqueEm ?? ""),
      explicacao: followup.temEco
        ? "O WhatsApp foi aberto e a mensagem já teve envio confirmado pelo eco."
        : "Você abriu o WhatsApp hoje; o envio ainda não foi confirmado.",
    };
  }

  if (followup?.vencido) {
    return {
      ...lead,
      secao: "agora",
      prioridade: 300_000 + horasDesde(followup.agendadoPara, agora),
      explicacao: followup.motivo || "O follow-up chegou ao horário definido pela qualificação.",
    };
  }

  if (!lead.ultimaMsgEquipeEm && lead.temperatura === "quente") {
    return {
      ...lead,
      secao: "agora",
      prioridade: 200_000,
      explicacao: "O lead está marcado como quente e ainda não recebeu resposta da equipe.",
    };
  }

  if (followup) {
    return {
      ...lead,
      secao: "depois",
      prioridade: Date.parse(followup.agendadoPara),
      explicacao: followup.motivo || "Existe um retorno programado para mais tarde.",
    };
  }

  return {
    ...lead,
    secao: "esperando",
    prioridade: Date.parse(lead.ultimaMsgEm ?? "1970-01-01"),
    explicacao: lead.ultimaMsgEquipeEm
      ? "A equipe respondeu; agora o próximo passo depende do lead."
      : "Não existe ação ou follow-up pendente para este lead agora.",
  };
}

export function organizarMinhaFila(
  leads: LeadFilaOperacional[],
  agora = new Date(),
): MinhaFilaOrganizada {
  const organizada: MinhaFilaOrganizada = { agora: [], esperando: [], depois: [], feitos: [] };

  for (const lead of leads) {
    const item = classificar(lead, agora);
    organizada[item.secao].push(item);
  }

  organizada.agora.sort((a, b) => b.prioridade - a.prioridade);
  organizada.esperando.sort((a, b) => b.prioridade - a.prioridade);
  organizada.depois.sort((a, b) => a.prioridade - b.prioridade);
  organizada.feitos.sort((a, b) => b.prioridade - a.prioridade);

  return organizada;
}
