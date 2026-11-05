/**
 * Porteiro e redator: porta do WF-03 do n8n (docs/n8n-legado/wf-03-redator-de-followup.json)
 * para o motor (spec fases 2-3 §6). Pega follow-ups pendentes vencidos, o porteiro decide se
 * ainda faz sentido (libera, reagenda ou aborta), o redator escreve o texto e ele espera a
 * aprovação humana em `aguardando_aprovacao`, com validade até 19h59 (spec pipeline §8). Respeita
 * a janela; a cota do ritmo limita envios, não preparo. Põe as revisões do admin no fim dos
 * prompts (spec pipeline §9). Montagem e validação são as do legado.
 */
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor, type ClienteDb } from "../db";
import * as porteiro from "../ia/prompts/porteiro";
import * as redator from "../ia/prompts/redator";
import type { ClienteIa } from "../ia/tipos";
import { logErro } from "../log";
import {
  aplicar,
  type Desfecho,
  type LinhaFollowup,
  MODELO_PORTEIRO,
  MODELO_REDATOR,
  type Revisao,
  SQL_BUSCAR,
  SQL_FICHA,
  SQL_REAGENDAR_FALHA,
  SQL_REVISOES,
  SQL_VENCIDOS,
  type Vencido,
} from "./redator-sql";

export type { LinhaFollowup, Revisao };
import { carimboValido } from "./qualificador";
import { dentroDaJanela } from "./ritmo";
import { valorEsperado } from "./valor";

const linhaRevisao = (r: Revisao) =>
  '"' +
  (r.texto_original ?? "") +
  '" → atendente: ' +
  r.decisao +
  " (" +
  ([r.motivos.join(", "), r.texto_livre ?? ""].filter(Boolean).join("; ") || "sem motivo") +
  ") → admin: " +
  (r.concorda ? "Concordo" : "Discordo") +
  ": " +
  (r.observacao || "sem observação");

/** Bloco que entra no lugar de `{{AVALIACOES}}`: só as decisões que o admin revisou. */
export function formatarRevisoes(r: Revisao[]): string {
  const titulo = "REVISOES DO ADMIN SOBRE DECISOES DA EQUIPE (calibre-se por elas)\n";
  return titulo + (r.length ? r.map(linhaRevisao).join("\n") : "(nenhuma revisão ainda)");
}

export async function blocoRevisoes(db: ClienteDb): Promise<string> {
  const { rows } = await db.query<Revisao>(SQL_REVISOES);
  return formatarRevisoes(rows);
}

// Função substituta: um `$&` no texto de uma avaliação não vira padrão do replace.
const comAvaliacoes = (sistema: string, bloco: string) =>
  sistema.replace("{{AVALIACOES}}", () => bloco);

const rotulo = (q: string) => (q === "lead" ? "LEAD" : q === "equipe" ? "EQUIPE" : "IA");

function conversaDe(d: LinhaFollowup): string {
  const hist = Array.isArray(d.historico) ? d.historico : [];
  return hist.length
    ? hist.map((m) => "[" + m.em + "] " + rotulo(m.quem) + ": " + m.texto).join("\n")
    : "(sem mensagens)";
}

/** Literal do nó "Montar prompt do porteiro". */
export function montarPromptPorteiro(d: LinhaFollowup, avaliacoes: string) {
  const ficha = [
    "AGORA: " + d.agora_local + " (America/Sao_Paulo)",
    "LEAD: " + (d.nome || "sem nome"),
    "ETIQUETA: " + (d.etiqueta || "-"),
    "TEMPERATURA: " + (d.temperatura || "-"),
    "INTERESSE: " + (d.interesse || "-"),
    "OBJECAO: " + (d.objecao || "-"),
    "RESUMO: " + (d.resumo || "-"),
    "TOQUES SEM RESPOSTA: " + (d.n_toques ?? 0),
    "MINUTOS DESDE A ULTIMA DO LEAD: " + (d.min_desde_lead ?? "nunca"),
    "MINUTOS DESDE A ULTIMA DA EQUIPE: " + (d.min_desde_equipe ?? "nunca"),
    "AULA MARCADA PARA: " + (d.data_agendada_local || "nao ha"),
    "",
    "FOLLOW-UP EM QUESTAO",
    "  tipo: " + d.tipo,
    "OBJETIVO DESTE FOLLOW-UP: " + (d.motivo || "-"),
  ].join("\n");
  return {
    sistema: comAvaliacoes(porteiro.SISTEMA, avaliacoes),
    usuario: ficha + "\n\nCONVERSA:\n" + conversaDe(d),
  };
}

/** Literal do nó "Validar decisao do porteiro". */
export function validarPorteiro(
  cru: unknown,
  ctx: { minimo_local: string; limite_local: string },
): { enviar: boolean; motivo: string; reagendarPara: string } {
  const c = (cru && typeof cru === "object" ? cru : {}) as Record<string, unknown>;
  const enviar = typeof c.enviar === "boolean" ? c.enviar : true;
  let motivo = String(c.motivo ?? "")
    .trim()
    .slice(0, 400);
  let quando = String(c.reagendar_para ?? "").trim();

  if (enviar) quando = "";

  if (quando && !carimboValido(quando)) quando = "";
  if (quando) {
    if (quando < ctx.minimo_local) quando = ctx.minimo_local;
    if (quando > ctx.limite_local) quando = ctx.limite_local;
  }

  if (!enviar && !motivo) motivo = "o porteiro barrou sem dizer o motivo";
  return { enviar, motivo, reagendarPara: quando };
}

// MODO: piso determinístico entre reabrir a conversa e retomar um assunto concreto
// (comentário completo no nó "Montar prompt do redator" do legado). "Link enviado" fica
// fora de propósito: registra o que a EQUIPE fez, não o que o lead pediu.
const ETAPAS_CONCRETAS = [
  "aguardando pagamento",
  "cadastrado",
  "aluno com horas",
  "aluno sem horas",
];
const TIPOS_CONCRETOS = ["lembrete_d1", "lembrete_dia", "pos_aula"];

/** Literal do cálculo do MODO em "Montar prompt do redator". */
export function modoDoFollowup(
  d: Pick<LinhaFollowup, "etiqueta" | "tipo" | "data_agendada_local">,
): { modo: "REABRIR" | "RETOMAR"; porque: string } {
  const etiquetaBaixa = String(d.etiqueta || "")
    .trim()
    .toLowerCase();
  const temAula = Boolean(d.data_agendada_local);
  const tipoConcreto = TIPOS_CONCRETOS.includes(String(d.tipo || ""));
  const retomar = temAula || tipoConcreto || ETAPAS_CONCRETAS.includes(etiquetaBaixa);
  const porque = temAula
    ? "o lead tem aula marcada"
    : tipoConcreto
      ? "follow-up de aula marcada"
      : retomar
        ? "a etapa do funil (" + d.etiqueta + ") mostra pedido concreto"
        : etiquetaBaixa === "link enviado"
          ? "Link enviado registra o que a EQUIPE fez, nao pedido do lead"
          : "a etapa do funil nao mostra nenhum pedido concreto do lead";
  return { modo: retomar ? "RETOMAR" : "REABRIR", porque };
}

/** Literal do nó "Montar prompt do redator". */
export function montarPromptRedator(d: LinhaFollowup, avaliacoes: string) {
  const hist = Array.isArray(d.historico) ? d.historico : [];
  const antes = Array.isArray(d.textos_anteriores) ? d.textos_anteriores : [];
  const anteriores = antes.length
    ? antes.map((t) => "[" + t.em + "] (" + t.tipo + ") " + t.texto).join("\n")
    : "(nenhum ainda, este e o primeiro toque)";

  // Primeiro nome só: "isadora" soa como gente, "isadora souza" soa como cadastro.
  const atendente =
    String(d.atendente_nome || "")
      .trim()
      .split(/\s+/)[0] || "a equipe";

  const { modo, porque } = modoDoFollowup(d);

  // Link já mandado é fato do histórico (inclusive o que a EQUIPE mandou na mão).
  const tudoQueJaFoi = [...hist, ...antes]
    .map((m) => String(m.texto || ""))
    .join(" ")
    .toLowerCase();
  const jaMandados = [];
  if (tudoQueJaFoi.includes("wakeclub.com.br/agendar")) jaMandados.push("o link de agendar");
  if (tudoQueJaFoi.includes("wakeclub.com.br/carteira")) {
    jaMandados.push("o link da carteira (valores)");
  }
  const linhaLinks = jaMandados.length
    ? jaMandados.join(" e ") + " ja esta com o lead. NAO mande de novo."
    : "nenhum ainda";

  const ficha = [
    "AGORA: " + d.agora_local + " (America/Sao_Paulo)",
    "VOCE E: " + atendente,
    "MODO: " + modo + " (" + porque + ")",
    "NUMERO DESTE TOQUE: " + (antes.length + 1),
    "LINKS JA MANDADOS: " + linhaLinks,
    "LEAD: " + (d.nome || "sem nome"),
    "ETIQUETA: " + (d.etiqueta || "-"),
    "TEMPERATURA: " + (d.temperatura || "-"),
    "INTERESSE: " + (d.interesse || "-"),
    "OBJECAO QUE TRAVOU: " + (d.objecao || "-"),
    "RESUMO DA CONVERSA: " + (d.resumo || "-"),
    "TOQUES SEM RESPOSTA ATE AGORA: " + (d.n_toques ?? 0),
    "AULA MARCADA PARA: " + (d.data_agendada_local || "nao ha"),
    "",
    "ESTE FOLLOW-UP",
    "  tipo: " + d.tipo,
    "OBJETIVO DESTE FOLLOW-UP: " + (d.motivo || "-"),
  ].join("\n");

  const usuario =
    ficha +
    "\n\nCONVERSA ATE AQUI:\n" +
    conversaDe(d) +
    "\n\nTEXTOS QUE VOCE JA MANDOU NESTE LEAD (nao repita o angulo):\n" +
    anteriores +
    "\n\nEscreva a mensagem no modo " +
    modo +
    ".";
  return { sistema: comAvaliacoes(redator.SISTEMA, avaliacoes), usuario };
}

const PERMITIDOS = ["https://www.wakeclub.com.br/agendar", "https://www.wakeclub.com.br/carteira"];

// Domínio sem www nem http (wakeclub.com.br/promo, bit.ly/x, WAKE.COM). Lookbehind barra
// e-mail e o meio de uma URL já tratada; o \b depois do TLD deixa passar "pix.combo".
const DOMINIO_NU =
  /(?<![\w@/.-])(?:[a-z0-9-]+\.)+(?:com|net|org|io|me|ly|link|app|co|site|online|info|xyz|br)(?:\.br)?\b(?:\/[^\s)>\]]*)?/gi;

// Fica só se, completado com https://www., for um permitido; a pontuação colada é mantida.
// Exceção: sem caminho e com o "TLD" em Title case é frase sem espaço ("fica.Me avisa").
function trocarDominioNu(u: string): string {
  const limpo = u.replace(/[.,;:!?]+$/, "");
  if (!limpo.includes("/") && /^[^.]+\.[A-Z][a-z]+$/.test(limpo)) return u;
  const cheio = ("https://www." + limpo).toLowerCase();
  return (PERMITIDOS.includes(cheio) ? cheio : "") + u.slice(limpo.length);
}

/** Literal do nó "Validar texto": links, emoji, travessão, 10..600 caracteres. */
export function validarTexto(cru: unknown): string {
  const c = (cru && typeof cru === "object" ? cru : {}) as Record<string, unknown>;
  let texto = String(c.texto ?? "").trim();

  texto = texto.replace(/(?<!\/\/)\bwww\.[^\s)>\]]+/gi, (u) => "https://" + u);

  texto = texto.replace(/https?:\/\/[^\s)>\]]+/gi, (u) => {
    const limpo = u.replace(/[.,;:!?]+$/, "");
    return PERMITIDOS.includes(limpo.toLowerCase()) ? limpo : "";
  });

  texto = texto.replace(DOMINIO_NU, trocarDominioNu);

  // eslint-disable-next-line no-misleading-character-class -- literal do legado: o FE0F solto sai.
  texto = texto.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "");
  texto = texto.replace(/[—–]/g, " ");

  texto = texto
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (texto.length > 600) {
    texto = texto
      .slice(0, 600)
      .replace(/\s+\S*$/, "")
      .trim();
  }

  // Piso 10 e não 20: no modo REABRIR a mensagem certa é uma frase só.
  if (texto.length < 10) {
    throw new Error("texto vazio ou curto demais depois da limpeza");
  }
  return texto;
}

async function perguntarPorteiro(ia: ClienteIa, d: LinhaFollowup, avaliacoes: string) {
  const pp = montarPromptPorteiro(d, avaliacoes);
  return validarPorteiro(
    await ia.chatJson<unknown>({
      modelo: MODELO_PORTEIRO,
      sistema: pp.sistema,
      usuario: pp.usuario,
      schema: porteiro.SCHEMA,
      nomeSchema: "decisao",
      reasoningEffort: "low",
      timeoutMs: 60000,
    }),
    d,
  );
}

async function decidir(ia: ClienteIa, d: LinhaFollowup, avaliacoes: string): Promise<Desfecho> {
  const decisao = await perguntarPorteiro(ia, d, avaliacoes);
  if (!decisao.enviar) {
    return decisao.reagendarPara
      ? { tipo: "reagendar", quando: decisao.reagendarPara, motivo: decisao.motivo }
      : { tipo: "abortar", motivo: decisao.motivo };
  }
  const pr = montarPromptRedator(d, avaliacoes);
  const texto = validarTexto(
    await ia.chatJson<unknown>({
      modelo: MODELO_REDATOR,
      sistema: pr.sistema,
      usuario: pr.usuario,
      schema: redator.SCHEMA,
      nomeSchema: "texto",
      reasoningEffort: "medium",
      timeoutMs: 90000,
    }),
  );
  return { tipo: "gravar", motivo: decisao.motivo, texto, modo: modoDoFollowup(d).modo };
}

// Valor esperado (spec §7.2) com o preço da hora de `configuracoes`.
const valorDe = (v: Vencido) =>
  valorEsperado(
    {
      etiqueta: v.etiqueta ?? "Novo lead",
      temperatura: v.temperatura,
      horasEstimadas: v.horas_estimadas,
      optOut: v.opt_out,
      semAtendimento: v.sem_atendimento,
      dataAgendada: v.data_agendada?.toISOString() ?? null,
    },
    Number(v.preco_hora ?? 0),
  );

export type ResultadoRedacao = {
  sugeridos: number;
  barrados: { followupId: string; motivo: string }[];
  reagendados: number;
  falhas: number;
};

/**
 * Porteiro e redator sobre os follow-ups `ids` (pendentes vencidos), na ordem dada; cada um
 * grava na própria transação. Falha da IA, da validação ou da gravação reagenda em +30 min.
 * `diasValidade` diz até quando a sugestão espera aprovação: 0 hoje, 1 amanhã (varredura).
 */
export async function redigir(
  db: ClienteDb,
  ia: ClienteIa,
  ids: string[],
  opcoes: { diasValidade: 0 | 1; aoConcluirUm?: (parcial: ResultadoRedacao) => Promise<void> },
): Promise<ResultadoRedacao> {
  const r: ResultadoRedacao = { sugeridos: 0, barrados: [], reagendados: 0, falhas: 0 };
  const rodada = randomUUID();
  const { rows } = await db.query<LinhaFollowup>(SQL_BUSCAR, [ids]);
  rows.sort((a, b) => ids.indexOf(a.followup_id) - ids.indexOf(b.followup_id));
  const revisoes = rows.length ? await blocoRevisoes(db) : "";

  for (const d of rows) {
    try {
      const x = await decidir(ia, d, revisoes);
      if (
        await comTransacao((c) => aplicar(c, d, x, { rodada, diasValidade: opcoes.diasValidade }))
      ) {
        if (x.tipo === "gravar") r.sugeridos++;
        else if (x.tipo === "abortar")
          r.barrados.push({ followupId: d.followup_id, motivo: x.motivo });
        else r.reagendados++;
      }
    } catch (erro) {
      r.falhas++;
      logErro("redator.falha", erro, { followupId: d.followup_id });
      await db
        .query(SQL_REAGENDAR_FALHA, [d.followup_id])
        .catch((e: unknown) => logErro("redator.reagendar", e, { followupId: d.followup_id }));
    }
    await opcoes.aoConcluirUm?.({ ...r, barrados: [...r.barrados] });
  }
  return r;
}

/**
 * Porteiro de novo sobre um follow-up em qualquer status (a fila de envio, sobre um aprovado
 * antigo, spec §8). Não grava nada; reagendar conta como barrar.
 */
export async function avaliarPorteiro(
  db: ClienteDb,
  ia: ClienteIa,
  followupId: string,
): Promise<{ enviar: boolean; motivo: string }> {
  const { rows } = await db.query<LinhaFollowup>(SQL_FICHA, [followupId]);
  if (!rows[0]) throw new Error("follow-up não encontrado");
  const { enviar, motivo } = await perguntarPorteiro(ia, rows[0], await blocoRevisoes(db));
  return { enviar, motivo };
}

/**
 * Uma rodada (15 min): só na janela. Até 10 vencidos de maior valor esperado (empate: o mais
 * antigo); preparar não tem cota (ela limita envios). Devolve quantos follow-ups mudaram
 * (reagendado, abortado ou texto gravado).
 */
export async function tarefaRedator(deps: { ia: ClienteIa; agora?: Date }): Promise<number> {
  const db = getPoolMotor();
  if (!dentroDaJanela(deps.agora ?? new Date())) return 0;

  const { rows: vencidos } = await db.query<Vencido>(SQL_VENCIDOS);
  const ids = vencidos
    .map((v) => ({ id: v.id, valor: valorDe(v), em: v.agendado_para.getTime() }))
    .sort((a, b) => b.valor - a.valor || a.em - b.em)
    .slice(0, 10)
    .map((v) => v.id);
  if (!ids.length) return 0;

  const r = await redigir(db, deps.ia, ids, { diasValidade: 0 });
  return r.sugeridos + r.barrados.length + r.reagendados;
}
