#!/usr/bin/env node
/**
 * Wake Club · setup e diagnóstico do banco do painel.
 *
 *   bun run db:check   → conta o que existe no banco e o que o painel enxerga
 *   bun run db:apply   → cria/atualiza as roles do painel e aplica as views
 *
 * Por que existe: quando uma tela do painel vem vazia, os dois motivos possíveis
 * — "não tem dado no banco" e "a role não tem permissão nessa view" — são
 * indistinguíveis na tela. Este script separa os dois em 3 segundos, antes de
 * alguém ir caçar bug no front.
 *
 * Lê do .env:
 *   ADMIN_DATABASE_URL   dono do banco. Só este script usa. A aplicação nunca lê.
 *   DATABASE_URL         a role read-only do painel. É esta que a aplicação usa.
 *   DATABASE_URL_RW      a role limitada de escrita do painel.
 *   PAINEL_RO_PASSWORD   senha da painel_ro (só o `apply` usa).
 *   PAINEL_RW_PASSWORD   senha da painel_rw (só o `apply` usa).
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
  "v_mensagens_autoria",
  "v_wf02_atividade",
  "v_wf02_motor",
  "v_followups_painel",
  "v_relatorio_resumo",
  "v_relatorio_funil",
  "v_relatorio_volume_dia",
  "v_relatorio_wf02_dia",
  "v_sessao_valida",
  "v_followups_fila",
  "v_admin_labels_disponiveis",
  "v_admin_atendentes",
  "v_admin_resumo",
];

const TABELAS = [
  "leads",
  "mensagens",
  "followups",
  "crm_outbox",
  "instancia_eventos",
  "instancia_estado",
  "usuarios",
  "sessoes",
  "push_subscriptions",
  "notificacoes",
  "followup_toques",
  "whatsapp_labels",
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
  const painelRwUrl = exigir("DATABASE_URL_RW");

  titulo("Conexão");
  linha("admin", cor.fraco(mascarar(adminUrl)));
  linha("painel", cor.fraco(mascarar(painelUrl)));
  linha("painel rw", cor.fraco(mascarar(painelRwUrl)));

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
      "select rolname, rolcanlogin from pg_roles where rolname in ('painel_ro', 'painel_rw')",
    );
    for (const nome of ["painel_ro", "painel_rw"]) {
      const encontrada = role.find((item) => item.rolname === nome);
      if (!encontrada) {
        console.log(cor.erro(`  ✗ a role \`${nome}\` NÃO existe`));
        console.log(cor.fraco("    Rode: bun run db:apply"));
        tudoOk = false;
      } else if (!encontrada.rolcanlogin) {
        console.log(cor.erro(`  ✗ a role \`${nome}\` existe, mas não pode fazer login`));
        tudoOk = false;
      } else {
        console.log(cor.ok(`  ✓ a role \`${nome}\` existe e pode fazer login`));
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
      if (e.code === "42501") {
        console.log(cor.ok("  ✓ escrita bloqueada (42501)"));
      } else {
        console.log(cor.erro(`  ✗ escrita falhou por motivo inesperado (${e.code ?? "erro"})`));
        tudoOk = false;
      }
      console.log(cor.fraco(`    ${e.message.split("\n")[0]}`));
    }
  } finally {
    await painel.end();
  }

  // ---- escrita permitida, pela conexão limitada do painel ----------------
  titulo("Privilégios da painel_rw");
  const painelRw = await conectar(painelRwUrl, "painel_rw");

  try {
    const { rows: usuarios } = await painelRw.query(
      "select id from wakeclub.usuarios where ativo = true order by criado_em limit 1",
    );

    if (usuarios.length === 0) {
      console.log(cor.erro("  ✗ não há usuário ativo para testar uma sessão"));
      tudoOk = false;
    } else {
      const tokenTeste = `db-check-${crypto.randomUUID()}`;
      try {
        await painelRw.query(
          `insert into wakeclub.sessoes (usuario_id, token_hash, expira_em)
           values ($1::uuid, $2::text, now() + interval '1 minute')`,
          [usuarios[0].id, tokenTeste],
        );
        await painelRw.query("delete from wakeclub.sessoes where token_hash = $1::text", [
          tokenTeste,
        ]);
        console.log(cor.ok("  ✓ INSERT e DELETE de sessão permitidos"));
      } catch (e) {
        console.log(cor.erro(`  ✗ sessão de teste falhou: ${e.message.split("\n")[0]}`));
        tudoOk = false;
      }
    }

    const { rows: privilegiosUsuarios } = await painelRw.query(
      `select
         has_column_privilege(current_user, 'wakeclub.usuarios', 'ultimo_acesso_em', 'UPDATE')
           as atualiza_ultimo_acesso,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'ativo', 'UPDATE')
           as atualiza_ativo,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'senha_hash', 'UPDATE')
           as atualiza_senha,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'papel', 'UPDATE')
           as atualiza_papel,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'label_id', 'UPDATE')
           as atualiza_label,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'nome', 'INSERT')
           as insere_nome,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'usuario', 'INSERT')
           as insere_usuario,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'senha_hash', 'INSERT')
           as insere_senha,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'papel', 'INSERT')
           as insere_papel,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'label_id', 'INSERT')
           as insere_label,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'ativo', 'INSERT')
           as insere_ativo,
         has_column_privilege(current_user, 'wakeclub.usuarios', 'id', 'INSERT')
           as insere_id`,
    );
    const privilegios = privilegiosUsuarios[0];
    if (
      privilegios.atualiza_ultimo_acesso &&
      privilegios.atualiza_ativo &&
      !privilegios.atualiza_senha &&
      !privilegios.atualiza_papel &&
      !privilegios.atualiza_label
    ) {
      console.log(cor.ok("  ✓ UPDATE limitado a usuarios.ultimo_acesso_em e usuarios.ativo"));
    } else {
      console.log(cor.erro("  ✗ privilégios de UPDATE em usuarios estão fora do contrato"));
      tudoOk = false;
    }

    if (
      privilegios.insere_nome &&
      privilegios.insere_usuario &&
      privilegios.insere_senha &&
      privilegios.insere_label &&
      !privilegios.insere_papel &&
      !privilegios.insere_ativo &&
      !privilegios.insere_id
    ) {
      console.log(cor.ok("  ✓ INSERT de usuarios limitado às colunas do cadastro"));
    } else {
      console.log(cor.erro("  ✗ privilégios de INSERT em usuarios estão fora do contrato"));
      tudoOk = false;
    }

    // ---- a exceção nomeada de leads é ESTREITA (05/08/2026) ---------------
    //
    // A painel_rw ganhou sem_atendimento e mais nada em `leads`. Um teste só de
    // "não consegue ler leads" passaria por acidente — `select *` expande pras
    // colunas sem grant e falha de qualquer jeito. Então checa os DOIS lados:
    // o que tem que passar, e o que tem que continuar barrado.

    const deveBarrar = async (rotulo, sql) => {
      try {
        await painelRw.query(sql);
        console.log(cor.erro(`  ✗ ${rotulo}: PASSOU, e devia estar barrado`));
        tudoOk = false;
      } catch (e) {
        if (e.code === "42501") {
          console.log(cor.ok(`  ✓ ${rotulo} barrado (42501)`));
        } else {
          console.log(cor.erro(`  ✗ ${rotulo} retornou ${e.code ?? "erro desconhecido"}`));
          console.log(cor.fraco(`    ${e.message.split("\n")[0]}`));
          tudoOk = false;
        }
      }
    };

    await deveBarrar("select * em leads", "select * from wakeclub.leads limit 1");
    await deveBarrar("leitura de leads.telefone", "select telefone from wakeclub.leads limit 1");

    let leadId = null;
    try {
      const { rows } = await painelRw.query(
        "select id from wakeclub.leads where sem_atendimento = false limit 1",
      );
      leadId = rows[0]?.id ?? null;
      console.log(cor.ok("  ✓ leitura de leads.sem_atendimento permitida"));
    } catch (e) {
      console.log(cor.erro(`  ✗ a exceção de sem_atendimento não está aplicada: ${e.code}`));
      console.log(cor.fraco("    rode `bun run db:apply` — o grant vive no apply, não no .sql"));
      tudoOk = false;
    }

    // Escrita: testada dentro de transação e revertida. Nada persiste.
    if (leadId === null) {
      console.log(cor.aviso("  ~ sem lead para testar a escrita de sem_atendimento"));
    } else {
      try {
        await painelRw.query("begin");
        await painelRw.query(
          "update wakeclub.leads set sem_atendimento = true where id = $1::uuid",
          [leadId],
        );
        console.log(cor.ok("  ✓ UPDATE de sem_atendimento permitido (revertido)"));
      } catch (e) {
        console.log(cor.erro(`  ✗ UPDATE de sem_atendimento falhou: ${e.code ?? e.message}`));
        tudoOk = false;
      } finally {
        await painelRw.query("rollback");
      }

      try {
        await painelRw.query("begin");
        await painelRw.query(
          "update wakeclub.leads set etiqueta = 'Agendado' where id = $1::uuid",
          [leadId],
        );
        console.log(
          cor.erro("  ✗ a painel_rw ESCREVEU em leads.etiqueta. Quem escreve é o WF-02."),
        );
        tudoOk = false;
      } catch (e) {
        if (e.code === "42501") {
          console.log(cor.ok("  ✓ UPDATE de leads.etiqueta barrado (42501)"));
        } else {
          console.log(cor.erro(`  ✗ bloqueio de etiqueta retornou ${e.code ?? "?"}`));
          tudoOk = false;
        }
      } finally {
        await painelRw.query("rollback");
      }

      await deveBarrar(
        "UPDATE de leads.atendente_id",
        `update wakeclub.leads set atendente_id = null where id = '${leadId}'::uuid`,
      );
    }
  } finally {
    await painelRw.end();
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
  const senhaRw = exigir("PAINEL_RW_PASSWORD");

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

    titulo("2. Role painel_rw");
    const { rows: existeRw } = await admin.query(
      "select 1 from pg_roles where rolname = 'painel_rw'",
    );
    const { rows: sqlRw } = await admin.query(
      `select format(
          $fmt$%s role painel_rw with login password %L$fmt$,
          case when $1::boolean then 'alter' else 'create' end,
          $2::text
       ) as comando`,
      [existeRw.length > 0, senhaRw],
    );
    await admin.query(sqlRw[0].comando);
    await admin.query("grant connect on database wakeclub to painel_rw");
    console.log(
      existeRw.length > 0
        ? cor.ok("  ✓ role já existia — senha redefinida")
        : cor.ok("  ✓ role criada"),
    );

    titulo("3. Views (db/painel-views.sql)");
    const caminho = resolve(RAIZ_PROJETO, "db", "painel-views.sql");
    const ddl = readFileSync(caminho, "utf8");
    await admin.query(ddl);
    console.log(cor.ok(`  ✓ painel-views.sql aplicado e liberado`));
    console.log(cor.fraco(`    ${caminho}`));

    titulo("4. Privilégios limitados da painel_rw");
    await admin.query("grant usage on schema wakeclub to painel_rw");
    await admin.query("grant select on wakeclub.usuarios to painel_rw");
    await admin.query("grant update (ultimo_acesso_em) on wakeclub.usuarios to painel_rw");
    await admin.query("grant update (ativo) on wakeclub.usuarios to painel_rw");
    await admin.query("revoke insert (papel, ativo) on wakeclub.usuarios from painel_rw");
    await admin.query(
      `grant insert (nome, usuario, senha_hash, label_id)
         on wakeclub.usuarios to painel_rw`,
    );
    await admin.query("grant select, insert, update, delete on wakeclub.sessoes to painel_rw");
    await admin.query(
      "grant select, insert, update, delete on wakeclub.push_subscriptions to painel_rw",
    );
    await admin.query("grant insert on wakeclub.followup_toques to painel_rw");
    await admin.query(
      `revoke all on
         wakeclub.leads,
         wakeclub.mensagens,
         wakeclub.followups,
         wakeclub.crm_outbox,
         wakeclub.instancia_eventos,
         wakeclub.instancia_estado,
         wakeclub.notificacoes,
         wakeclub.whatsapp_labels
       from painel_rw`,
    );

    // Segunda exceção nomeada à regra de espelho (05/08/2026): sem_atendimento.
    //
    // ORDEM IMPORTA: vem DEPOIS do revoke acima, que alcança wakeclub.leads.
    // Grant antes dele seria apagado na mesma execução.
    //
    // `sem_atendimento` é filtro duro do §7.1 e vinha da label do Fernando no
    // WhatsApp. As labels ficaram fora de alcance (§15, medido em 04/08/2026),
    // então o fato passou a ser marcado por uma pessoa, no painel.
    //
    // ESCOPADO POR COLUNA de propósito: a painel_rw continua sem alcançar
    // `etiqueta` (do WF-02) nem `atendente_id` (do WF-08). Se o painel também
    // escrevesse nelas, brigaria com os workflows pelo mesmo registro (§14).
    await admin.query(
      `grant update (sem_atendimento, sem_atendimento_motivo)
         on wakeclub.leads to painel_rw`,
    );
    // UPDATE sem SELECT não serve: a tela precisa ler o estado atual pra
    // mostrar o botão marcado, e a chave pro WHERE.
    await admin.query(
      `grant select (id, sem_atendimento, sem_atendimento_motivo)
         on wakeclub.leads to painel_rw`,
    );
    // O drop/create de v_followups_fila no painel-views.sql apaga o grant que a 0002 deu ao motor.
    await admin.query(
      `do $$
       begin
         if exists (select 1 from pg_roles where rolname = 'wakecrm_motor')
            and to_regclass('wakeclub.v_followups_fila') is not null then
           grant select on wakeclub.v_followups_fila to wakecrm_motor;
         end if;
       end
       $$`,
    );
    // v_mensagens_autoria vem da 0002; o painel-views.sql pode recriar views e apagar o grant.
    await admin.query(
      `do $$
       begin
         if to_regclass('wakeclub.v_mensagens_autoria') is not null then
           grant select on wakeclub.v_mensagens_autoria to painel_ro;
         end if;
       end
       $$`,
    );
    console.log(cor.ok("  ✓ GRANTs explícitos aplicados"));

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
  console.log("  apply  cria as roles do painel, aplica views e GRANTs explícitos");
  process.exit(1);
}
