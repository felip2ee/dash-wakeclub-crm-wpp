-- Views de leitura do painel e GRANTs das roles painel_ro e painel_rw.
-- Aplicado por `bun run db:apply` (scripts/painel-db.mjs). Exportado do catálogo de produção
-- em 2026-11-04: antes vivia em ../db/, fora deste repositório. v_mensagens_autoria não está
-- aqui porque a migração 0002 é a dona dela. Toda view nova exposta ao painel precisa de GRANT.

create or replace view wakeclub.v_admin_labels_disponiveis as
 SELECT wl.label_id,
    wl.nome,
    wl.cor
   FROM wakeclub.whatsapp_labels wl
  WHERE wl.ativa = true AND wl.nao_atender = false AND NOT (EXISTS ( SELECT 1
           FROM wakeclub.usuarios u
          WHERE u.label_id = wl.label_id));

create or replace view wakeclub.v_conversas_painel as
 SELECT l.id,
    l.nome,
    l.telefone,
    l.etiqueta,
    COALESCE(o.ordem, 99) AS etiqueta_ordem,
    l.temperatura,
    l.origem,
    l.interesse,
    l.objecao,
    l.resumo,
    l.data_agendada,
    l.n_toques,
    l.opt_out,
    u.texto AS ultima_texto,
    u.direcao AS ultima_direcao,
    u.enviada_em AS ultima_enviada_em,
    c.total_mensagens,
    c.msgs_lead_sem_resposta,
    l.ultima_msg_lead_em,
    l.ultima_msg_equipe_em,
    GREATEST(l.ultima_msg_lead_em, l.ultima_msg_equipe_em) AS ultima_msg_em,
    l.ultima_msg_lead_em IS NOT NULL AND (l.ultima_msg_equipe_em IS NULL OR l.ultima_msg_lead_em > l.ultima_msg_equipe_em) AS aguardando_equipe,
        CASE
            WHEN l.ultima_msg_lead_em IS NOT NULL AND (l.ultima_msg_equipe_em IS NULL OR l.ultima_msg_lead_em > l.ultima_msg_equipe_em) THEN floor(EXTRACT(epoch FROM now() - l.ultima_msg_lead_em) / 3600::numeric)::integer
            ELSE NULL::integer
        END AS horas_esperando,
    f.agendado_para AS followup_em,
    f.tipo AS followup_tipo,
    l.criado_em
   FROM wakeclub.leads l
     LEFT JOIN ( VALUES ('Novo lead'::text,1), ('Em atendimento'::text,2), ('Link enviado'::text,3), ('Cadastrado'::text,4), ('Aguardando pagamento'::text,5), ('Aluno com horas'::text,6), ('Aluno sem horas'::text,7), ('Encerrado'::text,8)) o(etiqueta, ordem) ON o.etiqueta = l.etiqueta
     LEFT JOIN LATERAL ( SELECT m.texto,
            m.direcao,
            m.enviada_em
           FROM wakeclub.mensagens m
          WHERE m.lead_id = l.id
          ORDER BY m.enviada_em DESC
         LIMIT 1) u ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS total_mensagens,
            count(*) FILTER (WHERE m.direcao = 'lead'::text AND m.enviada_em > COALESCE(l.ultima_msg_equipe_em, '-infinity'::timestamp with time zone))::integer AS msgs_lead_sem_resposta
           FROM wakeclub.mensagens m
          WHERE m.lead_id = l.id) c ON true
     LEFT JOIN LATERAL ( SELECT followups.agendado_para,
            followups.tipo
           FROM wakeclub.followups
          WHERE followups.lead_id = l.id AND followups.status = 'pendente'::text
          ORDER BY followups.agendado_para
         LIMIT 1) f ON true;

create or replace view wakeclub.v_eventos_automacao_painel as
 SELECT e.id,
    e.lead_id,
    l.nome AS lead_nome,
    l.telefone AS lead_telefone,
    e.agente,
    e.tipo_evento,
    e.ocorrido_em,
    e.gatilho,
    e.decisao,
    e.motivo,
    e.estado_anterior,
    e.estado_novo,
    e.metadados,
    e.entidade_tipo,
    e.entidade_id,
    e.origem_tipo,
    e.origem_id,
    e.correlacao_id,
    e.modelo,
    e.versao_prompt
   FROM wakeclub.eventos_automacao e
     JOIN wakeclub.leads l ON l.id = e.lead_id;

create or replace view wakeclub.v_followups_fila as
 SELECT f.id AS followup_id,
    f.lead_id,
    l.atendente_id,
    l.nome,
    l.telefone,
    l.etiqueta,
    l.temperatura,
    l.interesse,
    l.objecao,
    l.resumo,
    l.n_toques,
    l.data_agendada,
    l.ultima_msg_lead_em,
    l.ultima_msg_equipe_em,
    f.tipo,
    f.motivo,
    f.agendado_para,
    f.texto_sugerido,
    f.sugerido_em,
    f.agendado_para <= now() AS vencido,
    COALESCE(t.toques, 0) AS toques,
    t.ultimo_toque_em,
    COALESCE(t.toques, 0) > 0 AS ja_tocado,
    t.ultimo_toque_em IS NOT NULL AND l.ultima_msg_equipe_em > t.ultimo_toque_em AS tem_eco
   FROM wakeclub.followups f
     JOIN wakeclub.leads l ON l.id = f.lead_id
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS toques,
            max(ft.aberto_em) AS ultimo_toque_em
           FROM wakeclub.followup_toques ft
          WHERE ft.followup_id = f.id) t ON true
  WHERE f.status = 'pendente'::text AND f.texto_sugerido IS NOT NULL AND l.opt_out = false AND l.sem_atendimento = false;

create or replace view wakeclub.v_followups_painel as
 SELECT f.id,
    f.lead_id,
    l.nome,
    l.telefone,
    l.etiqueta,
    l.temperatura,
    f.agendado_para,
    f.tipo,
    f.motivo,
    f.status,
    f.motivo_cancelamento,
    f.texto_enviado,
    f.criado_em,
    f.atualizado_em,
    f.enviado_em,
    f.status = 'pendente'::text AND f.agendado_para < now() AS vencido,
    round(EXTRACT(epoch FROM f.agendado_para - now()) / 60::numeric)::integer AS minutos_ate_disparo
   FROM wakeclub.followups f
     JOIN wakeclub.leads l ON l.id = f.lead_id;

create or replace view wakeclub.v_leads_painel as
 SELECT l.id,
    l.nome,
    l.telefone,
    l.etiqueta,
    COALESCE(o.ordem, 99) AS etiqueta_ordem,
    l.temperatura,
    l.origem,
    l.interesse,
    l.objecao,
    l.resumo,
    l.data_agendada,
    l.n_toques,
    l.opt_out,
    l.atendente_id,
    a.nome AS atendente_nome,
    l.atribuido_em,
    l.sem_atendimento,
    l.sem_atendimento_motivo,
    l.ultima_msg_lead_em,
    l.ultima_msg_equipe_em,
    GREATEST(l.ultima_msg_lead_em, l.ultima_msg_equipe_em) AS ultima_msg_em,
    l.ultima_msg_lead_em IS NOT NULL AND (l.ultima_msg_equipe_em IS NULL OR l.ultima_msg_lead_em > l.ultima_msg_equipe_em) AS aguardando_equipe,
        CASE
            WHEN l.ultima_msg_lead_em IS NOT NULL AND (l.ultima_msg_equipe_em IS NULL OR l.ultima_msg_lead_em > l.ultima_msg_equipe_em) THEN floor(EXTRACT(epoch FROM now() - l.ultima_msg_lead_em) / 3600::numeric)::integer
            ELSE NULL::integer
        END AS horas_esperando,
    f.agendado_para AS followup_em,
    f.tipo AS followup_tipo,
    l.criado_em
   FROM wakeclub.leads l
     LEFT JOIN wakeclub.usuarios a ON a.id = l.atendente_id
     LEFT JOIN ( VALUES ('Novo lead'::text,1), ('Em atendimento'::text,2), ('Link enviado'::text,3), ('Cadastrado'::text,4), ('Aguardando pagamento'::text,5), ('Aluno com horas'::text,6), ('Aluno sem horas'::text,7), ('Encerrado'::text,8)) o(etiqueta, ordem) ON o.etiqueta = l.etiqueta
     LEFT JOIN LATERAL ( SELECT followups.agendado_para,
            followups.tipo
           FROM wakeclub.followups
          WHERE followups.lead_id = l.id AND followups.status = 'pendente'::text
          ORDER BY followups.agendado_para
         LIMIT 1) f ON true;

create or replace view wakeclub.v_mensagens_painel as
 SELECT m.id,
    m.lead_id,
    m.direcao,
    m.texto,
    m.enviada_em,
    m.entrega_nivel,
    m.entrega_em,
    m.evolution_msg_id,
    m.criado_em
   FROM wakeclub.mensagens m;

create or replace view wakeclub.v_relatorio_funil as
 SELECT e.etiqueta,
    e.ordem AS etiqueta_ordem,
    count(l.id)::integer AS total,
    count(l.id) FILTER (WHERE l.temperatura = 'quente'::text)::integer AS quente,
    count(l.id) FILTER (WHERE l.temperatura = 'morno'::text)::integer AS morno,
    count(l.id) FILTER (WHERE l.temperatura = 'frio'::text)::integer AS frio,
    count(l.id) FILTER (WHERE l.temperatura IS NULL)::integer AS sem_temperatura,
    count(l.id) FILTER (WHERE l.ultima_msg_lead_em IS NOT NULL AND (l.ultima_msg_equipe_em IS NULL OR l.ultima_msg_lead_em > l.ultima_msg_equipe_em))::integer AS aguardando_equipe
   FROM ( VALUES ('Novo lead'::text,1), ('Em atendimento'::text,2), ('Link enviado'::text,3), ('Cadastrado'::text,4), ('Aguardando pagamento'::text,5), ('Aluno com horas'::text,6), ('Aluno sem horas'::text,7), ('Encerrado'::text,8)) e(etiqueta, ordem)
     LEFT JOIN wakeclub.leads l ON l.etiqueta = e.etiqueta
  GROUP BY e.etiqueta, e.ordem;

create or replace view wakeclub.v_relatorio_resumo as
 SELECT (( SELECT count(*) AS count
           FROM wakeclub.leads))::integer AS total_leads,
    (( SELECT count(*) AS count
           FROM wakeclub.leads
          WHERE leads.opt_out))::integer AS leads_opt_out,
    (( SELECT count(*) AS count
           FROM wakeclub.leads
          WHERE GREATEST(leads.ultima_msg_lead_em, leads.ultima_msg_equipe_em) > (now() - '7 days'::interval)))::integer AS leads_ativos_7d,
    (( SELECT count(*) AS count
           FROM wakeclub.leads
          WHERE leads.ultima_msg_lead_em IS NOT NULL AND (leads.ultima_msg_equipe_em IS NULL OR leads.ultima_msg_lead_em > leads.ultima_msg_equipe_em) AND NOT leads.opt_out))::integer AS aguardando_equipe,
    ( SELECT round(avg(EXTRACT(epoch FROM now() - leads.ultima_msg_lead_em) / 3600::numeric), 1) AS round
           FROM wakeclub.leads
          WHERE leads.ultima_msg_lead_em IS NOT NULL AND (leads.ultima_msg_equipe_em IS NULL OR leads.ultima_msg_lead_em > leads.ultima_msg_equipe_em) AND NOT leads.opt_out) AS media_horas_espera,
    (( SELECT count(DISTINCT crm_outbox.lead_id) AS count
           FROM wakeclub.crm_outbox
          WHERE crm_outbox.tipo = 'qualificacao'::text))::integer AS leads_qualificados,
    (( SELECT count(*) AS count
           FROM wakeclub.crm_outbox
          WHERE crm_outbox.tipo = 'qualificacao'::text))::integer AS qualificacoes_total,
    (( SELECT count(*) AS count
           FROM wakeclub.crm_outbox
          WHERE crm_outbox.tipo = 'qualificacao'::text AND crm_outbox.criado_em > (now() - '24:00:00'::interval)))::integer AS qualificacoes_24h,
    ( SELECT max(crm_outbox.criado_em) AS max
           FROM wakeclub.crm_outbox
          WHERE crm_outbox.tipo = 'qualificacao'::text) AS ultima_qualificacao_em,
    (( SELECT count(*) AS count
           FROM wakeclub.leads
          WHERE leads.qualificar_apos IS NOT NULL))::integer AS fila_qualificacao,
    (( SELECT count(*) AS count
           FROM wakeclub.followups))::integer AS followups_total,
    (( SELECT count(*) AS count
           FROM wakeclub.followups
          WHERE followups.status = 'pendente'::text))::integer AS followups_pendentes,
    (( SELECT count(*) AS count
           FROM wakeclub.followups
          WHERE followups.status = 'pendente'::text AND followups.agendado_para < now()))::integer AS followups_vencidos,
    (( SELECT count(*) AS count
           FROM wakeclub.followups
          WHERE followups.status = 'enviado'::text))::integer AS followups_enviados,
    (( SELECT count(*) AS count
           FROM wakeclub.followups
          WHERE followups.status = 'cancelado'::text))::integer AS followups_cancelados,
    (( SELECT count(*) AS count
           FROM wakeclub.followups
          WHERE followups.status = 'abortado'::text))::integer AS followups_abortados,
    (( SELECT count(*) AS count
           FROM wakeclub.mensagens))::integer AS mensagens_total,
    (( SELECT count(*) AS count
           FROM wakeclub.mensagens
          WHERE mensagens.enviada_em > (now() - '24:00:00'::interval)))::integer AS mensagens_24h,
    ( SELECT max(mensagens.enviada_em) AS max
           FROM wakeclub.mensagens) AS ultima_mensagem_em;

create or replace view wakeclub.v_relatorio_volume_dia as
 SELECT d.dia::date AS dia,
    count(m.id) FILTER (WHERE m.direcao = 'lead'::text)::integer AS do_lead,
    count(m.id) FILTER (WHERE m.direcao = 'equipe'::text)::integer AS da_equipe,
    count(m.id) FILTER (WHERE m.direcao = 'ia'::text)::integer AS da_ia,
    count(m.id)::integer AS total
   FROM generate_series(((now() AT TIME ZONE 'America/Sao_Paulo'::text)::date - 29)::timestamp with time zone, (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date::timestamp with time zone, '1 day'::interval) d(dia)
     LEFT JOIN wakeclub.mensagens m ON (m.enviada_em AT TIME ZONE 'America/Sao_Paulo'::text)::date = d.dia::date
  GROUP BY d.dia
  ORDER BY d.dia;

create or replace view wakeclub.v_relatorio_wf02_dia as
 SELECT d.dia::date AS dia,
    (( SELECT count(*) AS count
           FROM wakeclub.crm_outbox o
          WHERE o.tipo = 'qualificacao'::text AND (o.criado_em AT TIME ZONE 'America/Sao_Paulo'::text)::date = d.dia::date))::integer AS qualificacoes,
    (( SELECT count(*) AS count
           FROM wakeclub.followups f
          WHERE (f.criado_em AT TIME ZONE 'America/Sao_Paulo'::text)::date = d.dia::date))::integer AS followups_criados,
    (( SELECT count(*) AS count
           FROM wakeclub.followups f
          WHERE f.status = 'cancelado'::text AND (f.atualizado_em AT TIME ZONE 'America/Sao_Paulo'::text)::date = d.dia::date))::integer AS followups_cancelados,
    (( SELECT count(*) AS count
           FROM wakeclub.followups f
          WHERE f.status = 'abortado'::text AND (f.atualizado_em AT TIME ZONE 'America/Sao_Paulo'::text)::date = d.dia::date))::integer AS followups_abortados,
    (( SELECT count(*) AS count
           FROM wakeclub.followups f
          WHERE f.enviado_em IS NOT NULL AND (f.enviado_em AT TIME ZONE 'America/Sao_Paulo'::text)::date = d.dia::date))::integer AS followups_enviados
   FROM generate_series(((now() AT TIME ZONE 'America/Sao_Paulo'::text)::date - 29)::timestamp with time zone, (now() AT TIME ZONE 'America/Sao_Paulo'::text)::date::timestamp with time zone, '1 day'::interval) d(dia)
  ORDER BY d.dia;

create or replace view wakeclub.v_saude_numero as
 WITH entrega AS (
         SELECT count(*) AS enviadas_24h,
            count(*) FILTER (WHERE mensagens.entrega_nivel >= 3) AS entregues_24h,
            count(*) FILTER (WHERE COALESCE(mensagens.entrega_nivel::integer, 0) < 3 AND mensagens.enviada_em < (now() - '00:30:00'::interval)) AS travadas_24h
           FROM wakeclub.mensagens
          WHERE (mensagens.direcao = ANY (ARRAY['equipe'::text, 'ia'::text])) AND mensagens.evolution_msg_id IS NOT NULL AND mensagens.enviada_em > (now() - '24:00:00'::interval)
        )
 SELECT e.instancia,
    e.estado,
    e.status_reason,
    e.ultimo_evento_em,
    e.ultimo_heartbeat_em,
    e.heartbeat_ok,
    e.heartbeat_erro,
    round(EXTRACT(epoch FROM now() - e.ultimo_heartbeat_em) / 60::numeric)::integer AS minutos_sem_heartbeat,
    e.conectado_desde,
    e.desconectado_desde,
    e.qr_pendente,
    e.qr_desde,
    e.qr_contador,
    x.enviadas_24h,
    x.entregues_24h,
    x.travadas_24h,
        CASE
            WHEN x.enviadas_24h > 0 THEN round(x.entregues_24h::numeric * 100.0 / x.enviadas_24h::numeric, 1)
            ELSE NULL::numeric
        END AS taxa_entrega_24h,
        CASE
            WHEN e.ultimo_heartbeat_em IS NULL THEN 'sem heartbeat'::text
            WHEN e.ultimo_heartbeat_em < (now() - '00:10:00'::interval) THEN 'evolution muda'::text
            WHEN e.heartbeat_ok IS FALSE THEN 'evolution respondendo erro'::text
            WHEN e.estado IS DISTINCT FROM 'open'::text THEN 'desconectado'::text
            WHEN e.qr_pendente THEN 'qr pendente'::text
            WHEN x.enviadas_24h >= 5 AND (x.travadas_24h * 2) > x.enviadas_24h THEN 'entrega travada'::text
            ELSE 'ok'::text
        END AS alerta
   FROM wakeclub.instancia_estado e
     CROSS JOIN entrega x;

create or replace view wakeclub.v_sessao_valida as
 SELECT s.id AS sessao_id,
    s.token_hash,
    s.expira_em,
    u.id AS usuario_id,
    u.nome,
    u.usuario,
    u.papel,
    u.label_id
   FROM wakeclub.sessoes s
     JOIN wakeclub.usuarios u ON u.id = s.usuario_id
  WHERE s.revogada = false AND s.expira_em > now() AND u.ativo = true;

create or replace view wakeclub.v_wf02_atividade as
 WITH q AS (
         SELECT o.id,
            o.lead_id,
            l.nome,
            l.telefone,
            o.criado_em AS qualificado_em,
            o.payload ->> 'etiqueta'::text AS etiqueta,
            o.payload ->> 'temperatura'::text AS temperatura,
            o.payload ->> 'interesse'::text AS interesse,
            o.payload ->> 'objecao'::text AS objecao,
            o.payload ->> 'resumo'::text AS resumo,
            o.payload ->> 'data_agendada'::text AS data_agendada,
            lag(o.payload ->> 'etiqueta'::text) OVER w AS etiqueta_anterior,
            lag(o.payload ->> 'temperatura'::text) OVER w AS temperatura_anterior,
            lag(o.payload ->> 'objecao'::text) OVER w AS objecao_anterior,
            lag(o.criado_em) OVER w AS qualificacao_anterior_em,
            lead(o.criado_em) OVER w AS proxima_qualificacao_em,
            row_number() OVER w AS n_qualificacao,
            count(*) OVER (PARTITION BY o.lead_id)::integer AS total_qualificacoes
           FROM wakeclub.crm_outbox o
             JOIN wakeclub.leads l ON l.id = o.lead_id
          WHERE o.tipo = 'qualificacao'::text
          WINDOW w AS (PARTITION BY o.lead_id ORDER BY o.criado_em, o.id)
        )
 SELECT q.id,
    q.lead_id,
    q.nome,
    q.telefone,
    q.qualificado_em,
    q.etiqueta,
    q.temperatura,
    q.interesse,
    q.objecao,
    q.resumo,
    q.data_agendada,
    q.etiqueta_anterior,
    q.temperatura_anterior,
    q.objecao_anterior,
    q.qualificacao_anterior_em,
    q.n_qualificacao::integer AS n_qualificacao,
    q.total_qualificacoes,
        CASE
            WHEN q.n_qualificacao > 1 THEN q.etiqueta_anterior IS DISTINCT FROM q.etiqueta
            ELSE NULL::boolean
        END AS mudou_etiqueta,
        CASE
            WHEN q.n_qualificacao > 1 THEN q.temperatura_anterior IS DISTINCT FROM q.temperatura
            ELSE NULL::boolean
        END AS mudou_temperatura,
    f.id IS NOT NULL AS gerou_followup,
    f.agendado_para AS followup_agendado_para,
    f.tipo AS followup_tipo,
    f.motivo AS followup_motivo,
    f.status AS followup_status
   FROM q
     LEFT JOIN LATERAL ( SELECT fu.id,
            fu.agendado_para,
            fu.tipo,
            fu.motivo,
            fu.status
           FROM wakeclub.followups fu
          WHERE fu.lead_id = q.lead_id AND fu.criado_em >= q.qualificado_em AND (q.proxima_qualificacao_em IS NULL OR fu.criado_em < q.proxima_qualificacao_em)
          ORDER BY fu.criado_em
         LIMIT 1) f ON true;

create or replace view wakeclub.v_wf02_motor as
 WITH qual AS (
         SELECT crm_outbox.lead_id,
            count(*)::integer AS vezes_qualificado,
            max(crm_outbox.criado_em) AS ultima_qualificacao_em
           FROM wakeclub.crm_outbox
          WHERE crm_outbox.tipo = 'qualificacao'::text
          GROUP BY crm_outbox.lead_id
        ), msg AS (
         SELECT mensagens.lead_id,
            count(*)::integer AS total_mensagens,
            max(mensagens.enviada_em) AS ultima_mensagem_em
           FROM wakeclub.mensagens
          GROUP BY mensagens.lead_id
        )
 SELECT l.id AS lead_id,
    l.nome,
    l.telefone,
    l.etiqueta,
    l.temperatura,
    l.opt_out,
    l.qualificar_apos,
        CASE
            WHEN l.qualificar_apos IS NOT NULL THEN round(EXTRACT(epoch FROM l.qualificar_apos - now()) / 60::numeric)::integer
            ELSE NULL::integer
        END AS minutos_para_vencer,
    COALESCE(qual.vezes_qualificado, 0) AS vezes_qualificado,
    qual.ultima_qualificacao_em,
    COALESCE(msg.total_mensagens, 0) AS total_mensagens,
    msg.ultima_mensagem_em,
        CASE
            WHEN l.opt_out THEN 'opt-out'::text
            WHEN l.qualificar_apos IS NULL AND COALESCE(msg.total_mensagens, 0) > 0 AND qual.lead_id IS NULL THEN 'orfao'::text
            WHEN l.qualificar_apos IS NULL THEN 'ok'::text
            WHEN l.qualificar_apos <= now() THEN 'vencido'::text
            WHEN l.qualificar_apos > (now() + '00:05:00'::interval) THEN 'suspeita de retry de falha'::text
            ELSE 'na fila'::text
        END AS situacao
   FROM wakeclub.leads l
     LEFT JOIN qual ON qual.lead_id = l.id
     LEFT JOIN msg ON msg.lead_id = l.id;

create or replace view wakeclub.v_admin_atendentes as
 SELECT u.id AS usuario_id,
    u.nome,
    u.usuario,
    u.ativo,
    u.ultimo_acesso_em,
    u.label_id,
    COALESCE(fila.na_fila, 0) AS na_fila,
    COALESCE(fila.vencidos, 0) AS vencidos,
    COALESCE(fila.parados_2h, 0) AS parados_2h,
    COALESCE(leads.ativos, 0) AS leads_ativos,
    COALESCE(s7.sugeridos, 0) AS sugeridos_7d,
    COALESCE(s7.tocados, 0) AS tocados_7d,
        CASE
            WHEN COALESCE(s7.sugeridos, 0) = 0 THEN NULL::numeric
            ELSE round(100.0 * s7.tocados::numeric / s7.sugeridos::numeric, 1)
        END AS taxa_toque_7d,
    s7.mediana_min_ate_toque
   FROM wakeclub.usuarios u
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS na_fila,
            count(*) FILTER (WHERE q.vencido)::integer AS vencidos,
            count(*) FILTER (WHERE q.vencido AND NOT q.ja_tocado AND q.sugerido_em < (now() - '02:00:00'::interval))::integer AS parados_2h
           FROM wakeclub.v_followups_fila q
          WHERE q.atendente_id = u.id) fila ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS ativos
           FROM wakeclub.leads l
          WHERE l.atendente_id = u.id AND l.opt_out = false AND l.etiqueta <> 'Encerrado'::text) leads ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS sugeridos,
            count(*) FILTER (WHERE t.aberto_em IS NOT NULL)::integer AS tocados,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY ((EXTRACT(epoch FROM t.aberto_em - f.sugerido_em) / 60::numeric)::double precision)) FILTER (WHERE t.aberto_em IS NOT NULL) AS mediana_min_ate_toque
           FROM wakeclub.followups f
             JOIN wakeclub.leads l ON l.id = f.lead_id
             LEFT JOIN LATERAL ( SELECT min(ft.aberto_em) AS aberto_em
                   FROM wakeclub.followup_toques ft
                  WHERE ft.followup_id = f.id) t ON true
          WHERE l.atendente_id = u.id AND f.sugerido_em > (now() - '7 days'::interval)) s7 ON true
  WHERE u.papel = 'atendente'::text;

create or replace view wakeclub.v_admin_resumo as
 SELECT ( SELECT count(*)::integer AS count
           FROM wakeclub.v_followups_fila
          WHERE v_followups_fila.vencido) AS fila_agora,
    ( SELECT count(*)::integer AS count
           FROM wakeclub.v_followups_fila
          WHERE v_followups_fila.vencido AND NOT v_followups_fila.ja_tocado AND v_followups_fila.sugerido_em < (now() - '02:00:00'::interval)) AS parados_2h,
    s.sugeridos_7d,
    s.tocados_7d,
        CASE
            WHEN s.sugeridos_7d = 0 THEN NULL::numeric
            ELSE round(100.0 * s.tocados_7d::numeric / s.sugeridos_7d::numeric, 1)
        END AS taxa_toque_7d,
    s.mediana_min_ate_toque,
    s.toque_sem_eco_7d,
    ( SELECT count(*)::integer AS count
           FROM wakeclub.followups
          WHERE followups.status = 'abortado'::text AND followups.atualizado_em > (now() - '7 days'::interval)) AS abortados_7d,
    ( SELECT count(*)::integer AS count
           FROM wakeclub.leads
          WHERE leads.sem_atendimento = true) AS sem_atendimento,
    ( SELECT count(*)::integer AS count
           FROM wakeclub.leads
          WHERE leads.atendente_id IS NULL AND leads.opt_out = false AND leads.sem_atendimento = false) AS sem_dona
   FROM ( SELECT count(*)::integer AS sugeridos_7d,
            count(*) FILTER (WHERE t.aberto_em IS NOT NULL)::integer AS tocados_7d,
            percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY ((EXTRACT(epoch FROM t.aberto_em - f.sugerido_em) / 60::numeric)::double precision)) FILTER (WHERE t.aberto_em IS NOT NULL) AS mediana_min_ate_toque,
            count(*) FILTER (WHERE t.aberto_em IS NOT NULL AND NOT (EXISTS ( SELECT 1
                   FROM wakeclub.mensagens m
                  WHERE m.lead_id = f.lead_id AND m.direcao = 'equipe'::text AND m.enviada_em >= t.aberto_em AND m.enviada_em <= (t.aberto_em + '00:30:00'::interval))))::integer AS toque_sem_eco_7d
           FROM wakeclub.followups f
             LEFT JOIN LATERAL ( SELECT min(ft.aberto_em) AS aberto_em
                   FROM wakeclub.followup_toques ft
                  WHERE ft.followup_id = f.id) t ON true
          WHERE f.sugerido_em > (now() - '7 days'::interval)) s;

grant INSERT on wakeclub.followup_toques to painel_rw;
grant DELETE on wakeclub.push_subscriptions to painel_rw;
grant INSERT on wakeclub.push_subscriptions to painel_rw;
grant SELECT on wakeclub.push_subscriptions to painel_rw;
grant UPDATE on wakeclub.push_subscriptions to painel_rw;
grant DELETE on wakeclub.sessoes to painel_rw;
grant INSERT on wakeclub.sessoes to painel_rw;
grant SELECT on wakeclub.sessoes to painel_rw;
grant UPDATE on wakeclub.sessoes to painel_rw;
grant SELECT on wakeclub.usuarios to painel_rw;
grant SELECT on wakeclub.v_admin_atendentes to painel_ro;
grant SELECT on wakeclub.v_admin_labels_disponiveis to painel_ro;
grant SELECT on wakeclub.v_admin_resumo to painel_ro;
grant SELECT on wakeclub.v_conversas_painel to painel_ro;
grant SELECT on wakeclub.v_eventos_automacao_painel to painel_ro;
grant SELECT on wakeclub.v_followups_fila to painel_ro;
grant SELECT on wakeclub.v_followups_painel to painel_ro;
grant SELECT on wakeclub.v_leads_painel to painel_ro;
grant SELECT on wakeclub.v_mensagens_painel to painel_ro;
grant SELECT on wakeclub.v_relatorio_funil to painel_ro;
grant SELECT on wakeclub.v_relatorio_resumo to painel_ro;
grant SELECT on wakeclub.v_relatorio_volume_dia to painel_ro;
grant SELECT on wakeclub.v_relatorio_wf02_dia to painel_ro;
grant SELECT on wakeclub.v_saude_numero to painel_ro;
grant SELECT on wakeclub.v_sessao_valida to painel_ro;
grant SELECT on wakeclub.v_wf02_atividade to painel_ro;
grant SELECT on wakeclub.v_wf02_motor to painel_ro;
grant SELECT (id) on wakeclub.leads to painel_rw;
grant SELECT (sem_atendimento) on wakeclub.leads to painel_rw;
grant UPDATE (sem_atendimento) on wakeclub.leads to painel_rw;
grant SELECT (sem_atendimento_motivo) on wakeclub.leads to painel_rw;
grant UPDATE (sem_atendimento_motivo) on wakeclub.leads to painel_rw;
grant UPDATE (ativo) on wakeclub.usuarios to painel_rw;
grant INSERT (label_id) on wakeclub.usuarios to painel_rw;
grant INSERT (nome) on wakeclub.usuarios to painel_rw;
grant INSERT (senha_hash) on wakeclub.usuarios to painel_rw;
grant UPDATE (ultimo_acesso_em) on wakeclub.usuarios to painel_rw;
grant INSERT (usuario) on wakeclub.usuarios to painel_rw;
