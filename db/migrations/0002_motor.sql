-- 0002 · motor próprio (WakeCRM fase 1).
--
-- Fila de webhooks, peso e comissão do vendedor, autoria da mensagem, motivo da
-- atribuição, respostas rápidas e a role do motor. Design: §4.1, §5.2, §6, §9.4.

-- Fila de entrada. O endpoint só grava o corpo bruto; o trabalhador do motor
-- processa depois, em sequência estrita por `chave_ordem`.
create table if not exists webhook_eventos (
    id                    bigserial primary key,
    origem                text not null,
    recebido_em           timestamptz not null default now(),
    corpo                 jsonb not null,
    status                text not null default 'pendente',
    tentativas            smallint not null default 0,
    proxima_tentativa_em  timestamptz not null default now(),
    processando_desde     timestamptz,
    erro                  text,
    chave_ordem           text,
    constraint webhook_eventos_origem_valida check (origem in ('evolution', 'vendas')),
    constraint webhook_eventos_status_valido check (status in
        ('pendente', 'processando', 'processado', 'falhou', 'ignorado'))
);

-- A fila só olha linhas abertas; o índice parcial fica pequeno mesmo com o
-- histórico crescendo.
create index if not exists webhook_eventos_abertos_idx
    on webhook_eventos (coalesce(chave_ordem, id::text), id)
    where status in ('pendente', 'processando');

create index if not exists webhook_eventos_falhas_idx
    on webhook_eventos (recebido_em desc)
    where status = 'falhou';

-- Peso 0 = pausado: não recebe lead novo, mantém os dele.
alter table usuarios add column if not exists peso smallint not null default 1;
alter table usuarios add column if not exists comissao_pct numeric(5, 2) not null default 0;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'usuarios_peso_valido'
                   and conrelid = 'wakeclub.usuarios'::regclass) then
        alter table usuarios add constraint usuarios_peso_valido check (peso between 0 and 10);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'usuarios_comissao_valida'
                   and conrelid = 'wakeclub.usuarios'::regclass) then
        alter table usuarios add constraint usuarios_comissao_valida
            check (comissao_pct between 0 and 100);
    end if;
end
$$;

-- Último motivo de atribuição. O histórico completo fica em eventos_automacao.
alter table leads add column if not exists atribuido_por text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'leads_atribuido_por_valido'
                   and conrelid = 'wakeclub.leads'::regclass) then
        alter table leads add constraint leads_atribuido_por_valido check (atribuido_por is null
            or atribuido_por in ('rodizio', 'mencao', 'desativacao', 'admin'));
    end if;
end
$$;

-- Autoria. null = mensagem legada (antes da virada), mostrada como "Equipe".
alter table mensagens add column if not exists usuario_id uuid references usuarios (id);
alter table mensagens add column if not exists enviada_por text;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'mensagens_enviada_por_valida'
                   and conrelid = 'wakeclub.mensagens'::regclass) then
        alter table mensagens add constraint mensagens_enviada_por_valida
            check (enviada_por is null or enviada_por in ('app', 'celular'));
    end if;
end
$$;

create index if not exists mensagens_usuario_idx
    on mensagens (usuario_id)
    where usuario_id is not null;

-- Autoria para os leitores do painel (v_mensagens_painel vive só em produção e não
-- tem estas colunas): os leitores fazem left join por mensagem_id.
create or replace view wakeclub.v_mensagens_autoria as
select m.id as mensagem_id, m.enviada_por, u.nome as autor_nome
  from wakeclub.mensagens m
  left join wakeclub.usuarios u on u.id = m.usuario_id
 where m.enviada_por is not null;

-- Respostas rápidas: digitar "/" no campo de envio lista estas.
create table if not exists respostas_rapidas (
    id            uuid primary key default gen_random_uuid(),
    atalho        text not null unique,
    texto         text not null,
    ativo         boolean not null default true,
    criado_em     timestamptz not null default now(),
    atualizado_em timestamptz not null default now(),
    constraint respostas_rapidas_atalho_valido check (atalho ~ '^[a-z0-9-]{2,30}$'),
    constraint respostas_rapidas_texto_valido check (length(texto) between 1 and 2000)
);

drop trigger if exists respostas_rapidas_atualizado_em on respostas_rapidas;
create trigger respostas_rapidas_atualizado_em
    before update on respostas_rapidas
    for each row execute function set_atualizado_em();

-- Grants. Quem cria as roles é o script (migrar.mjs para a wakecrm_motor,
-- painel-db.mjs para as do painel). Sem a wakecrm_motor a migração falha: registrada
-- sem grant, a role criada depois nunca receberia permissão e o webhook daria 42501.
-- As roles do painel continuam opcionais (guardadas por existência).
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'wakecrm_motor') then
        raise exception 'Crie a role wakecrm_motor antes (WAKECRM_MOTOR_PASSWORD no ambiente de bun run db:migrate)';
    end if;

    grant usage on schema wakeclub to wakecrm_motor;
    grant select, insert, update on
        wakeclub.leads,
        wakeclub.mensagens,
        wakeclub.followups,
        wakeclub.crm_outbox,
        wakeclub.eventos_automacao,
        wakeclub.instancia_eventos,
        wakeclub.instancia_estado,
        wakeclub.notificacoes,
        wakeclub.webhook_eventos
      to wakecrm_motor;
    grant select, insert, update, delete on wakeclub.respostas_rapidas to wakecrm_motor;
    grant select on wakeclub.push_subscriptions to wakecrm_motor;
    -- Só leitura: o toque vem do painel; o motor lê para casar o eco com o followup.
    grant select on wakeclub.followup_toques to wakecrm_motor;
    -- Por coluna: a senha nunca entra no alcance do motor.
    grant select (id, nome, usuario, papel, ativo, peso, comissao_pct)
        on wakeclub.usuarios to wakecrm_motor;
    grant update (peso, comissao_pct, ativo) on wakeclub.usuarios to wakecrm_motor;
    grant usage on all sequences in schema wakeclub to wakecrm_motor;
    -- v_followups_fila vive só em produção (e no stub do banco de teste); o push do
    -- motor lê a view para descartar aviso de follow-up que saiu da fila.
    if to_regclass('wakeclub.v_followups_fila') is not null then
        grant select on wakeclub.v_followups_fila to wakecrm_motor;
    end if;

    if exists (select 1 from pg_roles where rolname = 'painel_ro') then
        grant select on wakeclub.v_mensagens_autoria to painel_ro;
    end if;
    if exists (select 1 from pg_roles where rolname = 'painel_rw') then
        grant insert (peso, comissao_pct), update (peso, comissao_pct)
            on wakeclub.usuarios to painel_rw;
    end if;
end
$$;
