-- 0007 · Visão geral comercial: origem do lead e meta diária de vendas.
--
-- Spec: docs/superpowers/specs/2026-11-05-wakecrm-visao-comercial-design.md §4.1, §5, §8.
-- Idempotente: reaplicar por cima não muda nada.
-- Sem grants novos: os da 0002 (DML em leads para wakecrm_motor) e os da 0004 (select, update
-- em configuracoes para painel_rw; select para painel_ro) já cobrem.

-- Origem estruturada da primeira mensagem do lead (leads.origem segue como texto livre).
alter table leads add column if not exists origem_canal text;
alter table leads add column if not exists origem_app text;
alter table leads add column if not exists origem_anuncio_id text;
alter table leads add column if not exists origem_anuncio_titulo text;
alter table leads add column if not exists origem_detectada_em timestamptz;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'leads_origem_canal_valida'
                   and conrelid = 'wakeclub.leads'::regclass) then
        alter table leads add constraint leads_origem_canal_valida
            check (origem_canal in ('anuncio', 'link', 'busca', 'outro', 'direto'));
    end if;
    if not exists (select 1 from pg_constraint where conname = 'leads_origem_app_valida'
                   and conrelid = 'wakeclub.leads'::regclass) then
        alter table leads add constraint leads_origem_app_valida
            check (origem_app in ('instagram', 'facebook', 'whatsapp'));
    end if;
end
$$;

-- Meta de vendas por dia, editável em Configurações.
insert into configuracoes (chave, valor) values ('meta_vendas_dia', '2')
on conflict (chave) do nothing;
