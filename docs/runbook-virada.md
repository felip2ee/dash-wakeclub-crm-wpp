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
  na stack `wakecrm` com as variáveis da lista abaixo (`MOTOR_ATIVO` vazio, salvo decisão
  do dono; veja "Ligar e desligar o motor"), faz o backup (passo 8) e aplica 0003, 0004 e 0005 (passo 9, com a
  pré-checagem do corte). Por decisão do dono (04/11/2026), o corte entra junto, antes da
  captura: o n8n está parado desde agosto e a ordem antiga não protege nada.
- **Evolution API 2.3.7**, não Evolution Go (decisão do dono, 04/11/2026). O instalador
  detecta o serviço e grava `EVOLUTION_URL` e `EVOLUTION_API_KEY` para o adaptador.
- **Rede e nó.** Postgres e Traefik precisam compartilhar uma rede overlay, que **não precisa
  ser attachable** (a `NovaNet` do Orion não é): o CRM, serviço do Swarm, entra nela de qualquer
  jeito. Os contêineres temporários (backup, migração, views, admin, restauração) não entram na
  rede: usam a rede do contêiner do Postgres (`--network container:<id>`) e falam com o banco em
  `127.0.0.1`. Por isso o instalador roda **no nó onde o Postgres roda** (no Orion, nó único);
  sem contêiner do Postgres neste nó ele para antes de mexer em qualquer coisa. Com rede não
  attachable e Portainer sem domínio em `dados_portainer`, a API do Portainer fica fora de
  alcance e a stack sai por `docker stack deploy`, com aviso.
- Pergunta só domínio, instância, admin do CRM, a `OPENAI_API_KEY` quando não há nenhuma
  (entrada oculta; Enter pula e a transcrição e a IA ficam ociosas; a chave tem custo) e, se
  houver Portainer, usuário e senha dele (Enter pula e publica por `docker stack deploy`). Uma
  confirmação `s/N` antes de mexer.
- `EVOLUTION_URL` terminada em `/manager` ou `/manager/` é recusada: é o painel da Evolution, não
  a base da API (use, por exemplo, `http://evolution_evolution_api:8080`). Interativo, ele pergunta
  de novo; com `WAKECRM_SIM=1`, para antes de mexer.
- **Dados do SetupOrion.** Se existir `/root/dados_vps/`, o instalador lê só quatro arquivos
  (nunca `dados_evolution_go`) e o resumo mostra quais usou:
  - `dados_vps`: `Rede interna`, para desempatar quando Postgres e Traefik têm mais de uma rede
    em comum e não há escolha salva (sem rede comum o instalador para; a rede não precisa ser
    attachable);
  - `dados_postgres`: `Host`, para sugerir o serviço quando há mais de um Postgres e não há
    escolha salva; `Senha` e `Usuario`, só se o serviço do Postgres não tiver `POSTGRES_PASSWORD`;
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
- **Preserva o que foi mudado no Portainer.** Antes de preencher a stack, o instalador lê as
  variáveis do serviço `wakecrm_wakecrm` no ar (sem mostrá-las):
  - `OPENAI_API_KEY`, `OPENAI_MODELO_TRANSCRICAO`, `EVOLUTION_URL` e `EVOLUTION_API_KEY` sem valor
    no instalador adotam o da stack no ar e passam a ser gravadas em `credenciais.env`;
  - com valor diferente nos dois, o resumo mostra os dois (chaves mascaradas) e pergunta se usa
    o da stack no ar; o padrão é o do instalador. Com `WAKECRM_SIM=1` fica o do instalador, com
    aviso. Uma `EVOLUTION_URL` com `/manager` na stack no ar não é aceita;
  - `MOTOR_ATIVO` segue a stack no ar (ligado ou desligado no Portainer continua assim); sem
    stack, vale o salvo em `credenciais.env`.
- Depois do instalador seguem os passos 5 a 7 e 10 a 13, com o adaptador da Evolution API.

**Se o instalador falhar:**

- Antes de mexer em qualquer coisa (só com migração pendente): se houver objeto fora do
  schema `wakeclub` que dependa dele (view, FK, função com tipo dele, trigger que chama função
  dele, default com sequência dele ou qualquer outro que o Postgres registre em `pg_depend`), o
  instalador para e lista esses objetos. A volta automática faz `drop schema wakeclub cascade`
  e os apagaria sem trazer de volta. Nada foi alterado: remova ou mova esses objetos e rode de
  novo. Se a consulta falhar, ele também para. Função que só cita o `wakeclub` no corpo não
  conta: o cascade não a apaga.
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

## Ligar e desligar o motor

Ligar o motor é decisão explícita do dono: com `MOTOR_ATIVO=1` o CRM processa filas, distribui
leads e envia mensagens. Só ligue depois dos passos 1 a 10.

- **Pelo Portainer:** Stacks › `wakecrm` › Editor, troque `MOTOR_ATIVO=` por `MOTOR_ATIVO=1`
  (ou o contrário para desligar) e clique em Update the stack. O serviço reinicia com o valor novo.
- **Pelo instalador:** o resumo mostra o valor atual. Com o motor desligado e `EVOLUTION_URL`,
  `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCIA` completos, ele pergunta
  `Ligar o motor (MOTOR_ATIVO=1)? [s/N]`; Enter mantém desligado. O instalador não desliga um motor
  ligado: desligue pelo Portainer. Com `WAKECRM_SIM=1`, `WAKECRM_MOTOR_ATIVO=1` liga (para se o
  adaptador estiver incompleto), `WAKECRM_MOTOR_ATIVO=` desliga e, sem a variável, fica como está.

Rodar o instalador de novo não muda o `MOTOR_ATIVO` da stack no ar sem essa resposta.

## Variáveis de ambiente novas

- `DATABASE_URL_MOTOR`: conexão do app com o banco, na role `wakecrm_motor`.
- `WAKECRM_MOTOR_PASSWORD`: senha da role `wakecrm_motor`. Usada pelo `db:migrate` para criar ou redefinir a role. Deve bater com a senha de `DATABASE_URL_MOTOR`.
- `MOTOR_ATIVO`: liga o motor (filas, distribuição, envio). Vazio = motor desligado. Só valor `1` liga.
- `WEBHOOK_EVOLUTION_SECRET`: segredo do webhook da Evolution API.
- `WEBHOOK_VENDAS_SECRET`: segredo do webhook de vendas.
- `EVOLUTION_INSTANCIA`: nome da instância da Evolution API que o motor atende.
- `EVOLUTION_URL` e `EVOLUTION_API_KEY`: URL interna e `AUTHENTICATION_API_KEY` da Evolution API 2.3.7, gravadas pelo instalador. Com elas e `EVOLUTION_INSTANCIA`, o adaptador existe; faltando qualquer uma, o motor não processa eventos da Evolution nem envia.
- `OPENAI_API_KEY`: chave da OpenAI para qualificador, porteiro, redator e transcrição. Sem ela, essas tarefas ficam ociosas (log `ia.sem_chave`) e o resto do motor funciona. Opcional: `OPENAI_MODELO_TRANSCRICAO` (padrão `whisper-1`). Chave nova é custo: só com autorização.

`ADMIN_DATABASE_URL` (dono do banco) continua só para o `db:migrate`; o app nunca lê.

## Portões da Task 13 (antes de publicar o adaptador)

Revise o adaptador da Evolution API contra estes pontos antes do passo 7. Os marcados
estão no código (`src/server/evolution/`) com teste sem rede; os abertos dependem do
ambiente real.

- [x] `enviar` lança `ErroEnvio` (`src/server/evolution/tipos.ts`) com `certeza`: `nao_saiu` só quando a Evolution recusou antes de entregar ao WhatsApp (4xx exceto 408); `incerto` para timeout, rede, 5xx, 408 ou resposta sem `key.id`. Erro não tipado é tratado como `incerto`. O follow-up `incerto` é abortado e o vendedor confere; nunca é reenviado sozinho.
- [x] O timeout do `enviar` é muito menor que 15 min (30 s texto e localização, 120 s mídia; o órfão em `enviando` é abortado aos 15 min). A mensagem de erro não leva corpo da resposta nem segredo.
- [x] `adaptador.chaveDeOrdem(corpo)` existe para o recálculo de `chave_ordem` (passo 10): telefone E.164 da conversa, `instancia:<nome>` para eventos da instância.
- [x] `baixarMidia` busca a mídia sob demanda em `POST /chat/getBase64FromMediaMessage` (o evento capturado não traz base64); 400/404 viram `sem_midia`.
- [ ] Confirme com envio real: texto, imagem, vídeo, documento, áudio de voz (chega como PTT?) e localização, e que o eco volta com o mesmo `key.id` devolvido pelo envio.
- [ ] Confira nos eventos capturados o tamanho dos corpos frente ao limite de 25 MB (webhook com base64 ligado estoura).
- [ ] O formato do webhook de vendas é provisório (`src/server/vendas/normalizar.ts`): calibre com o payload real. Veja as suposições registradas em `decisoes` do evento `sale_received`.

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
11. **Ligue o motor.** Defina `MOTOR_ATIVO=1` (veja "Ligar e desligar o motor"). Com `OPENAI_API_KEY` o qualificador (1 min), o redator (15 min) e a transcrição (1 min) passam a rodar; o envio de aprovados (1 min) depende do adaptador. Confira o preço da hora e o modo de ritmo em Configurações. O preço da hora não gera evento de auditoria (a role `painel_rw` não escreve em `eventos_automacao`).
12. **Reprocesse os capturados.** Os eventos que chegaram nos passos 5 a 11 estão em `webhook_eventos` e são consumidos pela fila ao ligar o motor; os que falharem podem ser reprocessados pelo monitor.
13. **Confira monitor e saúde.** No painel admin, veja o monitor do motor (fila sem acúmulo, sem falhas novas), o estado da instância e o painel de IA (chave configurada, última execução de cada tarefa). Mande uma mensagem de teste e confirme que o lead aparece e é distribuído.

## Se algo der errado antes do passo 9

Desligue o webhook na Evolution API e mantenha `MOTOR_ATIVO` vazio: nada foi destruído. Depois do
passo 9 não há volta automática; os follow-ups cancelados e o `qualificar_apos` zerado só voltam
pelo backup do passo 8.
