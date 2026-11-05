import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

import { getPoolMotor } from "../src/server/db";
import { telefoneUnico } from "../src/server/motor/banco-teste";

// O driver `pg` só pode ser importado por src/server/db.ts: o SQL do banco `evolution`
// (que o pool do motor não alcança) roda num node -e, como em migrar.db.test.ts.
function sql(url: string, comando: string, params: unknown[] = []): void {
  const r = spawnSync(
    "node",
    [
      "--input-type=module",
      "-e",
      `import pg from "pg";
       const c = new pg.Client(process.argv[1]);
       await c.connect();
       await c.query(process.argv[2], JSON.parse(process.argv[3]));
       await c.end();`,
      url,
      comando,
      JSON.stringify(params),
    ],
    { encoding: "utf8" },
  );
  expect(r.stderr).toBe("");
  expect(r.status).toBe(0);
}

const COLUNAS = `origem_canal, origem_app, origem_anuncio_id, origem_anuncio_titulo,
                 origem_detectada_em::text as detectada_em`;

describe.skipIf(process.env.TESTE_BANCO !== "1")("db:origem", () => {
  const admin = process.env.ADMIN_DATABASE_URL ?? "";
  const urlDe = (banco: string) => {
    const u = new URL(admin);
    u.pathname = `/${banco}`;
    return u.toString();
  };
  const digitos = (t: string) => t.replace(/\D/g, "");
  const ctx = (fonte: string, app = "instagram") => ({
    entryPointConversionSource: fonte,
    entryPointConversionApp: app,
    externalAdReply: { sourceId: "AD1", title: "Aula experimental" },
  });
  let n = 0;
  const linha = (
    jid: string,
    t: number,
    over: { fromMe?: boolean; alt?: string; contexto?: object; dentro?: boolean },
  ) => {
    const contexto = over.contexto ?? ctx("ctwa_ad");
    const conteudo = over.dentro
      ? { extendedTextMessage: { text: "oi", contextInfo: contexto } }
      : { conversation: "oi" };
    return [
      `m${Date.now()}-${n++}`,
      JSON.stringify({
        remoteJid: jid,
        fromMe: over.fromMe ?? false,
        id: `id${n}`,
        ...(over.alt ? { remoteJidAlt: over.alt } : {}),
      }),
      JSON.stringify(conteudo),
      over.dentro ? null : JSON.stringify(contexto),
      t,
    ];
  };

  const p = Array.from({ length: 10 }, () => telefoneUnico());
  // paraE164 só devolve o 9 ao número de 12 dígitos cujo miolo começa em 6-9: fixa o p5.
  p[5] = p[5].replace(/^\+55639\d/, "+55639" + "8");
  const ids: string[] = [];

  async function foto() {
    const { rows } = await getPoolMotor().query(
      `select telefone, ${COLUNAS} from wakeclub.leads where id = any($1::uuid[]) order by telefone`,
      [ids],
    );
    return rows;
  }
  const doLead = async (i: number) => {
    const { rows } = await getPoolMotor().query(
      `select ${COLUNAS} from wakeclub.leads where telefone = $1::text`,
      [p[i]],
    );
    return rows[0];
  };
  const rodar = () =>
    spawnSync("bun", ["scripts/origem-leads.mjs"], {
      encoding: "utf8",
      env: {
        ...process.env,
        ADMIN_DATABASE_URL: urlDe("wakeclub"),
        EVOLUTION_INSTANCIA: "wakeclub",
      },
    });

  test("preenche pela mensagem recebida mais antiga com marca", async () => {
    sql(urlDe("postgres"), "select 1");
    const existe = spawnSync("node", [
      "--input-type=module",
      "-e",
      `import pg from "pg";
       const c = new pg.Client(process.argv[1]); await c.connect();
       const { rows } = await c.query("select 1 from pg_database where datname = 'evolution'");
       if (!rows.length) await c.query("create database evolution");
       await c.end();`,
      urlDe("postgres"),
    ]);
    expect(existe.status).toBe(0);
    const evo = urlDe("evolution");
    sql(evo, `create table if not exists "Instance" (id text primary key, name text)`);
    sql(
      evo,
      `create table if not exists "Message" (id text primary key, key jsonb, message jsonb,
         "contextInfo" jsonb, "messageTimestamp" integer, "instanceId" text, "pushName" text)`,
    );
    sql(evo, `delete from "Message"`);
    sql(evo, `insert into "Instance" (id, name) values ('i1', 'wakeclub') on conflict do nothing`);

    for (const tel of p) {
      const { rows } = await getPoolMotor().query(
        "insert into wakeclub.leads (telefone) values ($1::text) returning id",
        [tel],
      );
      ids.push(rows[0].id);
    }
    await getPoolMotor().query(
      "update wakeclub.leads set origem_canal = 'busca' where telefone = $1::text",
      [p[3]],
    );
    // p7: 'direto' sem detectada_em = o motor gravou sem evidência; p8: 'direto' com evidência.
    await getPoolMotor().query(
      "update wakeclub.leads set origem_canal = 'direto' where telefone = $1::text",
      [p[7]],
    );
    await getPoolMotor().query(
      "update wakeclub.leads set origem_canal = 'direto', origem_detectada_em = now() where telefone = $1::text",
      [p[8]],
    );
    // p2 e p6 têm mensagem do lead (viram direto); p9 só da equipe (fica NULL).
    for (const [i, direcao] of [
      [2, "lead"],
      [6, "lead"],
      [9, "equipe"],
    ] as const)
      await getPoolMotor().query(
        `insert into wakeclub.mensagens (lead_id, direcao, texto, enviada_em)
         values ($1::uuid, $2::text, 'oi', now())`,
        [ids[i], direcao],
      );

    const lid = `${digitos(p[4])}`;
    const linhas = [
      linha(`${digitos(p[0])}@s.whatsapp.net`, 1000, { dentro: true }),
      linha(`${digitos(p[1])}@s.whatsapp.net`, 100, { contexto: ctx("click_to_chat_link") }),
      linha(`${digitos(p[1])}@s.whatsapp.net`, 200, {}),
      linha(`${digitos(p[2])}@s.whatsapp.net`, 300, { fromMe: true }),
      linha(`${digitos(p[3])}@s.whatsapp.net`, 400, {}),
      linha("999999999@lid", 500, { alt: `${lid}@s.whatsapp.net` }),
      // 12 dígitos: sem o 9 do celular
      linha(`${digitos(p[5]).replace(/^(5563)9/, "$1")}@s.whatsapp.net`, 600, {}),
      linha(`${digitos(p[7])}@s.whatsapp.net`, 700, {}),
      linha(`${digitos(p[8])}@s.whatsapp.net`, 800, {}),
    ];
    for (const [id, key, message, contexto, t] of linhas) {
      sql(
        evo,
        `insert into "Message" (id, key, message, "contextInfo", "messageTimestamp", "instanceId")
         values ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::int, 'i1')`,
        [id, key, message, contexto, t],
      );
    }

    const r = rodar();
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^anuncio\t4$/m);
    expect(r.stdout).toMatch(/^sem lead no CRM\t\d+$/m);
    expect(r.stdout).toMatch(/^link\t1$/m);
    expect(Number(r.stdout.match(/^direto\t(\d+)$/m)?.[1])).toBeGreaterThanOrEqual(2);
    expect(Number(r.stdout.match(/^já tinham origem\t(\d+)$/m)?.[1])).toBeGreaterThanOrEqual(1);

    const a = await doLead(0);
    expect(a).toMatchObject({
      origem_canal: "anuncio",
      origem_app: "instagram",
      origem_anuncio_id: "AD1",
      origem_anuncio_titulo: "Aula experimental",
    });
    expect(new Date(a.detectada_em).getTime()).toBe(1000 * 1000);
    expect((await doLead(1)).origem_canal).toBe("link");
    expect((await doLead(2)).origem_canal).toBe("direto");
    expect((await doLead(3)).origem_canal).toBe("busca");
    expect((await doLead(4)).origem_canal).toBe("anuncio");
    expect((await doLead(5)).origem_canal).toBe("anuncio");
    const sem = await doLead(6);
    expect(sem.origem_canal).toBe("direto");
    expect(sem.detectada_em).toBeNull();
    const reescrito = await doLead(7);
    expect(reescrito.origem_canal).toBe("anuncio");
    expect(new Date(reescrito.detectada_em).getTime()).toBe(700 * 1000);
    const mantido = await doLead(8);
    expect(mantido.origem_canal).toBe("direto");
    expect(mantido.origem_app).toBeNull();
    expect((await doLead(9)).origem_canal).toBeNull();
  });

  test("idempotente: segunda rodada não muda nada e reporta já tinham origem", async () => {
    const antes = await foto();
    const r = rodar();
    expect(r.status).toBe(0);
    // Deste arquivo: p1–p5, p7 e p8 (p6 é 'direto' sem evidência e não conta; p9 segue nulo).
    expect(Number(r.stdout.match(/^já tinham origem\t(\d+)$/m)?.[1])).toBeGreaterThanOrEqual(7);
    expect(r.stdout).toMatch(/^anuncio\t0$/m);
    expect(r.stdout).toMatch(/^direto\t0$/m);
    expect(await foto()).toEqual(antes);
  });
});
