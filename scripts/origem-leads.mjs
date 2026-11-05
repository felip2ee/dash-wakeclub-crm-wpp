#!/usr/bin/env bun
/**
 * WakeCRM · preenche a origem (anúncio, link, busca, outro, direto) dos leads antigos.
 *
 *   bun run db:origem
 *
 * Por que existe: a ingestão grava a origem só de mensagens novas. Para o passado, lê o
 * banco `evolution` (a Evolution guarda o `contextInfo` de cada mensagem) e aplica a mesma
 * classificação do webhook (`normalizarEvolution`), então script e ingestão não divergem.
 * Manual e idempotente. Regras:
 *   1. Nunca sobrescreve `origem_*` já preenchida, exceto `direto` com `origem_detectada_em`
 *      nula: é "sem evidência ainda" (o motor gravou antes deste script) e, se a Evolution
 *      tem marca para o telefone, é sobrescrito (as cinco colunas `origem_*`).
 *   2. A varredura final marca `direto` só o lead com pelo menos uma mensagem dele; lead só
 *      com mensagem da equipe, ou sem mensagem, continua NULL.
 * Só leitura na Evolution; escreve só as colunas `origem_*` de wakeclub.leads.
 *
 * Lê do ambiente (ou do .env, o ambiente ganha):
 *   ADMIN_DATABASE_URL    dono do banco wakeclub (o caminho é trocado para /evolution na leitura).
 *   EVOLUTION_INSTANCIA   nome da instância (padrão wakeclub).
 *
 * Saída: `canal<TAB>quantidade` (leads preenchidos nesta rodada), "sem lead no CRM" e
 * "já tinham origem".
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { normalizarEvolution } from "../src/server/evolution/normalizar.ts";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function carregarEnv() {
  let bruto;
  try {
    bruto = readFileSync(resolve(RAIZ, ".env"), "utf8");
  } catch {
    return;
  }
  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    const corte = limpa.indexOf("=");
    if (!limpa || limpa.startsWith("#") || corte === -1) continue;
    const chave = limpa.slice(0, corte).trim();
    const valor = limpa
      .slice(corte + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

const MARCADAS = `
  select m.key, m.message, m."contextInfo", m."messageTimestamp", m."pushName"
    from "Message" m
    join "Instance" i on i.id = m."instanceId"
   where i.name = $1::text
     and coalesce(m.key->>'fromMe', 'false') <> 'true'
     and (m."contextInfo" ? 'entryPointConversionSource'
          or m."contextInfo" ? 'externalAdReply'
          or jsonb_path_exists(m.message, '$.**.entryPointConversionSource')
          or jsonb_path_exists(m.message, '$.**.externalAdReply'))
   order by m."messageTimestamp"`;

async function main() {
  carregarEnv();
  const url = process.env.ADMIN_DATABASE_URL;
  if (!url) {
    console.error("ADMIN_DATABASE_URL não está definida.");
    process.exit(1);
  }
  const instancia = process.env.EVOLUTION_INSTANCIA || "wakeclub";
  const urlEvolution = new URL(url);
  urlEvolution.pathname = "/evolution";

  // 1. Evolution, só leitura: a mensagem recebida mais antiga com marca, por telefone.
  const evo = new pg.Client({
    connectionString: urlEvolution.toString(),
    connectionTimeoutMillis: 8000,
    options: "-c default_transaction_read_only=on",
  });
  await evo.connect();
  const origens = new Map();
  try {
    const { rows } = await evo.query(MARCADAS, [instancia]);
    for (const dados of rows) {
      for (const e of normalizarEvolution({
        event: "messages.upsert",
        instance: instancia,
        data: dados,
      })) {
        if (e.tipo !== "mensagem" || e.daEquipe || !e.origem || origens.has(e.telefone)) continue;
        origens.set(e.telefone, { origem: e.origem, em: e.enviadaEm });
      }
    }
  } finally {
    await evo.end();
  }

  // 2. wakeclub: uma transação, só colunas origem_*.
  const crm = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  await crm.connect();
  const contagem = { anuncio: 0, link: 0, busca: 0, outro: 0, direto: 0 };
  let semLead = 0;
  let jaTinham = 0;
  try {
    await crm.query("begin");
    const { rows: leads } = await crm.query(
      "select telefone, origem_canal, origem_detectada_em from wakeclub.leads",
    );
    // null = sem origem; "direto" sem detectada_em também conta como sem evidência.
    const estado = new Map(
      leads.map((l) => [
        l.telefone,
        l.origem_canal === "direto" && l.origem_detectada_em === null ? null : l.origem_canal,
      ]),
    );
    jaTinham = [...estado.values()].filter((c) => c !== null).length;
    for (const [telefone, { origem, em }] of origens) {
      if (!estado.has(telefone)) {
        semLead++;
        continue;
      }
      if (estado.get(telefone) !== null) continue;
      const r = await crm.query(
        `update wakeclub.leads
            set origem_canal = $2::text, origem_app = $3::text, origem_anuncio_id = $4::text,
                origem_anuncio_titulo = $5::text, origem_detectada_em = $6::timestamptz
          where telefone = $1::text
            and (origem_canal is null
                 or (origem_canal = 'direto' and origem_detectada_em is null))`,
        [telefone, origem.canal, origem.app, origem.anuncioId, origem.anuncioTitulo, em],
      );
      contagem[origem.canal] += r.rowCount ?? 0;
    }
    const direto = await crm.query(
      `update wakeclub.leads set origem_canal = 'direto'
        where origem_canal is null
          and exists (select 1 from wakeclub.mensagens m
                       where m.lead_id = leads.id and m.direcao = 'lead')`,
    );
    contagem.direto = direto.rowCount ?? 0;
    await crm.query("commit");
  } catch (erro) {
    await crm.query("rollback").catch(() => {});
    throw erro;
  } finally {
    await crm.end();
  }

  for (const [canal, quantidade] of Object.entries(contagem))
    console.log(`${canal}\t${quantidade}`);
  console.log(`sem lead no CRM\t${semLead}`);
  console.log(`já tinham origem\t${jaTinham}`);
}

await main();
