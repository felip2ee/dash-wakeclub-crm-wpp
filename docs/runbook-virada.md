# Runbook da virada para o motor próprio

Corte do n8n (parado desde agosto) para o motor do WakeCRM. Siga os passos na ordem. A migração
`0003_virada.sql` é destrutiva de propósito: cancela todos os follow-ups pendentes antigos e zera
`qualificar_apos` de todos os leads, com evento de auditoria (`followup_cancelled` e
`qualification_cleared`). O `atendente_id` dos leads não muda. Por isso ela só roda no passo 9,
depois do backup do passo 8.

**A 0004 (IA e follow-up com aprovação) e a 0005 (vendas) entram junto com a 0003.** O
`db:migrate` sem `--ate` aplica 0003, 0004 e 0005 na mesma execução, em ordem. A 0004 e a 0005
não podem ir antes do corte: o passo 2 usa `--ate 0002` de propósito. Elas acrescentam colunas, tabelas e grants e ajustam constraints.

## Caminho principal: o instalador

A virada sai pelo instalador de produção, como root no manager do Swarm:

```sh
bash <(curl -fsSL https://raw.githubusercontent.com/felip2ee/dash-wakeclub-crm-wpp/main/deploy/instalar.sh)
```

- **Cobre os passos 1 a 4, 8 e 9.** Confirme o passo 1 (n8n desligado) antes de rodar; numa
  execução o instalador migra, publica a imagem `ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest`
  na stack `wakecrm` com as variáveis da lista abaixo (`MOTOR_ATIVO` vazio, sem
  `OPENAI_API_KEY`), faz o backup (passo 8) e aplica 0003, 0004 e 0005 (passo 9, com a
  pré-checagem do corte). Por decisão do dono (04/11/2026), o corte entra junto, antes da
  captura: o n8n está parado desde agosto e a ordem antiga não protege nada.
- **Evolution API 2.3.7**, não Evolution Go (decisão do dono, 04/11/2026). O instalador
  detecta o serviço e grava `EVOLUTION_URL` e `EVOLUTION_API_KEY` para o adaptador.
- Pergunta só domínio, instância, admin do CRM e, se houver Portainer, usuário e senha dele
  (Enter pula e publica por `docker stack deploy`). Uma confirmação `s/N` antes de mexer.
- **Dados do SetupOrion.** Se existir `/root/dados_vps/`, o instalador lê só quatro arquivos
  (nunca `dados_evolution_go`) e o resumo mostra quais usou:
  - `dados_vps`: `Rede interna`, quando a rede comum a Postgres e Traefik é ambígua ou não aparece
    (continua exigindo rede attachable);
  - `dados_postgres`: `Senha` e `Usuario`, só se o serviço do Postgres não tiver `POSTGRES_PASSWORD`;
  - `dados_evolution`: `Global API Key`, se o serviço da Evolution não tiver a chave, e `BaseUrl`,
    se não houver serviço da Evolution;
  - `dados_portainer`: com ele, a API vai por `https://<Dominio do portainer>` com certificado
    verificado. O `Token` é o preferido (header `X-API-Key`, sem login); sem token, usa `Usuario`
    e `Senha`. Aí o instalador não pergunta credencial do Portainer.
  O resumo diz de onde veio cada senha e chave (serviço, Orion, salva ou digitada), sem mostrá-las.
- O backup fica em `/root/wakecrm/backups/`; o resumo final mostra o `scp` pronto para levá-lo
  para fora do servidor (passo 8). Credenciais em `/root/wakecrm/credenciais.env` (600).
- Rodar de novo é seguro: reaproveita as credenciais, pula migração aplicada (sem pendente,
  sem backup) e atualiza a stack para a imagem mais nova.
- Depois do instalador seguem os passos 5 a 7 e 10 a 13, com o adaptador da Evolution API.

**Se o instalador falhar:**

- Antes de mexer em qualquer coisa (só com migração pendente): se houver view ou FK fora do
  schema `wakeclub` que dependa dele, o instalador para e lista esses objetos. A volta
  automática faz `drop schema wakeclub cascade` e os apagaria sem trazer de volta. Nada foi
  alterado: remova ou mova esses objetos e rode de novo. Se a consulta falhar, ele também para.
- Também antes da confirmação: chave ou URL da Evolution, instância, certresolver ou entrypoint
  com `"`, `\` ou quebra de linha são recusados (quebrariam o arquivo da stack). Interativo,
  ele pergunta de novo; com `WAKECRM_SIM=1`, para.

- Migração ou views: ele restaura o backup sozinho, religa o CRM e para com a mensagem do erro.
  Corrija e rode de novo. Se a restauração também falhar, ele imprime o comando manual (pede a
  senha do superusuário) e o CRM fica parado até restaurar.
- Depois da migração e antes da stack publicada (admin, publicação ou interrupção): o CRM
  fica parado (0 réplicas) e o banco já está migrado. O instalador avisa e não religa sozinho.
  Saídas: rode o instalador de novo (publica a imagem nova), ou
  `docker service scale wakecrm_wakecrm=<réplicas de antes>` para voltar a imagem antiga, que
  pode não funcionar com o schema novo.
- Publicação: com `dados_portainer`, a API vai pelo domínio do Orion. Sem ele, vai por HTTPS na
  9443 (certificado autoassinado); só se a 9443 não responder usa HTTP na 9000, com aviso. O
  endpoint é o que o Portainer reporta com o mesmo Swarm do servidor (não o primeiro da lista);
  se nenhum bater, ou se a API falhar (por exemplo, stack `wakecrm` criada fora dele), cai para
  `docker stack deploy` com aviso.
- Conferência: espera a tarefa nova (da atualização recém-publicada) ficar Running; atualização
  pausada ou desfeita pelo Swarm sai com `✗` e o estado. Réplica parada, `/login` sem 200 ou webhook sem 404 saem com `✗` e o comando
  `docker service logs --tail 100 wakecrm_wakecrm`. Com a réplica de pé e `/login` falhando,
  confira o DNS do domínio e o certificado no log do Traefik. O banco não é restaurado nesse
  caso: o schema novo já está aplicado e o backup continua guardado.

## Variáveis de ambiente novas

- `DATABASE_URL_MOTOR`: conexão do app com o banco, na role `wakecrm_motor`.
- `WAKECRM_MOTOR_PASSWORD`: senha da role `wakecrm_motor`. Usada pelo `db:migrate` para criar ou redefinir a role. Deve bater com a senha de `DATABASE_URL_MOTOR`.
- `MOTOR_ATIVO`: liga o motor (filas, distribuição, envio). Vazio = motor desligado. Só valor `1` liga.
- `WEBHOOK_EVOLUTION_SECRET`: segredo do webhook da Evolution API.
- `WEBHOOK_VENDAS_SECRET`: segredo do webhook de vendas.
- `EVOLUTION_INSTANCIA`: nome da instância da Evolution API que o motor atende.
- `EVOLUTION_URL` e `EVOLUTION_API_KEY`: URL interna e `AUTHENTICATION_API_KEY` da Evolution API 2.3.7, gravadas pelo instalador. Hoje nada no app as lê (ficam para o adaptador).
- `OPENAI_API_KEY`: chave da OpenAI para qualificador, porteiro, redator e transcrição. Sem ela, essas tarefas ficam ociosas (log `ia.sem_chave`) e o resto do motor funciona. Opcional: `OPENAI_MODELO_TRANSCRICAO` (padrão `whisper-1`). Chave nova é custo: só com autorização.

`ADMIN_DATABASE_URL` (dono do banco) continua só para o `db:migrate`; o app nunca lê.

## Portões da Task 13 (antes de publicar o adaptador)

Revise o adaptador da Evolution API contra estes pontos antes do passo 7:

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

`POST /api/webhooks/evolution`. Use o header `x-webhook-secret` sempre que a Evolution API
permitir: o segredo na URL acaba em log de proxy e de acesso. Só se ela não aceitar header,
passe na query: `?token=<WEBHOOK_EVOLUTION_SECRET>`. O endpoint só enfileira o evento em
`webhook_eventos`; quem processa é o motor.

## Passos

1. **Confirme que o n8n está desligado.** Nenhum workflow ativo (WF-01, WF-02, envios) pode estar rodando, senão ele brigaria com o motor pelos mesmos leads e follow-ups.
2. **Migre até a 0002.** Com `ADMIN_DATABASE_URL` e `WAKECRM_MOTOR_PASSWORD` no ambiente, rode `bun run db:migrate -- --ate 0002`. Isso cria as tabelas do motor e a role `wakecrm_motor`, sem tocar nos dados antigos.
3. **Publique a imagem** do app com o código do motor.
4. **Configure as variáveis de ambiente** da lista acima no serviço publicado. Deixe `MOTOR_ATIVO` vazio por enquanto.
5. **Aponte a Evolution API** para `POST /api/webhooks/evolution` do app, com o segredo (header `x-webhook-secret`; `?token=` só se o header não for possível). Confira que a instância bate com `EVOLUTION_INSTANCIA`.
6. **Capture.** Com `MOTOR_ATIVO` vazio, o webhook recebe e grava os eventos em `webhook_eventos`, mas nada é processado. Espere chegarem eventos reais e confira que estão na tabela. Durante a captura o monitor do motor mostra esses eventos como "atrasados": é o esperado, porque ninguém os processa ainda.
7. **Publique a imagem que contém o adaptador da Evolution API**, escrito a partir dos eventos capturados no passo 6. Daqui em diante, só com o adaptador publicado: sem ele o motor não sabe ler os eventos nem enviar.
8. **Faça o backup do banco** imediatamente antes do corte: `pg_dump` completo do banco `wakeclub` com a `ADMIN_DATABASE_URL`, guardado fora do servidor. A `0003_virada.sql` é irreversível: só este backup desfaz o que ela muda.
9. **Aplique o corte.** Rode a pré-checagem acima e depois `bun run db:migrate`; ela aplica a `0003_virada.sql`, a `0004_ia_followup.sql` e a `0005_vendas.sql`, cada uma numa transação. Confira no banco: nenhum follow-up `pendente`, nenhum `qualificar_apos` preenchido, eventos de auditoria criados, e que `configuracoes` tem `ritmo` (conservador) e `preco_hora` (360). Os triggers de `atualizado_em` disparam no update: os leads que tinham `qualificar_apos` (e os follow-ups cancelados) ficam com `atualizado_em` da hora do corte.
10. **Recalcule a ordem dos capturados.** Os eventos capturados antes do adaptador entraram todos na chave única `'evolution'`. Antes de ligar o motor, recalcule `chave_ordem` dos eventos com `status = 'pendente'` e `chave_ordem = 'evolution'` usando `adaptador.chaveDeOrdem(corpo)`, para cada conversa voltar à sua fila.
11. **Ligue o motor.** Defina `MOTOR_ATIVO=1` e reinicie o serviço. Com `OPENAI_API_KEY` o qualificador (1 min), o redator (15 min) e a transcrição (1 min) passam a rodar; o envio de aprovados (1 min) depende do adaptador. Confira o preço da hora e o modo de ritmo em Configurações. O preço da hora não gera evento de auditoria (a role `painel_rw` não escreve em `eventos_automacao`).
12. **Reprocesse os capturados.** Os eventos que chegaram nos passos 5 a 11 estão em `webhook_eventos` e são consumidos pela fila ao ligar o motor; os que falharem podem ser reprocessados pelo monitor.
13. **Confira monitor e saúde.** No painel admin, veja o monitor do motor (fila sem acúmulo, sem falhas novas), o estado da instância e o painel de IA (chave configurada, última execução de cada tarefa). Mande uma mensagem de teste e confirme que o lead aparece e é distribuído.

## Se algo der errado antes do passo 9

Desligue o webhook na Evolution API e mantenha `MOTOR_ATIVO` vazio: nada foi destruído. Depois do
passo 9 não há volta automática; os follow-ups cancelados e o `qualificar_apos` zerado só voltam
pelo backup do passo 8.
