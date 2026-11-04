# Runbook da virada para o motor próprio

Corte do n8n (parado desde agosto) para o motor do WakeCRM. Siga os passos na ordem. A migração
`0003_virada.sql` é destrutiva de propósito: cancela todos os follow-ups pendentes antigos e zera
`qualificar_apos` de todos os leads, com evento de auditoria (`followup_cancelled` e
`qualification_cleared`). O `atendente_id` dos leads não muda. Por isso ela só roda no passo 9,
depois do backup do passo 8.

**A 0004 (IA e follow-up com aprovação) e a 0005 (vendas) entram junto com a 0003.** O
`db:migrate` sem `--ate` aplica 0003, 0004 e 0005 na mesma execução, em ordem. A 0004 e a 0005
não podem ir antes do corte: o passo 2 usa `--ate 0002` de propósito. Elas acrescentam colunas, tabelas e grants e ajustam constraints.

## Variáveis de ambiente novas

- `DATABASE_URL_MOTOR`: conexão do app com o banco, na role `wakecrm_motor`.
- `WAKECRM_MOTOR_PASSWORD`: senha da role `wakecrm_motor`. Usada pelo `db:migrate` para criar ou redefinir a role. Deve bater com a senha de `DATABASE_URL_MOTOR`.
- `MOTOR_ATIVO`: liga o motor (filas, distribuição, envio). Vazio = motor desligado. Só valor `1` liga.
- `WEBHOOK_EVOLUTION_SECRET`: segredo do webhook da Evolution Go.
- `WEBHOOK_VENDAS_SECRET`: segredo do webhook de vendas.
- `EVOLUTION_INSTANCIA`: nome da instância da Evolution Go que o motor atende.
- `OPENAI_API_KEY`: chave da OpenAI para qualificador, porteiro, redator e transcrição. Sem ela, essas tarefas ficam ociosas (log `ia.sem_chave`) e o resto do motor funciona. Opcional: `OPENAI_MODELO_TRANSCRICAO` (padrão `whisper-1`). Chave nova é custo: só com autorização.

`ADMIN_DATABASE_URL` (dono do banco) continua só para o `db:migrate`; o app nunca lê.

## Portões da Task 13 (antes de publicar o adaptador)

Revise o adaptador do Evolution Go contra estes pontos antes do passo 7:

- `enviar` lança `ErroEnvio` (`src/server/evolution/tipos.ts`) com `certeza`: `nao_saiu` só quando a Evolution recusou antes de entregar ao WhatsApp; `incerto` para timeout, 5xx ou resposta ilegível. Erro não tipado é tratado como `incerto`. O follow-up `incerto` é abortado e o vendedor confere; nunca é reenviado sozinho.
- O timeout do `enviar` é muito menor que 15 min (o órfão em `enviando` é abortado aos 15 min). A mensagem de erro não leva corpo da resposta nem segredo.
- Recálculo de `chave_ordem` (passo 10) com `adaptador.chaveDeOrdem(corpo)`.
- Confira nos eventos capturados se o webhook da Evolution manda a mídia em base64 ou só o identificador; isso define o `baixarMidia` e o limite de 25 MB.
- O formato do webhook de vendas é provisório (`src/server/vendas/normalizar.ts`): calibre com o payload real. Veja as suposições registradas em `decisoes` do evento `sale_received`.

## Pré-checagem do corte

Antes do passo 9, no banco de produção (a 0004 troca o conjunto de status de `followups`):

```sql
select count(*) from wakeclub.followups where status = 'enviando';
```

O resultado deve ser 0. Acima de 0 é estado inesperado (o status `enviando` é novo da 0004 e só
o motor de envio o grava): pare e investigue antes de migrar.

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
9. **Aplique o corte.** Rode a pré-checagem acima e depois `bun run db:migrate`; ela aplica a `0003_virada.sql`, a `0004_ia_followup.sql` e a `0005_vendas.sql`, cada uma numa transação. Confira no banco: nenhum follow-up `pendente`, nenhum `qualificar_apos` preenchido, eventos de auditoria criados, e que `configuracoes` tem `ritmo` (conservador) e `preco_hora` (360). Os triggers de `atualizado_em` disparam no update: os leads que tinham `qualificar_apos` (e os follow-ups cancelados) ficam com `atualizado_em` da hora do corte.
10. **Recalcule a ordem dos capturados.** Os eventos capturados antes do adaptador entraram todos na chave única `'evolution'`. Antes de ligar o motor, recalcule `chave_ordem` dos eventos com `status = 'pendente'` e `chave_ordem = 'evolution'` usando `adaptador.chaveDeOrdem(corpo)`, para cada conversa voltar à sua fila.
11. **Ligue o motor.** Defina `MOTOR_ATIVO=1` e reinicie o serviço. Com `OPENAI_API_KEY` o qualificador (1 min), o redator (15 min) e a transcrição (1 min) passam a rodar; o envio de aprovados (1 min) depende do adaptador. Confira o preço da hora e o modo de ritmo em Configurações. O preço da hora não gera evento de auditoria (a role `painel_rw` não escreve em `eventos_automacao`).
12. **Reprocesse os capturados.** Os eventos que chegaram nos passos 5 a 11 estão em `webhook_eventos` e são consumidos pela fila ao ligar o motor; os que falharem podem ser reprocessados pelo monitor.
13. **Confira monitor e saúde.** No painel admin, veja o monitor do motor (fila sem acúmulo, sem falhas novas), o estado da instância e o painel de IA (chave configurada, última execução de cada tarefa). Mande uma mensagem de teste e confirme que o lead aparece e é distribuído.

## Se algo der errado antes do passo 9

Desligue o webhook na Evolution Go e mantenha `MOTOR_ATIVO` vazio: nada foi destruído. Depois do
passo 9 não há volta automática; os follow-ups cancelados e o `qualificar_apos` zerado só voltam
pelo backup do passo 8.
