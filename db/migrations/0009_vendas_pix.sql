-- 0009 · Vendas diretas por Pix: comprovantes lidos do WhatsApp viram venda ou pergunta ao admin.
--
-- Spec: docs/superpowers/specs/2026-11-08-wakecrm-vendas-pix-design.md §10b. Idempotente:
-- reaplicar por cima não muda nada (nem a configuração venda_pix já preenchida).

-- Uma linha por mensagem analisada. A pergunta ("confirmar") não conta em faturado até o admin
-- decidir; o admin grava pelo pool do motor, sem grant novo para painel_rw.
create table if not exists comprovantes (
    id                uuid primary key default gen_random_uuid(),
    mensagem_id       uuid unique references mensagens (id),
    lead_id           uuid not null references leads (id),
    hash              text,
    e2e               text,
    status            text not null,
    tentativas        smallint not null default 0,
    leitura           jsonb,
    valor             numeric(12,2),
    pago_em           timestamptz,
    horas_sugeridas   integer,
    motivo            text,
    venda_id          uuid references vendas (id),
    venda_suspeita_id uuid references vendas (id),
    repetido_de       uuid references comprovantes (id),
    decidido_por      uuid references usuarios (id),
    decidido_em       timestamptz,
    criado_em         timestamptz not null default now(),
    atualizado_em     timestamptz not null default now(),
    constraint comprovantes_status_valido check (status in (
        'lendo', 'nao_e', 'registrado', 'confirmar', 'recusado', 'repetido', 'falhou'
    ))
);

create index if not exists comprovantes_confirmar_idx
    on comprovantes (status) where status = 'confirmar';
create index if not exists comprovantes_hash_idx on comprovantes (hash);
-- Repetição sem E2E: mesmo lead, mesmo valor, pagamento próximo.
create index if not exists comprovantes_lead_idx on comprovantes (lead_id, pago_em);
-- Um E2E vira no máximo uma venda registrada.
create unique index if not exists comprovantes_e2e_registrado_unico
    on comprovantes (e2e) where e2e is not null and status = 'registrado';

drop trigger if exists comprovantes_atualizado_em on comprovantes;
create trigger comprovantes_atualizado_em
    before update on comprovantes
    for each row execute function set_atualizado_em();

-- 'comprovante': venda registrada automaticamente pela leitura do comprovante.
alter table vendas drop constraint if exists vendas_vinculada_por_valida;
alter table vendas add constraint vendas_vinculada_por_valida
    check (vinculada_por in ('cpf', 'telefone', 'admin', 'comprovante'));

-- Eventos de comprovante podem vir sem lead_id, como os de venda.
alter table eventos_automacao drop constraint if exists eventos_automacao_entidade_valida;
alter table eventos_automacao add constraint eventos_automacao_entidade_valida
    check (entidade_tipo in ('lead', 'followup', 'config', 'venda', 'comprovante'));
alter table eventos_automacao drop constraint if exists eventos_automacao_lead_obrigatorio;
alter table eventos_automacao add constraint eventos_automacao_lead_obrigatorio
    check (lead_id is not null or entidade_tipo in ('config', 'venda', 'comprovante'));

-- Sem chave/CNPJ e preços configurados, nenhum comprovante é registrado sozinho.
insert into configuracoes (chave, valor) values
    ('venda_pix', '{"chave": null, "cnpj": null, "precos": {"1": null, "2": null, "4": null}}')
on conflict (chave) do nothing;

-- Grants. Sem a wakecrm_motor a migração falha alto. Os painéis não leem comprovantes
-- (podem ter nome e CPF de quem pagou): o admin lê pelo pool do motor.
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'wakecrm_motor') then
        raise exception 'Crie a role wakecrm_motor antes (WAKECRM_MOTOR_PASSWORD no ambiente de bun run db:migrate)';
    end if;

    grant select, insert, update on wakeclub.comprovantes to wakecrm_motor;
end
$$;
