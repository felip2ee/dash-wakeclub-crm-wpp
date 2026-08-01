#!/usr/bin/env node
/**
 * Wake Club · setup e diagnóstico do banco do painel.
 *
 *   bun run db:check   → conta o que existe no banco e o que o painel enxerga
 *   bun run db:apply   → cria/atualiza a role painel_ro e aplica db/painel-views.sql
 *
 * Por que existe: quando uma tela do painel vem vazia, os dois motivos possíveis
 * — "não tem dado no banco" e "a role não tem permissão nessa view" — são
 * indistinguíveis na tela. Este script separa os dois em 3 segundos, antes de
 * alguém ir caçar bug no front.
 *
 * Lê do .env:
 *   ADMIN_DATABASE_URL   dono do banco. Só este script usa. A aplicação nunca lê.
 *   DATABASE_URL         a role read-only do painel. É esta que a aplicação usa.
 *   PAINEL_RO_PASSWORD   senha da painel_ro (só o `apply` usa).
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_PAINEL = resolve(AQUI, "..");
const RAIZ_PROJETO = resolve(RAIZ_PAINEL, "..");

/** As views que o painel precisa conseguir ler. Espelha db/painel-views.sql. */
const VIEWS_ESPERADAS = [
  "v_leads_painel",
  "v_saude_numero",
  "v_conversas_painel",
  "v_mensagens_painel",
  "v_wf02_atividade",
  "v_wf02_motor",
  "v_followups_painel",
  "v_relatorio_resumo",
  "v_relatorio_funil",
  "v_relatorio_volume_dia",
  "v_relatorio_wf02_dia",
];

const TABELAS = [
  "leads",
  "mensagens",
  "followups",
  "crm_outbox",
  "instancia_eventos",
  "instancia_estado",
];

// ---------------------------------------------------------------------------
// .env — parser mínimo. O bun já carrega o .env sozinho, mas o node não, e
// depender disso faria o script funcionar num runtime e falhar no outro.
// ---------------------------------------------------------------------------

function carregarEnv() {
  let bruto;
  try {
    bruto = readFileSync(resolve(RAIZ_PAINEL, ".env"), "utf8");
  } catch {
    return; // sem .env: as variáveis podem vir do ambiente
  }

  for (const linha of bruto.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;

    const corte = limpa.indexOf("=");
    if (corte === -1) continue;

    const chave = limpa.slice(0, corte).trim();
    let valor = limpa.slice(corte + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }

    // O ambiente ganha do arquivo — é o que todo carregador de .env faz.
    if (process.env[chave] === undefined) process.env[chave] = valor;
  }
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

const cor = {
  ok: (t) => `\x1b[32m${t}\x1b[0m`,
  erro: (t) => `\x1b[31m${t}\x1b[0m`,
  aviso: (t) => `\x1b[33m${t}\x1b[0m`,
  fraco: (t) => `\x1b[90m${t}\x1b[0m`,
  forte: (t) => `\x1b[1m${t}\x1b[0m`,
};

const titulo = (t) => console.log(`\n${cor.forte(t)}\n${cor.fraco("─".repeat(60))}`);
const linha = (rotulo, valor) => console.log(`  ${rotulo.padEnd(30)} ${valor}`);

/** Esconde a senha antes de imprimir qualquer URL de conexão. */
function mascarar(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "(url inválida)";
  }
}

function exigir(nome) {
  const valor = process.env[nome];
  if (!valor) {
    console.error(cor.erro(`\n✗ ${nome} não está definida.`));
    console.error(
      cor.fraco(
        `  Copie .env.example para .env e preencha. O arquivo fica em:\n  ${resolve(RAIZ_PAINEL, ".env")}\n`,
      ),
    );
    process.exit(1);
  }
  return valor;
}

async function conectar(url, rotulo) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    return client;
  } catch (e) {
    console.error(cor.erro(`\n✗ Não deu para conectar como ${rotulo}.`));
    console.error(cor.fraco(`  ${mascarar(url)}`));
    console.error(cor.fraco(`  ${e.message}\n`));
    diagnosticarConexao(e);
    process.exit(1);
  }
}

/** Os quatro erros que aparecem na prática, e o que cada um quer dizer. */
function diagnosticarConexao(e) {
  const c = e.code ?? "";
  if (c === "ENOTFOUND" || c === "EAI_AGAIN") {
    console.error(cor.aviso("  O host não resolve. Confira o endereço na URL."));
  } else if (c === "ECONNREFUSED") {
    console.error(
      cor.aviso(
        "  A porta recusou a conexão. O Postgres pode não estar exposto\n" +
          "  para fora do servidor — confira listen_addresses e o firewall.",
      ),
    );
  } else if (c === "ETIMEDOUT") {
    console.error(cor.aviso("  Tempo esgotado — geralmente é firewall bloqueando a 5432."));
  } else if (c === "28P01") {
    console.error(cor.aviso("  Senha incorreta para esse usuário."));
  } else if (c === "28000") {
    console.error(
      cor.aviso(
        "  O pg_hba.conf do servidor não permite essa combinação de\n" +
          "  usuário/host/método. Precisa de uma linha para este IP.",
      ),
    );
  } else if (c === "3D000") {
    console.error(cor.aviso("  O banco não existe. O do CRM chama-se `wakeclub`."));
  }
}

// ---------------------------------------------------------------------------
// check
// ---------------------------------------------------------------------------

async function check() {
  const adminUrl = exigir("ADMIN_DATABASE_URL");
  const painelUrl = exigir("DATABASE_URL");

  titulo("Conexão");
  linha("admin", cor.fraco(mascarar(adminUrl)));
  linha("painel", cor.fraco(mascarar(painelUrl)));

  const admin = await conectar(adminUrl, "admin");
  let tudoOk = true;

  try {
    const { rows: v } = await admin.query(
      "select version() as v, current_database() as db, current_user as usuario",
    );
    linha("servidor", v[0].v.split(",")[0]);
    linha("banco", v[0].db);
    linha("conectado como", v[0].usuario);

    if (v[0].db !== "wakeclub") {
      console.log(
        cor.aviso(
          `\n  ⚠ O banco do CRM é \`wakeclub\`. Você está em \`${v[0].db}\`.\n` +
            "    Cuidado para não apontar para o `n8n_queue` (banco interno do n8n).",
        ),
      );
    }

    // ---- dados ----------------------------------------------------------
    titulo("Dados no banco");
    const { rows: schema } = await admin.query(
      "select 1 from information_schema.schemata where schema_name = 'wakeclub'",
    );
    if (schema.length === 0) {
      console.log(cor.erro("  ✗ o schema `wakeclub` não existe neste banco"));
      console.log(cor.fraco("    Rode o workflow `wakeclubcrm · db setup` no n8n antes de tudo."));
      process.exit(1);
    }

    let totalLinhas = 0;
    for (const t of TABELAS) {
      try {
        const { rows } = await admin.query(`select count(*)::int as n from wakeclub.${t}`);
        totalLinhas += rows[0].n;
        linha(t, rows[0].n === 0 ? cor.fraco("0") : cor.forte(String(rows[0].n)));
      } catch {
        linha(t, cor.erro("não existe"));
        tudoOk = false;
      }
    }

    const { rows: q } = await admin.query(
      "select count(*)::int as n, max(criado_em) as ultima from wakeclub.crm_outbox where tipo = 'qualificacao'",
    );
    linha(
      "qualificações do WF-02",
      q[0].n === 0
        ? cor.fraco("0")
        : `${q[0].n} · última ${q[0].ultima?.toLocaleString("pt-BR") ?? "—"}`,
    );

    if (totalLinhas === 0) {
      console.log(
        cor.aviso(
          "\n  ⚠ O banco está vazio. O painel vai abrir sem nada — isso não é bug\n" +
            "    do painel. Se era pra ter dado, o WF-01 pode não estar recebendo\n" +
            "    webhook da Evolution.",
        ),
      );
    }

    // ---- role -----------------------------------------------------------
    titulo("Role do painel");
    const { rows: role } = await admin.query(
      "select rolcanlogin from pg_roles where rolname = 'painel_ro'",
    );
    if (role.length === 0) {
      console.log(cor.erro("  ✗ a role `painel_ro` NÃO existe"));
      console.log(cor.fraco("    Rode: bun run db:apply"));
      tudoOk = false;
    } else {
      console.log(cor.ok("  ✓ a role `painel_ro` existe"));
      if (!role[0].rolcanlogin) {
        console.log(cor.erro("  ✗ mas ela não pode fazer login (falta LOGIN)"));
        tudoOk = false;
      }
    }

    // ---- views ----------------------------------------------------------
    titulo("Views e permissões");
    const { rows: existentes } = await admin.query(
      "select table_name from information_schema.views where table_schema = 'wakeclub'",
    );
    const nomes = new Set(existentes.map((r) => r.table_name));

    const { rows: grants } = await admin.query(
      `select table_name from information_schema.table_privileges
        where grantee = 'painel_ro' and privilege_type = 'SELECT'`,
    );
    const concedidas = new Set(grants.map((r) => r.table_name));

    for (const view of VIEWS_ESPERADAS) {
      if (!nomes.has(view)) {
        linha(view, cor.erro("view não existe"));
        tudoOk = false;
      } else if (!concedidas.has(view)) {
        linha(view, cor.erro("existe, mas sem GRANT para painel_ro"));
        tudoOk = false;
      } else {
        linha(view, cor.ok("ok"));
      }
    }

    const extras = existentes.map((r) => r.table_name).filter((n) => !VIEWS_ESPERADAS.includes(n));
    if (extras.length > 0) linha("(outras views)", cor.fraco(extras.join(", ")));
  } finally {
    await admin.end();
  }

  // ---- leitura de verdade, pela conexão do painel ------------------------
  titulo("Leitura pela conexão do painel");
  const painel = new pg.Client({
    connectionString: painelUrl,
    connectionTimeoutMillis: 8000,
  });

  try {
    await painel.connect();
  } catch (e) {
    console.log(cor.erro(`  ✗ o painel não consegue conectar: ${e.message}`));
    diagnosticarConexao(e);
    console.log(
      cor.fraco(
        "\n    Se a senha estiver errada, `bun run db:apply` redefine a senha da\n" +
          "    painel_ro para o valor de PAINEL_RO_PASSWORD.",
      ),
    );
    process.exit(1);
  }

  try {
    for (const view of VIEWS_ESPERADAS) {
      try {
        const { rows } = await painel.query(`select count(*)::int as n from wakeclub.${view}`);
        linha(view, `${cor.ok("lê")} ${cor.fraco(`· ${rows[0].n} linha(s)`)}`);
      } catch (e) {
        linha(view, cor.erro(e.message.split("\n")[0]));
        tudoOk = false;
      }
    }

    // A trava que garante que o painel é espelho, não editor.
    titulo("Trava de escrita");
    try {
      await painel.query("insert into wakeclub.leads (telefone) values ('+5500000000000')");
      console.log(cor.erro("  ✗ O PAINEL CONSEGUIU ESCREVER. A role tem permissão demais."));
      tudoOk = false;
    } catch (e) {
      console.log(cor.ok(`  ✓ escrita bloqueada (${e.code ?? "erro"})`));
      console.log(cor.fraco(`    ${e.message.split("\n")[0]}`));
    }
  } finally {
    await painel.end();
  }

  console.log(
    tudoOk
      ? cor.ok("\n✓ Tudo pronto. `bun dev` e o painel lê o CRM.\n")
      : cor.aviso("\n⚠ Tem pendência acima. `bun run db:apply` resolve a maioria.\n"),
  );
  process.exit(tudoOk ? 0 : 1);
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

async function apply() {
  const adminUrl = exigir("ADMIN_DATABASE_URL");
  const senha = exigir("PAINEL_RO_PASSWORD");

  const admin = await conectar(adminUrl, "admin");

  try {
    titulo("1. Role painel_ro");
    const { rows: existe } = await admin.query(
      "select 1 from pg_roles where rolname = 'painel_ro'",
    );

    // CREATE/ALTER ROLE não aceita parâmetro ($1) — é comando utilitário.
    // O `format(%L)` do próprio Postgres faz o escape da senha com segurança.
    //
    // Os casts `::boolean` e `::text` são obrigatórios: `format()` é variádica
    // sobre `any`, então o Postgres não tem como inferir o tipo dos parâmetros
    // e falha com "could not determine data type of parameter $2".
    const { rows: sql } = await admin.query(
      `select format(
          $fmt$%s role painel_ro with login password %L$fmt$,
          case when $1::boolean then 'alter' else 'create' end,
          $2::text
       ) as comando`,
      [existe.length > 0, senha],
    );

    await admin.query(sql[0].comando);
    console.log(
      existe.length > 0
        ? cor.ok("  ✓ role já existia — senha redefinida")
        : cor.ok("  ✓ role criada"),
    );

    await admin.query("grant connect on database wakeclub to painel_ro");
    await admin.query("grant usage on schema wakeclub to painel_ro");
    console.log(cor.ok("  ✓ connect no banco + usage no schema"));

    // View nova não entra sozinha no alcance do painel. É chato de propósito:
    // cada superfície exposta passa por um GRANT explícito no painel-views.sql.
    await admin.query(
      "alter default privileges in schema wakeclub revoke all on tables from painel_ro",
    );
    console.log(cor.ok("  ✓ privilégios default revogados"));

    titulo("2. Views (db/painel-views.sql)");
    const caminho = resolve(RAIZ_PROJETO, "db", "painel-views.sql");
    const ddl = readFileSync(caminho, "utf8");
    await admin.query(ddl);
    console.log(cor.ok(`  ✓ ${VIEWS_ESPERADAS.length} views aplicadas e liberadas`));
    console.log(cor.fraco(`    ${caminho}`));

    console.log(cor.ok("\n✓ Pronto. Rode `bun run db:check` para conferir.\n"));
  } catch (e) {
    console.error(cor.erro(`\n✗ Falhou: ${e.message}`));
    if (e.position) console.error(cor.fraco(`  posição ${e.position} no SQL`));
    if (e.code === "42501") {
      console.error(
        cor.aviso(
          "  Sem permissão. A ADMIN_DATABASE_URL precisa ser o dono do banco\n" +
            "  (a mesma credencial que o n8n usa), não a role do painel.",
        ),
      );
    }
    process.exit(1);
  } finally {
    await admin.end();
  }
}

// ---------------------------------------------------------------------------

carregarEnv();

const comando = process.argv[2];
if (comando === "check") await check();
else if (comando === "apply") await apply();
else {
  console.log("uso: painel-db.mjs <check|apply>");
  console.log("  check  conta o que existe e o que o painel enxerga");
  console.log("  apply  cria a role painel_ro e aplica db/painel-views.sql");
  process.exit(1);
}
