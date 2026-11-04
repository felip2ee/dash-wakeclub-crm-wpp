-- 0001 · base do schema wakeclub.
--
-- DDL do workflow n8n "db setup" (docs/n8n-legado/db-setup.json), na ordem dos nós,
-- SEM as views e SEM os backfills de dados: as views do painel vivem só em produção
-- (o db/painel-views.sql citado em documentos antigos não existe neste checkout) e os
-- backfills já rodaram lá. Tudo é idempotente, mas em produção não é no-op: os
-- `create ... if not exists` e `alter table ... add column if not exists` não fazem
-- nada, porém os `drop/create trigger` e o drop/add da constraint
-- `notificacoes_status_valido` tomam lock exclusivo breve nas tabelas envolvidas
-- (e o add da constraint revalida as linhas de notificacoes). Aplique fora de pico.

-- ---- Run Schema DDL ----
create schema if not exists wakeclub;



create table if not exists leads (
    id                    uuid primary key default gen_random_uuid(),
    telefone              text not null unique,
    nome                  text,
    etiqueta              text not null default 'Novo Lead',
    origem                text,
    interesse             text,
    objecao               text,
    data_agendada         timestamptz,
    resumo                text,
    temperatura           text,
    ultima_msg_lead_em    timestamptz,
    ultima_msg_equipe_em  timestamptz,
    qualificar_apos       timestamptz,
    n_toques              int not null default 0,
    opt_out               boolean not null default false,
    crm_externo_id        text,
    criado_em             timestamptz not null default now(),
    atualizado_em         timestamptz not null default now(),
    constraint leads_telefone_e164
        check (telefone ~ '^[+][1-9][0-9]{7,14}$'),
    constraint leads_etiqueta_valida check (etiqueta in (
        'Novo Lead',
        'Atendimento',
        'Link enviado',
        'Aguardando pagamento',
        'Agendado',
        'Aula realizada',
        'Follow-up',
        'Negociação encerrada'
    )),
    constraint leads_temperatura_valida
        check (temperatura is null or temperatura in ('quente', 'morno', 'frio')),
    constraint leads_n_toques_nao_negativo check (n_toques >= 0)
);

create index if not exists leads_data_agendada_idx
    on leads (data_agendada)
    where data_agendada is not null and opt_out = false;

create index if not exists leads_ultima_msg_lead_idx
    on leads (ultima_msg_lead_em)
    where opt_out = false;

create index if not exists leads_etiqueta_idx on leads (etiqueta);

create index if not exists leads_fila_qualificacao_idx
    on leads (qualificar_apos)
    where qualificar_apos is not null;

create table if not exists mensagens (
    id                uuid primary key default gen_random_uuid(),
    lead_id           uuid not null references leads (id) on delete cascade,
    direcao           text not null,
    texto             text,
    enviada_em        timestamptz not null,
    evolution_msg_id  text unique,
    criado_em         timestamptz not null default now(),
    constraint mensagens_direcao_valida
        check (direcao in ('lead', 'equipe', 'ia'))
);

create index if not exists mensagens_lead_recentes_idx
    on mensagens (lead_id, enviada_em desc);

create table if not exists followups (
    id                    uuid primary key default gen_random_uuid(),
    lead_id               uuid not null references leads (id) on delete cascade,
    agendado_para         timestamptz not null,
    tipo                  text not null,
    motivo                text,
    status                text not null default 'pendente',
    motivo_cancelamento   text,
    texto_enviado         text,
    criado_em             timestamptz not null default now(),
    atualizado_em         timestamptz not null default now(),
    enviado_em            timestamptz,
    constraint followups_tipo_valido check (tipo in (
        'reengajar',
        'lembrete_d1',
        'lembrete_dia',
        'pos_aula',
        'reativacao'
    )),
    constraint followups_status_valido
        check (status in ('pendente', 'enviando', 'enviado', 'cancelado', 'abortado'))
);

create unique index if not exists followups_um_pendente_por_lead
    on followups (lead_id)
    where status = 'pendente';

create index if not exists followups_fila_idx
    on followups (agendado_para)
    where status = 'pendente';

create index if not exists followups_status_criado_idx
    on followups (status, criado_em desc);

create table if not exists crm_outbox (
    id              bigserial primary key,
    lead_id         uuid not null references leads (id) on delete cascade,
    tipo            text not null,
    payload         jsonb not null default '{}'::jsonb,
    sincronizado    boolean not null default false,
    sincronizado_em timestamptz,
    criado_em       timestamptz not null default now()
);

create index if not exists crm_outbox_pendentes_idx
    on crm_outbox (criado_em)
    where sincronizado = false;

create table if not exists instancia_eventos (
    id             bigserial primary key,
    instancia      text not null,
    evento         text not null,
    estado         text,
    status_reason  int,
    detalhe        jsonb not null default '{}'::jsonb,
    ocorrido_em    timestamptz not null default now(),
    criado_em      timestamptz not null default now(),
    constraint instancia_eventos_estado_valido
        check (estado is null or estado in ('open', 'connecting', 'close'))
);

create index if not exists instancia_eventos_recentes_idx
    on instancia_eventos (instancia, ocorrido_em desc);

create table if not exists instancia_estado (
    instancia            text primary key,
    estado               text,
    status_reason        int,
    ultimo_evento_em     timestamptz,
    ultimo_heartbeat_em  timestamptz,
    heartbeat_ok         boolean,
    heartbeat_erro       text,
    conectado_desde      timestamptz,
    desconectado_desde   timestamptz,
    qr_pendente          boolean not null default false,
    qr_desde             timestamptz,
    qr_contador          int not null default 0,
    atualizado_em        timestamptz not null default now(),
    constraint instancia_estado_estado_valido
        check (estado is null or estado in ('open', 'connecting', 'close'))
);

alter table mensagens add column if not exists entrega_nivel smallint;
alter table mensagens add column if not exists entrega_em    timestamptz;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conname = 'mensagens_entrega_nivel_valido'
           and conrelid = 'wakeclub.mensagens'::regclass
    ) then
        alter table mensagens
            add constraint mensagens_entrega_nivel_valido
            check (entrega_nivel is null or entrega_nivel between 0 and 5);
    end if;
end
$$;

create index if not exists mensagens_entrega_idx
    on mensagens (enviada_em desc)
    where direcao in ('equipe', 'ia') and evolution_msg_id is not null;

create or replace function set_atualizado_em() returns trigger as $$
begin
    new.atualizado_em = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists leads_atualizado_em on leads;
create trigger leads_atualizado_em
    before update on leads
    for each row execute function set_atualizado_em();

drop trigger if exists followups_atualizado_em on followups;
create trigger followups_atualizado_em
    before update on followups
    for each row execute function set_atualizado_em();

drop trigger if exists instancia_estado_atualizado_em on instancia_estado;
create trigger instancia_estado_atualizado_em
    before update on instancia_estado
    for each row execute function set_atualizado_em();

-- ---- Run Schema Equipe ----
create table if not exists usuarios (
    id               uuid primary key default gen_random_uuid(),
    nome             text not null,
    usuario          text not null unique,
    senha_hash       text not null,
    papel            text not null default 'atendente',
    label_id         text,
    ativo            boolean not null default true,
    ultimo_acesso_em timestamptz,
    criado_em        timestamptz not null default now(),
    atualizado_em    timestamptz not null default now(),
    constraint usuarios_papel_valido
        check (papel in ('admin', 'atendente')),
    constraint usuarios_usuario_normalizado
        check (usuario = lower(usuario) and usuario !~ '\s' and length(usuario) >= 3)
);

create unique index if not exists usuarios_label_unica
    on usuarios (label_id)
    where label_id is not null;

create index if not exists usuarios_rodizio_idx
    on usuarios (papel)
    where ativo = true and label_id is not null;

create table if not exists sessoes (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid not null references usuarios (id) on delete cascade,
    token_hash  text not null unique,
    expira_em   timestamptz not null,
    revogada    boolean not null default false,
    user_agent  text,
    criado_em   timestamptz not null default now(),
    usado_em    timestamptz
);

create index if not exists sessoes_lookup_idx
    on sessoes (token_hash)
    where revogada = false;

create index if not exists sessoes_usuario_idx on sessoes (usuario_id);

create index if not exists sessoes_expiradas_idx on sessoes (expira_em);

create table if not exists push_subscriptions (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid not null references usuarios (id) on delete cascade,
    endpoint    text not null unique,
    p256dh      text not null,
    auth        text not null,
    apelido     text,
    falhas      int  not null default 0,
    ultimo_erro text,
    criado_em   timestamptz not null default now(),
    usado_em    timestamptz
);

create index if not exists push_subscriptions_usuario_idx
    on push_subscriptions (usuario_id);

create table if not exists notificacoes (
    id          bigserial primary key,
    usuario_id  uuid references usuarios (id) on delete cascade,
    tipo        text not null,
    titulo      text not null,
    corpo       text,
    url         text,
    status      text not null default 'pendente',
    erro        text,
    criado_em   timestamptz not null default now(),
    enviada_em  timestamptz,
    constraint notificacoes_status_valido
        check (status in ('pendente', 'enviando', 'enviada', 'falhou'))
);

create index if not exists notificacoes_fila_idx
    on notificacoes (criado_em)
    where status = 'pendente';

create index if not exists notificacoes_usuario_idx
    on notificacoes (usuario_id, criado_em desc);

create table if not exists followup_toques (
    id           uuid primary key default gen_random_uuid(),
    followup_id  uuid not null references followups (id) on delete cascade,
    usuario_id   uuid not null references usuarios (id) on delete cascade,
    aberto_em    timestamptz not null default now()
);

create index if not exists followup_toques_followup_idx
    on followup_toques (followup_id, aberto_em desc);

create table if not exists whatsapp_labels (
    label_id      text primary key,
    nome          text not null,
    cor           text,
    nao_atender   boolean not null default false,
    ativa         boolean not null default true,
    atualizado_em timestamptz not null default now()
);

alter table leads add column if not exists atendente_id uuid references usuarios (id);
alter table leads add column if not exists atribuido_em timestamptz;
alter table leads add column if not exists sem_atendimento boolean not null default false;
alter table leads add column if not exists sem_atendimento_motivo text;
alter table leads add column if not exists labels_whatsapp jsonb;

create index if not exists leads_distribuir_idx
    on leads (criado_em)
    where atendente_id is null and sem_atendimento = false and opt_out = false;

create index if not exists leads_atendente_idx
    on leads (atendente_id)
    where opt_out = false;

alter table followups add column if not exists texto_sugerido text;
alter table followups add column if not exists sugerido_em    timestamptz;

create index if not exists followups_a_redigir_idx
    on followups (agendado_para)
    where status = 'pendente' and texto_sugerido is null;

drop trigger if exists usuarios_atualizado_em on usuarios;
create trigger usuarios_atualizado_em
    before update on usuarios
    for each row execute function set_atualizado_em();

drop trigger if exists whatsapp_labels_atualizado_em on whatsapp_labels;
create trigger whatsapp_labels_atualizado_em
    before update on whatsapp_labels
    for each row execute function set_atualizado_em();

-- ---- Run Schema Audio ----
-- Tipo de midia: o normalizador do WF-01 ja calculava isto e descartava.
alter table mensagens add column if not exists tipo text;

-- Fila de transcricao, no mesmo espirito de `leads.qualificar_apos`: o estado
-- vive no Postgres, nunca numa execucao n8n suspensa.
--   pendente / transcrevendo / ok / falhou / sem_midia
-- `sem_midia` e terminal e sem culpa: a Evolution nao devolveu o audio porque
-- a midia expirou no WhatsApp. Nao adianta tentar de novo.
alter table mensagens add column if not exists transcricao_status     text;
alter table mensagens add column if not exists transcrito_em          timestamptz;
alter table mensagens add column if not exists transcricao_erro       text;
alter table mensagens add column if not exists transcricao_tentativas smallint not null default 0;

do $$
begin
    if not exists (
        select 1 from pg_constraint
         where conname = 'mensagens_transcricao_status_valido'
           and conrelid = 'wakeclub.mensagens'::regclass
    ) then
        alter table mensagens
            add constraint mensagens_transcricao_status_valido
            check (transcricao_status is null
                   or transcricao_status in ('pendente', 'transcrevendo',
                                             'ok', 'falhou', 'sem_midia'));
    end if;
end
$$;

-- A fila do WF-11. `evolution_msg_id not null` porque e a chave que o
-- getBase64FromMediaMessage exige: sem ela nao ha o que buscar.
create index if not exists mensagens_a_transcrever_idx
    on mensagens (enviada_em)
    where transcricao_status = 'pendente' and evolution_msg_id is not null;

-- Varredura de orfas: 'transcrevendo' preso e execucao que morreu no meio.
create index if not exists mensagens_transcrevendo_idx
    on mensagens (transcrito_em)
    where transcricao_status = 'transcrevendo';

-- ---- Run Schema Push ----
alter table notificacoes
    add column if not exists followup_id uuid references followups (id) on delete cascade;

create index if not exists notificacoes_followup_idx
    on notificacoes (followup_id)
    where followup_id is not null;

do $$
begin
    if exists (select 1 from pg_constraint
                where conname = 'notificacoes_status_valido'
                  and conrelid = 'wakeclub.notificacoes'::regclass) then
        alter table notificacoes drop constraint notificacoes_status_valido;
    end if;
    alter table notificacoes
        add constraint notificacoes_status_valido
        check (status in ('pendente','enviando','enviada','falhou','cancelada'));
end
$$;

-- ---- Run Schema Eventos ----
-- Auditoria explicita das decisoes das IAs (Qualificador, Porteiro, Redator).
-- O evento nasce NO MESMO COMANDO SQL da mudanca de negocio, a partir do CTE
-- que alterou a linha. Nao existe workflow generico de logging.
--
-- NUNCA guardar chain-of-thought, prompt, conversa ou texto_sugerido aqui.
-- `motivo` e justificativa curta sobre sinais observaveis; `metadados` e so
-- tecnico. O texto sugerido vive em followups.texto_sugerido.
--
-- Sem CHECK em agente/tipo_evento: vocabulario aberto, e um CHECK estourando
-- derrubaria a execucao inteira do WF-02, que grava no mesmo statement da
-- qualificacao.
create table if not exists eventos_automacao (
    id              bigserial primary key,
    lead_id         uuid not null references leads (id) on delete cascade,

    agente          text not null,
    tipo_evento     text not null,
    ocorrido_em     timestamptz not null default now(),

    gatilho         text,
    decisao         text,
    motivo          text,

    estado_anterior jsonb not null default '{}'::jsonb,
    estado_novo     jsonb not null default '{}'::jsonb,
    metadados       jsonb not null default '{}'::jsonb,

    entidade_tipo   text not null,
    entidade_id     uuid not null,

    origem_tipo     text not null default 'n8n',
    origem_id       text,
    correlacao_id   text not null,

    modelo          text,
    versao_prompt   text,

    criado_em       timestamptz not null default now(),

    constraint eventos_automacao_entidade_valida
        check (entidade_tipo in ('lead', 'followup'))
);

-- Segunda camada da idempotencia. A primeira, e a que de fato protege, e o
-- evento nascer do CTE que mudou o dado. Formato do correlacao_id:
-- '<wf>:<execucao>:<entidade_id>' - inclui a entidade porque uma execucao do
-- WF-02 processa varios leads.
create unique index if not exists eventos_automacao_unico
    on eventos_automacao (correlacao_id, tipo_evento, entidade_tipo, entidade_id);

create index if not exists eventos_automacao_lead_idx
    on eventos_automacao (lead_id, ocorrido_em desc);

create index if not exists eventos_automacao_recentes_idx
    on eventos_automacao (ocorrido_em desc);
