-- 0004 · IA de volta e follow-up com aprovação (WakeCRM fases 2 e 3).
--
-- Horas estimadas do lead, configurações do motor (ritmo, preço da hora), o ciclo
-- de vida do follow-up com aprovação humana, a autoria do envio e as avaliações
-- que voltam ao prompt. Spec: docs/superpowers/specs/2026-11-04-wakecrm-fases-2-3-ia-followup.md
-- §4, §5, §7, §8. O runner (scripts/migrar.mjs) aplica uma vez só. Os `if not exists` só
-- protegem uma reaplicação antes da 0005; depois dela, reaplicar esta por cima devolve as
-- constraints de eventos_automacao (entidade e lead obrigatório) à versão da 0004.

-- Tamanho do pacote em horas, devolvido pelo qualificador. null = ainda não qualificado.
alter table leads add column if not exists horas_estimadas smallint;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'leads_horas_estimadas_valida'
                   and conrelid = 'wakeclub.leads'::regclass) then
        alter table leads add constraint leads_horas_estimadas_valida
            check (horas_estimadas between 1 and 8);
    end if;
end
$$;

-- Configurações do motor, uma linha por chave. A tela de setup do admin escreve.
create table if not exists configuracoes (
    chave         text primary key,
    valor         jsonb not null,
    atualizado_em timestamptz not null default now()
);

drop trigger if exists configuracoes_atualizado_em on configuracoes;
create trigger configuracoes_atualizado_em
    before update on configuracoes
    for each row execute function set_atualizado_em();

insert into configuracoes (chave, valor) values
    ('ritmo', '{"modo":"conservador"}'),
    ('preco_hora', '360')
on conflict (chave) do nothing;

-- Ciclo de vida: pendente → aguardando_aprovacao (texto pronto) → aprovado (humano
-- tocou Enviar) → enviando → enviado; ramos abortado, cancelado, expirado.
alter table followups drop constraint if exists followups_status_valido;
alter table followups add constraint followups_status_valido check (status in (
    'pendente', 'aguardando_aprovacao', 'aprovado', 'enviando',
    'enviado', 'cancelado', 'abortado', 'expirado'
));

alter table followups add column if not exists aprovado_em timestamptz;
alter table followups add column if not exists aprovado_por uuid references usuarios (id);
alter table followups add column if not exists erro_envio text;
alter table followups add column if not exists tentativas_envio smallint not null default 0;

-- Um follow-up em aberto por lead: enquanto não saiu (ou está saindo), não nasce outro.
drop index if exists followups_um_pendente_por_lead;
create unique index followups_um_pendente_por_lead
    on followups (lead_id)
    where status in ('pendente', 'aguardando_aprovacao', 'aprovado', 'enviando');

-- Mensagem gravada pelo envio de um follow-up (eco e registro).
alter table mensagens add column if not exists followup_id uuid references followups (id);

-- Decisão humana sobre cada texto sugerido. Alimenta o prompt do porteiro e do redator.
create table if not exists followup_avaliacoes (
    id             uuid primary key default gen_random_uuid(),
    followup_id    uuid not null references followups (id),
    usuario_id     uuid not null references usuarios (id),
    decisao        text not null,
    motivos        text[] not null default '{}',
    texto_livre    text,
    texto_original text,
    texto_enviado  text,
    criado_em      timestamptz not null default now(),
    constraint followup_avaliacoes_decisao_valida check (decisao in ('enviar', 'recusar'))
);

create index if not exists followup_avaliacoes_followup_idx
    on followup_avaliacoes (followup_id);
create index if not exists followup_avaliacoes_usuario_idx
    on followup_avaliacoes (usuario_id, criado_em desc);

-- Eventos de configuração (ritmo) não têm lead: entidade 'config' com o uuid fixo
-- 00000000-0000-0000-0000-000000000001. Só eles podem vir sem lead_id.
alter table eventos_automacao drop constraint if exists eventos_automacao_entidade_valida;
alter table eventos_automacao add constraint eventos_automacao_entidade_valida
    check (entidade_tipo in ('lead', 'followup', 'config'));
alter table eventos_automacao alter column lead_id drop not null;
alter table eventos_automacao drop constraint if exists eventos_automacao_lead_obrigatorio;
alter table eventos_automacao add constraint eventos_automacao_lead_obrigatorio
    check (lead_id is not null or entidade_tipo = 'config');

-- Grants. Mesmo padrão da 0002: sem a wakecrm_motor a migração falha alto; as roles
-- do painel continuam opcionais (guardadas por existência).
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'wakecrm_motor') then
        raise exception 'Crie a role wakecrm_motor antes (WAKECRM_MOTOR_PASSWORD no ambiente de bun run db:migrate)';
    end if;

    grant select, insert, update on wakeclub.configuracoes to wakecrm_motor;
    grant select, insert on wakeclub.followup_avaliacoes to wakecrm_motor;

    if exists (select 1 from pg_roles where rolname = 'painel_ro') then
        grant select on wakeclub.configuracoes to painel_ro;
    end if;
    if exists (select 1 from pg_roles where rolname = 'painel_rw') then
        grant select, update on wakeclub.configuracoes to painel_rw;
    end if;
end
$$;
