# Runbook da virada para o motor próprio

Corte do n8n (parado desde agosto) para o motor do WakeCRM. Siga os passos na ordem. A migração
`0003_virada.sql` é destrutiva de propósito: cancela todos os follow-ups pendentes antigos e zera
`qualificar_apos` de todos os leads, com evento de auditoria (`followup_cancelled` e
`qualification_cleared`). O `atendente_id` dos leads não muda. Por isso ela só roda no passo 9,
depois do backup do passo 8.

## Variáveis de ambiente novas

- `DATABASE_URL_MOTOR`: conexão do app com o banco, na role `wakecrm_motor`.
- `WAKECRM_MOTOR_PASSWORD`: senha da role `wakecrm_motor`. Usada pelo `db:migrate` para criar ou redefinir a role. Deve bater com a senha de `DATABASE_URL_MOTOR`.
- `MOTOR_ATIVO`: liga o motor (filas, distribuição, envio). Vazio = motor desligado. Só valor `1` liga.
- `WEBHOOK_EVOLUTION_SECRET`: segredo do webhook da Evolution Go.
- `WEBHOOK_VENDAS_SECRET`: segredo do webhook de vendas.
- `EVOLUTION_INSTANCIA`: nome da instância da Evolution Go que o motor atende.

`ADMIN_DATABASE_URL` (dono do banco) continua só para o `db:migrate`; o app nunca lê.

## Endpoint do webhook da Evolution

`POST /api/webhooks/evolution`. Use o header `x-webhook-secret` sempre que a Evolution Go
permitir: o segredo na URL acaba em log de proxy e de acesso. Só se ela não aceitar header,
passe na query: `?token=<WEBHOOK_EVOLUTION_SECRET>`. O endpoint só enfileira o evento em
`webhook_eventos`; quem processa é o motor.

## Passos

1. **Confirme que o n8n está desligado.** Nenhum workflow ativo (WF-01, WF-02, envios) pode estar rodando, senão ele brigaria com o motor pelos mesmos leads e follow-ups.
2. **Migre até a 0002.** Com `ADMIN_DATABASE_URL` e `WAKECRM_MOTOR_PASSWORD` no ambiente, rode `bun run db:migrate -- --ate 0002`. Isso cria as tabelas do motor e a role `wakecrm_motor`, sem tocar nos dados antigos.
3. **Publique a imagem** do app com o código do motor.
4. **Configure as variáveis de ambiente** da lista acima no serviço publicado. Deixe `MOTOR_ATIVO` vazio por enquanto.
5. **Aponte a Evolution Go** para `POST /api/webhooks/evolution` do app, com o segredo (header `x-webhook-secret`; `?token=` só se o header não for possível). Confira que a instância bate com `EVOLUTION_INSTANCIA`.
6. **Capture.** Com `MOTOR_ATIVO` vazio, o webhook recebe e grava os eventos em `webhook_eventos`, mas nada é processado. Espere chegarem eventos reais e confira que estão na tabela. Durante a captura o monitor do motor mostra esses eventos como "atrasados": é o esperado, porque ninguém os processa ainda.
7. **Publique a imagem que contém o adaptador do Evolution Go**, escrito a partir dos eventos capturados no passo 6. Daqui em diante, só com o adaptador publicado: sem ele o motor não sabe ler os eventos nem enviar.
8. **Faça o backup do banco** imediatamente antes do corte: `pg_dump` completo do banco `wakeclub` com a `ADMIN_DATABASE_URL`, guardado fora do servidor. A `0003_virada.sql` é irreversível: só este backup desfaz o que ela muda.
9. **Aplique o corte.** Rode `bun run db:migrate`; ela aplica a `0003_virada.sql` numa transação. Confira no banco: nenhum follow-up `pendente`, nenhum `qualificar_apos` preenchido, eventos de auditoria criados. Os triggers de `atualizado_em` disparam no update: os leads que tinham `qualificar_apos` (e os follow-ups cancelados) ficam com `atualizado_em` da hora do corte.
10. **Recalcule a ordem dos capturados.** Os eventos capturados antes do adaptador entraram todos na chave única `'evolution'`. Antes de ligar o motor, recalcule `chave_ordem` dos eventos com `status = 'pendente'` e `chave_ordem = 'evolution'` usando `adaptador.chaveDeOrdem(corpo)`, para cada conversa voltar à sua fila.
11. **Ligue o motor.** Defina `MOTOR_ATIVO=1` e reinicie o serviço.
12. **Reprocesse os capturados.** Os eventos que chegaram nos passos 5 a 11 estão em `webhook_eventos` e são consumidos pela fila ao ligar o motor; os que falharem podem ser reprocessados pelo monitor.
13. **Confira monitor e saúde.** No painel admin, veja o monitor do motor (fila sem acúmulo, sem falhas novas) e o estado da instância. Mande uma mensagem de teste e confirme que o lead aparece e é distribuído.

## Se algo der errado antes do passo 9

Desligue o webhook na Evolution Go e mantenha `MOTOR_ATIVO` vazio: nada foi destruído. Depois do
passo 9 não há volta automática; os follow-ups cancelados e o `qualificar_apos` zerado só voltam
pelo backup do passo 8.
