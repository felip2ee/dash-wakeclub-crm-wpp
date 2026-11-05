-- 0008 · Pipeline por etapa, sinal "parado", varredura e revisão do admin.
--
-- Spec: docs/superpowers/specs/2026-11-05-wakecrm-pipeline-e-followup-design.md §3, §4, §5,
-- §8, §9, §13. Idempotente: reaplicar por cima não muda nada. Não toca colunas origem_*
-- (essas são da 0007).
--
-- Mapeamento das etapas antigas (§3):
--   Novo Lead → Novo lead; Atendimento → Em atendimento; Link enviado e Aguardando pagamento
--   ficam; Agendado / Aula realizada → Aluno com horas se houver venda paga vinculada, senão
--   Em atendimento; Follow-up → etapa anterior do último stage_changed para Follow-up (mapeada
--   pela mesma tabela), senão Em atendimento; Negociação encerrada → Encerrado.

-- Colunas. saldo_horas null = desconhecido (nunca comprou pelo app ou horas sem registro).
alter table leads add column if not exists saldo_horas integer;
alter table leads add column if not exists proxima_aula_em timestamptz;
alter table leads add column if not exists ultima_aula_em timestamptz;
alter table leads add column if not exists ultimo_evento_app_em timestamptz;
alter table leads add column if not exists pagamento_pendente_desde timestamptz;
alter table leads add column if not exists app_user_id text;

alter table followups add column if not exists expira_em timestamptz;
alter table followups add column if not exists reconferido_em timestamptz;
alter table followups add column if not exists aula_em timestamptz;

-- A constraint antiga sai antes do update; a nova só entra depois dele.
alter table leads drop constraint if exists leads_etiqueta_valida;

with base as (
    select l.id,
           case when l.etiqueta = 'Follow-up' then
               (select e.estado_anterior ->> 'etiqueta'
                  from eventos_automacao e
                 where e.lead_id = l.id
                   and e.tipo_evento = 'stage_changed'
                   and e.estado_novo ->> 'etiqueta' = 'Follow-up'
                 order by e.ocorrido_em desc, e.id desc
                 limit 1)
           else l.etiqueta end as antiga
      from leads l
     where l.etiqueta in ('Novo Lead', 'Atendimento', 'Agendado', 'Aula realizada',
                          'Follow-up', 'Negociação encerrada')
),
pagas as (
    -- Uma venda paga com horas nulas deixa o saldo desconhecido.
    select v.lead_id,
           case when bool_or(v.horas is null) then null else sum(v.horas)::integer end as horas
      from vendas v
     where v.status = 'paga' and v.lead_id is not null
     group by v.lead_id
),
nova as (
    select b.id,
           p.horas,
           case
               when b.antiga = 'Novo Lead' then 'Novo lead'
               when b.antiga in ('Link enviado', 'Aguardando pagamento') then b.antiga
               when b.antiga in ('Agendado', 'Aula realizada') and p.lead_id is not null
                   then 'Aluno com horas'
               when b.antiga = 'Negociação encerrada' then 'Encerrado'
               else 'Em atendimento'
           end as etiqueta
      from base b
      left join pagas p on p.lead_id = b.id
)
update leads l
   set etiqueta = n.etiqueta,
       saldo_horas = case when n.etiqueta = 'Aluno com horas' then n.horas else l.saldo_horas end
  from nova n
 where n.id = l.id;

-- Quem já estava em "Aguardando pagamento" ganha o início da espera (última entrada na etapa ou,
-- sem histórico, a última alteração); sem isso a tarefa pagamento-pendente nunca o move.
update leads l
   set pagamento_pendente_desde = coalesce(
           (select max(e.ocorrido_em)
              from eventos_automacao e
             where e.lead_id = l.id
               and e.tipo_evento = 'stage_changed'
               and e.estado_novo ->> 'etiqueta' = 'Aguardando pagamento'),
           l.atualizado_em)
 where l.etiqueta = 'Aguardando pagamento' and l.pagamento_pendente_desde is null;

-- Aula futura já marcada pelo qualificador vira a próxima aula: o aluno não recebe "agende".
update leads
   set proxima_aula_em = data_agendada
 where proxima_aula_em is null and data_agendada > now();

-- Sugestões já abertas expiram às 19h59 (São Paulo) do dia em que foram sugeridas.
update followups
   set expira_em = ((sugerido_em at time zone 'America/Sao_Paulo')::date + time '19:59:59')
                   at time zone 'America/Sao_Paulo'
 where status = 'aguardando_aprovacao' and expira_em is null and sugerido_em is not null;

-- Constraints e índices.
alter table leads add constraint leads_etiqueta_valida check (etiqueta in (
    'Novo lead',
    'Em atendimento',
    'Link enviado',
    'Cadastrado',
    'Aguardando pagamento',
    'Aluno com horas',
    'Aluno sem horas',
    'Encerrado'
));
alter table leads alter column etiqueta set default 'Novo lead';

create unique index if not exists leads_app_user_id_unico
    on leads (app_user_id) where app_user_id is not null;

alter table followups drop constraint if exists followups_tipo_valido;
alter table followups add constraint followups_tipo_valido check (tipo in (
    'reengajar',
    'lembrete_d1',
    'lembrete_dia',
    'pos_aula',
    'reativacao',
    'parado'
));

-- Lembrete de aula convive com o follow-up aberto do lead; um por tipo.
drop index if exists followups_um_pendente_por_lead;
create unique index followups_um_pendente_por_lead
    on followups (lead_id)
    where status in ('pendente', 'aguardando_aprovacao', 'aprovado', 'enviando')
      and tipo not in ('lembrete_d1', 'lembrete_dia');

create unique index if not exists followups_um_lembrete_por_lead_tipo
    on followups (lead_id, tipo)
    where status in ('pendente', 'aguardando_aprovacao', 'aprovado', 'enviando')
      and tipo in ('lembrete_d1', 'lembrete_dia');

-- Tabelas.

-- Eventos USER_* do app já processados. unique (tipo, chave) é a idempotência (§13).
create table if not exists app_eventos (
    id          bigserial primary key,
    tipo        text not null,
    chave       text not null,
    lead_id     uuid references leads (id),
    ocorrido_em timestamptz,
    recebido_em timestamptz not null default now(),
    resultado   text,
    dados       jsonb not null default '{}'::jsonb,
    constraint app_eventos_tipo_valido check (tipo in (
        'cadastro', 'agendamento', 'aula', 'compra_pendente', 'compra_paga'
    )),
    constraint app_eventos_resultado_valido check (resultado in (
        'aplicado', 'hora_sem_saldo', 'saldo_desconhecido', 'sem_lead'
    )),
    constraint app_eventos_tipo_chave_unico unique (tipo, chave)
);

-- Revisão do admin sobre uma decisão humana. Única fonte de aprendizado dos prompts (§9).
create table if not exists followup_revisoes (
    id           uuid primary key default gen_random_uuid(),
    avaliacao_id uuid not null unique references followup_avaliacoes (id),
    admin_id     uuid not null references usuarios (id),
    concorda     boolean not null,
    observacao   text,
    criado_em    timestamptz not null default now()
);

-- Progresso da varredura sob demanda. Só uma rodando por vez.
create table if not exists varreduras (
    id           uuid primary key default gen_random_uuid(),
    iniciada_por uuid references usuarios (id),
    iniciada_em  timestamptz not null default now(),
    concluida_em timestamptz,
    status       text not null default 'rodando',
    total        integer not null default 0,
    analisados   integer not null default 0,
    sugeridos    integer not null default 0,
    barrados     integer not null default 0,
    erro         text,
    constraint varreduras_status_valido check (status in ('rodando', 'concluida', 'falhou'))
);

create unique index if not exists varreduras_uma_rodando
    on varreduras ((true)) where status = 'rodando';

insert into configuracoes (chave, valor) values
    ('prazos_parado', '{"em_atendimento_h":24,"link_enviado_h":24,"cadastrado_h":24,"aluno_com_horas_dias":7,"aluno_sem_horas_dias":15,"silencio_alunos_h":48,"pagamento_pendente_h":24}')
on conflict (chave) do nothing;

-- Grants. Sem a wakecrm_motor a migração falha alto; painel_ro é opcional (guardado).
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'wakecrm_motor') then
        raise exception 'Crie a role wakecrm_motor antes (WAKECRM_MOTOR_PASSWORD no ambiente de bun run db:migrate)';
    end if;

    grant select, insert, update on wakeclub.app_eventos, wakeclub.varreduras to wakecrm_motor;
    grant select, insert on wakeclub.followup_revisoes to wakecrm_motor;
    grant usage on sequence wakeclub.app_eventos_id_seq to wakecrm_motor;

    if exists (select 1 from pg_roles where rolname = 'painel_ro') then
        grant select on wakeclub.followup_revisoes to painel_ro;
    end if;
end
$$;
