/**
 * Distribuição de leads por peso e menção (design §6; substitui o WF-08).
 *
 * Lead que já teve dono é dele enquanto ele estiver ativo. Lead sem dono (ou com dono
 * desativado) vai para quem o citou pelo nome ou, senão, para o vendedor ativo com a
 * menor razão "recebidos por distribuição nos últimos 30 dias ÷ peso". Toda mudança de
 * dono vira `assignment_changed` no mesmo comando, com o motivo.
 */
import type { ClienteDb, PoolClient } from "../db";

export type Vendedor = {
  id: string;
  nome: string;
  peso: number;
  recebidos30d: number;
  cargaAtiva: number;
};

export type MotivoAtribuicao = "rodizio" | "mencao" | "desativacao" | "admin";

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Id do vendedor citado pelo primeiro nome, como palavra inteira; ambíguo → null. */
export function vendedorMencionado(texto: string, vendedores: Vendedor[]): string | null {
  const palavras = new Set(semAcento(texto).match(/[a-z0-9]+/g) ?? []);
  const porNome = new Map<string, Vendedor[]>();
  for (const v of vendedores) {
    const primeiro = semAcento(v.nome).match(/[a-z0-9]+/)?.[0];
    if (primeiro) porNome.set(primeiro, [...(porNome.get(primeiro) ?? []), v]);
  }
  const citados = [...porNome.entries()].filter(([nome]) => palavras.has(nome));
  if (citados.length !== 1) return null;
  const [donos] = citados.map(([, lista]) => lista);
  return donos.length === 1 && donos[0].peso > 0 ? donos[0].id : null;
}

export function escolherPorPeso(vendedores: Vendedor[], sortear = Math.random): string | null {
  const aptos = vendedores.filter((v) => v.peso > 0);
  if (aptos.length === 0) return null;
  const razao = (v: Vendedor) => v.recebidos30d / v.peso;
  const menorRazao = Math.min(...aptos.map(razao));
  const porRazao = aptos.filter((v) => razao(v) - menorRazao < 1e-9);
  const menorCarga = Math.min(...porRazao.map((v) => v.cargaAtiva));
  const empatados = porRazao.filter((v) => v.cargaAtiva === menorCarga);
  return empatados[Math.min(Math.floor(sortear() * empatados.length), empatados.length - 1)].id;
}

export async function carregarVendedores(db: ClienteDb): Promise<Vendedor[]> {
  const { rows } = await db.query<{
    id: string;
    nome: string;
    peso: number;
    recebidos_30d: number;
    carga_ativa: number;
  }>(
    `select u.id, u.nome, u.peso,
            (select count(*)::int from wakeclub.eventos_automacao e
              where e.tipo_evento = 'assignment_changed'
                and e.metadados ->> 'motivo' in ('rodizio', 'desativacao')
                and e.estado_novo ->> 'atendente_id' = u.id::text
                and e.ocorrido_em > now() - interval '30 days') as recebidos_30d,
            (select count(*)::int from wakeclub.leads l
              where l.atendente_id = u.id and l.opt_out = false
                and l.etiqueta <> 'Encerrado') as carga_ativa
       from wakeclub.usuarios u
      where u.ativo = true and u.papel = 'atendente'`,
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    peso: Number(r.peso),
    recebidos30d: Number(r.recebidos_30d),
    cargaAtiva: Number(r.carga_ativa),
  }));
}

/** Grava a mudança de dono e o evento no mesmo comando. */
export async function atribuir(
  db: ClienteDb,
  leadId: string,
  {
    novoId,
    motivo,
    extra = {},
  }: { novoId: string | null; motivo: MotivoAtribuicao; extra?: Record<string, string> },
): Promise<void> {
  await db.query(
    `with antes as (
       select id, atendente_id from wakeclub.leads where id = $1::uuid
     ), mudou as (
       update wakeclub.leads l
          set atendente_id = $2::uuid,
              atribuido_em = case when $2::uuid is null then null else now() end,
              atribuido_por = case when $2::uuid is null then null else $3::text end
         from antes a
        where l.id = a.id and a.atendente_id is distinct from $2::uuid
       returning l.id, a.atendente_id as anterior
     )
     insert into wakeclub.eventos_automacao
       (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
        estado_anterior, estado_novo, metadados,
        entidade_tipo, entidade_id, origem_tipo, correlacao_id)
     select m.id, 'distribuicao', 'assignment_changed',
            case when $3::text = 'admin' then 'admin' else 'motor' end,
            coalesce(m.anterior::text, 'sem dono') || ' -> ' || coalesce($2::text, 'sem dono'),
            $3::text,
            jsonb_build_object('atendente_id', m.anterior),
            jsonb_build_object('atendente_id', $2::uuid),
            $4::jsonb || jsonb_build_object('motivo', $3::text),
            'lead', m.id, 'motor', 'motor:atrib:' || gen_random_uuid()::text
       from mudou m`,
    [leadId, novoId, motivo, JSON.stringify(extra)],
  );
}

/**
 * Atribui um lead sem dono ativo. Devolve o novo dono, ou null se nada mudou.
 * A trava serializa distribuições concorrentes para a conta do peso não errar.
 */
export async function atribuirSeSemDono(
  db: PoolClient,
  leadId: string,
  texto: string,
  motivoPadrao: "rodizio" | "desativacao" = "rodizio",
): Promise<string | null> {
  await db.query("select pg_advisory_xact_lock(hashtext('wakecrm:distribuicao'))");
  const { rows } = await db.query<{ livre: boolean }>(
    `select (u.id is null or not u.ativo) and not l.opt_out and not l.sem_atendimento as livre
       from wakeclub.leads l
       left join wakeclub.usuarios u on u.id = l.atendente_id
      where l.id = $1::uuid`,
    [leadId],
  );
  if (!rows[0]?.livre) return null;

  const vendedores = await carregarVendedores(db);
  const mencionado = vendedorMencionado(texto, vendedores);
  const escolhido = mencionado ?? escolherPorPeso(vendedores);
  if (!escolhido) return null;
  await atribuir(db, leadId, { novoId: escolhido, motivo: mencionado ? "mencao" : motivoPadrao });
  return escolhido;
}

/** Solta os leads de vendedor desativado (porta do nó "Soltar leads de atendente inativa"). */
export async function soltarDeInativos(db: PoolClient): Promise<number> {
  const { rows } = await db.query<{ id: string }>(
    `select l.id from wakeclub.leads l
       join wakeclub.usuarios u on u.id = l.atendente_id
      where u.ativo = false`,
  );
  for (const { id } of rows) await atribuir(db, id, { novoId: null, motivo: "desativacao" });
  return rows.length;
}

/**
 * Redistribui leads soltos que o lead movimentou nos últimos 90 dias (corte do WF-08).
 * Quem já teve dono volta como `desativacao`; os demais como `rodizio`.
 */
export async function redistribuirSoltos(db: PoolClient): Promise<number> {
  const { rows } = await db.query<{ id: string; ja_teve_dono: boolean }>(
    `select l.id,
            exists (select 1 from wakeclub.eventos_automacao e
                     where e.lead_id = l.id and e.tipo_evento = 'assignment_changed')
              as ja_teve_dono
       from wakeclub.leads l
      where l.atendente_id is null
        and l.sem_atendimento = false
        and l.opt_out = false
        and l.ultima_msg_lead_em > now() - interval '90 days'
      order by l.criado_em
      limit 200`,
  );
  let atribuidos = 0;
  for (const r of rows) {
    const motivo = r.ja_teve_dono ? "desativacao" : "rodizio";
    if (await atribuirSeSemDono(db, r.id, "", motivo)) atribuidos += 1;
  }
  return atribuidos;
}

/** Correção manual do admin: só para vendedor ativo. */
export async function corrigirDono(
  db: PoolClient,
  leadId: string,
  usuarioId: string,
  adminId: string,
): Promise<void> {
  const { rows } = await db.query(
    `select 1 from wakeclub.usuarios
      where id = $1::uuid and ativo = true and papel = 'atendente'`,
    [usuarioId],
  );
  if (!rows[0]) throw new Error("Vendedor não encontrado ou inativo.");
  await atribuir(db, leadId, { novoId: usuarioId, motivo: "admin", extra: { admin_id: adminId } });
}
