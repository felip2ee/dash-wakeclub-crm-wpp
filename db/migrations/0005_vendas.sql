-- 0005 · Dinheiro (WakeCRM fase 4): vendas, fechamento mensal e lançamentos de comissão.
--
-- Spec: docs/superpowers/specs/2026-11-05-wakecrm-fase-4-dinheiro.md §3, §4, §5.
-- Idempotente: reaplicar por cima não muda nada.

alter table leads add column if not exists cpf text;
create index if not exists leads_cpf_idx on leads (cpf) where cpf is not null;

create table if not exists fechamentos (
    id             uuid primary key default gen_random_uuid(),
    vendedor_id    uuid not null references usuarios (id),
    mes            date not null,
    total_vendas   integer not null default 0,
    total_comissao numeric(12,2) not null default 0,
    ajustes        numeric(12,2) not null default 0,
    pago_em        timestamptz,
    pago_por       uuid references usuarios (id),
    criado_em      timestamptz not null default now(),
    constraint fechamentos_mes_dia_1 check (mes = date_trunc('month', mes)::date),
    constraint fechamentos_vendedor_mes_unico unique (vendedor_id, mes)
);

create table if not exists vendas (
    id               uuid primary key default gen_random_uuid(),
    origem_externa   text not null default 'webhook',
    id_externo       text not null,
    comprada_em      timestamptz not null,
    valor            numeric(12,2) not null,
    cpf              text,
    telefone         text,
    produto          text,
    horas            smallint,
    status           text not null default 'paga',
    lead_id          uuid references leads (id),
    vendedor_id      uuid references usuarios (id),
    comissao_pct     numeric(5,2),
    comissao_valor   numeric(12,2),
    categoria        text,
    categoria_motivo text,
    vinculada_por    text,
    estornada_em     timestamptz,
    fechamento_id    uuid references fechamentos (id),
    corpo_bruto      jsonb,
    criado_em        timestamptz not null default now(),
    atualizado_em    timestamptz not null default now(),
    constraint vendas_origem_id_unico unique (origem_externa, id_externo),
    constraint vendas_status_valido check (status in ('paga', 'estornada')),
    constraint vendas_categoria_valida
        check (categoria in ('follow-up', 'atendimento', 'recompra', 'espontanea')),
    constraint vendas_vinculada_por_valida check (vinculada_por in ('cpf', 'telefone', 'admin'))
);

create index if not exists vendas_lead_idx on vendas (lead_id, comprada_em);
create index if not exists vendas_vendedor_idx on vendas (vendedor_id, comprada_em);
create index if not exists vendas_sem_dono_idx on vendas (comprada_em) where lead_id is null;

drop trigger if exists vendas_atualizado_em on vendas;
create trigger vendas_atualizado_em
    before update on vendas
    for each row execute function set_atualizado_em();

-- Estorno de mês já pago: valor negativo entra no próximo fechamento do vendedor.
create table if not exists lancamentos_comissao (
    id            uuid primary key default gen_random_uuid(),
    vendedor_id   uuid not null references usuarios (id),
    venda_id      uuid not null references vendas (id),
    fechamento_id uuid references fechamentos (id),
    valor         numeric(12,2) not null,
    motivo        text not null,
    criado_em     timestamptz not null default now()
);

create index if not exists lancamentos_comissao_vendedor_idx
    on lancamentos_comissao (vendedor_id, criado_em desc);

-- Eventos de venda podem vir sem lead (venda sem dono), como os de config.
alter table eventos_automacao drop constraint if exists eventos_automacao_entidade_valida;
alter table eventos_automacao add constraint eventos_automacao_entidade_valida
    check (entidade_tipo in ('lead', 'followup', 'config', 'venda'));
alter table eventos_automacao drop constraint if exists eventos_automacao_lead_obrigatorio;
alter table eventos_automacao add constraint eventos_automacao_lead_obrigatorio
    check (lead_id is not null or entidade_tipo in ('config', 'venda'));

-- Grants. Sem a wakecrm_motor a migração falha alto; painel_ro é opcional (guardado).
-- painel_rw não toca em dinheiro.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'wakecrm_motor') then
        raise exception 'Crie a role wakecrm_motor antes (WAKECRM_MOTOR_PASSWORD no ambiente de bun run db:migrate)';
    end if;

    grant select, insert, update on wakeclub.vendas, wakeclub.fechamentos, wakeclub.lancamentos_comissao
        to wakecrm_motor;

    if exists (select 1 from pg_roles where rolname = 'painel_ro') then
        grant select on wakeclub.vendas, wakeclub.fechamentos, wakeclub.lancamentos_comissao to painel_ro;
    end if;
end
$$;
