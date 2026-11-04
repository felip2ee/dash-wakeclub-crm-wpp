/**
 * Porteiro e redator: porta do WF-03 do n8n (docs/n8n-legado/wf-03-redator-de-followup.json)
 * para o motor (spec fases 2-3 §6). Pega follow-ups pendentes vencidos, o porteiro decide se
 * ainda faz sentido (libera, reagenda ou aborta), o redator escreve o texto e ele espera a
 * aprovação humana em `aguardando_aprovacao`. Respeita janela e cota do ritmo (§7) e põe as
 * avaliações humanas no fim dos prompts (§8). Montagem e validação são as do legado.
 */
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor, type ClienteDb } from "../db";
import * as porteiro from "../ia/prompts/porteiro";
import * as redator from "../ia/prompts/redator";
import type { ClienteIa } from "../ia/tipos";
import { logErro } from "../log";
import {
  aplicar,
  type Avaliacao,
  type Desfecho,
  type LinhaFollowup,
  MODELO_PORTEIRO,
  MODELO_REDATOR,
  SQL_AVALIACOES,
  SQL_BUSCAR,
  SQL_REAGENDAR_FALHA,
  SQL_VENCIDOS,
  type Vencido,
} from "./redator-sql";

export type { Avaliacao, LinhaFollowup };
import { dentroDaJanela, lerRitmo, MODOS, preparadosHoje } from "./ritmo";
import { valorEsperado } from "./valor";

const linhaAvaliacao = (a: Avaliacao) =>
  '"' +
  (a.texto_original ?? "") +
  '" → ' +
  a.decisao +
  " → " +
  ([a.motivos.join(", "), a.texto_livre ?? ""].filter(Boolean).join("; ") || "sem motivo");

/** Bloco que entra no lugar de `{{AVALIACOES}}`: decisões humanas recentes. */
export function formatarAvaliacoes(doVendedor: Avaliacao[], recusasGerais: Avaliacao[]): string {
  const titulo = "AVALIACOES HUMANAS DOS TEXTOS SUGERIDOS (calibre-se por elas)\n";
  if (!doVendedor.length && !recusasGerais.length) return titulo + "(nenhuma avaliação ainda)";
  const editados = doVendedor.filter(
    (a) => a.texto_enviado !== null && a.texto_enviado !== a.texto_original,
  );
  const partes = [
    titulo + "Deste vendedor:\n" + (doVendedor.map(linhaAvaliacao).join("\n") || "(nenhuma)"),
  ];
  if (recusasGerais.length) {
    partes.push("Recusas recentes da equipe:\n" + recusasGerais.map(linhaAvaliacao).join("\n"));
  }
  if (editados.length) {
    partes.push(
      "Textos que o vendedor editou antes de enviar (original → editado):\n" +
        editados
          .map((a) => '"' + (a.texto_original ?? "") + '" → "' + a.texto_enviado + '"')
          .join("\n"),
    );
  }
  return partes.join("\n\n");
}

export async function blocoAvaliacoes(db: ClienteDb, vendedorId: string): Promise<string> {
  const { rows } = await db.query<Avaliacao & { fonte: string }>(SQL_AVALIACOES, [vendedorId]);
  return formatarAvaliacoes(
    rows.filter((r) => r.fonte === "vendedor"),
    rows.filter((r) => r.fonte === "geral"),
  );
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
    "  motivo de quem agendou: " + (d.motivo || "-"),
  ].join("\n");
  return {
    sistema: comAvaliacoes(porteiro.SISTEMA, avaliacoes),
    usuario: ficha + "\n\nCONVERSA:\n" + conversaDe(d),
  };
}

const CARIMBO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

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

  if (quando && !CARIMBO.test(quando)) quando = "";
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
const ETAPAS_CONCRETAS = ["aguardando pagamento", "agendado", "aula realizada"];
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
    "  por que foi agendado: " + (d.motivo || "-"),
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

/** Literal do nó "Validar texto": links, emoji, travessão, 10..600 caracteres. */
export function validarTexto(cru: unknown): string {
  const c = (cru && typeof cru === "object" ? cru : {}) as Record<string, unknown>;
  let texto = String(c.texto ?? "").trim();

  texto = texto.replace(/(?<!\/\/)\bwww\.[^\s)>\]]+/gi, (u) => "https://" + u);

  texto = texto.replace(/https?:\/\/[^\s)>\]]+/gi, (u) => {
    const limpo = u.replace(/[.,;:!?]+$/, "");
    return PERMITIDOS.includes(limpo.toLowerCase()) ? limpo : "";
  });

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

async function decidir(ia: ClienteIa, d: LinhaFollowup, avaliacoes: string): Promise<Desfecho> {
  const pp = montarPromptPorteiro(d, avaliacoes);
  const decisao = validarPorteiro(
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
      etiqueta: v.etiqueta ?? "Novo Lead",
      temperatura: v.temperatura,
      horasEstimadas: v.horas_estimadas,
      optOut: v.opt_out,
      semAtendimento: v.sem_atendimento,
      dataAgendada: v.data_agendada?.toISOString() ?? null,
    },
    Number(v.preco_hora ?? 0),
  );

/**
 * Uma rodada (15 min): só na janela e enquanto houver cota do dia. As vagas que restam
 * (até 10) vão aos vencidos de maior valor esperado (empate: o mais antigo); cada um grava
 * na própria transação. Falha da IA, da validação ou da gravação reagenda em +30 min.
 * Devolve quantos follow-ups mudaram (reagendado, abortado ou texto gravado).
 */
export async function tarefaRedator(deps: { ia: ClienteIa; agora?: Date }): Promise<number> {
  const db = getPoolMotor();
  if (!dentroDaJanela(deps.agora ?? new Date())) return 0;
  const { modo } = await lerRitmo(db);
  const vagas = MODOS[modo].cotaDia - (await preparadosHoje(db));
  if (vagas <= 0) return 0;

  const { rows: vencidos } = await db.query<Vencido>(SQL_VENCIDOS);
  const ids = vencidos
    .map((v) => ({ id: v.id, valor: valorDe(v), em: v.agendado_para.getTime() }))
    .sort((a, b) => b.valor - a.valor || a.em - b.em)
    .slice(0, Math.min(10, vagas))
    .map((v) => v.id);

  const rodada = randomUUID();
  const { rows } = await db.query<LinhaFollowup>(SQL_BUSCAR, [ids]);
  rows.sort((a, b) => ids.indexOf(a.followup_id) - ids.indexOf(b.followup_id));

  let decididos = 0;
  for (const d of rows) {
    try {
      const x = await decidir(deps.ia, d, await blocoAvaliacoes(db, d.atendente_id));
      if (await comTransacao((c) => aplicar(c, d, x, rodada))) decididos++;
    } catch (erro) {
      logErro("redator.falha", erro, { followupId: d.followup_id });
      await db
        .query(SQL_REAGENDAR_FALHA, [d.followup_id])
        .catch((e: unknown) => logErro("redator.reagendar", e, { followupId: d.followup_id }));
    }
  }
  return decididos;
}
