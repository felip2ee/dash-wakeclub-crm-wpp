# Instalador de produção do WakeCRM · plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um comando colado no Termius (root, Swarm no padrão Orion) que detecta Postgres, Traefik, Evolution e Portainer, faz backup, migra com volta automática, cria/redefine o admin, publica a stack `wakecrm` e confere que está no ar.

**Architecture:** `deploy/instalar.sh` orquestra; funções puras e testáveis ficam em `deploy/lib.sh` (testadas por `deploy/lib.test.sh`); o trabalho de banco roda em contêineres temporários (imagem do app para migrar/aplicar/admin, `postgres:<major>` para dump/restore) na rede do Postgres; a stack sai do modelo `deploy/wakecrm-stack.yml`.

**Tech Stack:** bash 5, `docker` (Swarm), `curl`, `openssl`, `jq` só se existir (nunca obrigatório); scripts do projeto em Bun (`scripts/*.mjs`); `bcryptjs` custo 12.

**Spec:** `docs/superpowers/specs/2026-11-04-wakecrm-instalador-design.md` (aprovado em 04/11/2026).

## Global Constraints

- Comando: `bash <(curl -fsSL https://raw.githubusercontent.com/felip2ee/dash-wakeclub-crm-wpp/main/deploy/instalar.sh)`.
- Imagem: `ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest` (pública); stack `wakecrm`, serviço `wakecrm_wakecrm`, porta 3000.
- Credenciais: `/root/wakecrm/credenciais.env`, `chmod 600`, reaproveitado em toda execução seguinte (nunca troca senha ou segredo que já existe).
- Backups: `/root/wakecrm/backups/wakeclub-AAAAMMDD-HHMMSS.dump` (formato custom), conferido com `pg_restore --list`.
- Segredos gerados com `openssl rand -hex 32`. Nunca em argumento de processo, nunca impressos, nunca em log: passar por `--env-file` (arquivo temporário `chmod 600`, apagado com `trap`) ou stdin.
- `ADMIN_DATABASE_URL` (superusuário) nunca entra no ambiente do serviço `wakecrm`.
- `MOTOR_ATIVO` vazio e sem `OPENAI_API_KEY` na stack.
- Variáveis da stack: `NODE_ENV=production`, `DATABASE_URL`, `DATABASE_URL_RW`, `DATABASE_URL_MOTOR`, `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `PUSH_DISPATCH_SECRET`, `WEBHOOK_EVOLUTION_SECRET`, `WEBHOOK_VENDAS_SECRET`, `EVOLUTION_INSTANCIA`, `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `MOTOR_ATIVO=`.
- Postgres 14; roles `painel_ro`, `painel_rw`, `wakecrm_motor`; `DATABASE_URL_RW` e `PAINEL_RW_PASSWORD` com a mesma senha.
- Hash de senha: `bcryptjs`, custo 12 (igual a `src/server/admin.ts:212`).
- Textos de tela em português do Brasil; passos numerados com `✓`/`✗`/`!` e as cores de `scripts/painel-db.mjs`.
- Não mexer em nenhuma stack além de `wakecrm`.

## Review Focus

1. **Rede do Postgres não-attachable:** `docker run --network` falha em overlay sem `--attachable`. Esperado: o instalador detecta antes do backup e para com mensagem clara (nome da rede e o motivo), sem tocar no banco. Teste em Task 3 (`rede_attachable`) e checagem em Task 5.
2. **Falha no meio da 0004 com a 0003 já aplicada:** cada migração é uma transação, então a 0003 fica. Esperado: restauração automática deixa o schema `wakeclub` idêntico ao dump (inclusive sem as tabelas novas). Teste em Task 6 (restauração no banco de teste).
3. **Segunda execução:** `credenciais.env` existe. Esperado: nenhuma senha/segredo muda, nenhuma migração pendente ⇒ sem backup e sem parar o serviço, stack atualizada. Teste em Task 3 (`garantir_credencial` não sobrescreve) e Task 7 (execução dupla).
4. **Valor com caractere especial** (senha do Postgres com `@`, `:`, `/`, `#`): a URL de conexão precisa codificar a senha. Esperado: conecta. Teste em Task 3 (`url_postgres`).
5. **Domínio com DNS ainda não propagado ou certificado pendente:** o Let's Encrypt pode levar alguns minutos. Esperado: o teste HTTPS tenta por até 3 min antes de falhar e, ao falhar, diz que o app está de pé e o problema é DNS/certificado. Teste em Task 3 (`esperar_ate`).

---

### Task 1: imagem leva `db/` e `scripts/`

**Files:**
- Modify: `Dockerfile` (estágio `runtime`)

**Interfaces:**
- Produces: dentro da imagem, `/app/db/migrations/*.sql`, `/app/db/painel-views.sql`, `/app/scripts/migrar.mjs`, `/app/scripts/painel-db.mjs`, `/app/scripts/admin-crm.mjs` (Task 2), executáveis com `bun scripts/<x>.mjs` e `pg`/`bcryptjs` resolvidos de `node_modules` de produção.

- [ ] **Step 1:** no estágio `runtime`, depois do `COPY --from=build ... .output`, copiar `db/` e `scripts/` com `--chown=bun:bun`.
- [ ] **Step 2: verificar**
  Run: `docker build -t wakecrm-local . && docker run --rm wakecrm-local sh -c 'ls db/migrations db/painel-views.sql scripts/migrar.mjs scripts/painel-db.mjs && bun -e "import(\"pg\");import(\"bcryptjs\")"'`
  Expected: lista os 5 `.sql`, os dois scripts e sai com código 0.
- [ ] **Step 3: commit** `build(docker): imagem leva db/ e scripts/ para o instalador`

### Task 2: `scripts/admin-crm.mjs` (listar e definir admin)

**Files:**
- Create: `scripts/admin-crm.mjs`, `scripts/admin-crm.db.test.ts`
- Modify: `package.json` (script `db:admin`)

**Interfaces:**
- Produces (CLI, lê `ADMIN_DATABASE_URL` do ambiente):
  - `bun scripts/admin-crm.mjs listar` → imprime uma linha por admin ativo: `<usuario>\t<nome>`; nenhuma linha se não houver; código 0.
  - `bun scripts/admin-crm.mjs definir` → lê `ADMIN_NOME`, `ADMIN_USUARIO`, `ADMIN_SENHA` do ambiente; se o `usuario` existe, atualiza `senha_hash` (bcrypt 12), `papel='admin'`, `ativo=true`; senão insere com `papel='admin'`. Imprime `criado` ou `atualizado`. Senha com menos de 8 caracteres ou usuário fora da regra do banco (`lower`, sem espaço, ≥ 3) ⇒ código 1 e mensagem.
  - Exporta também `listarAdmins(db)` e `definirAdmin(db, {nome, usuario, senha})` para o teste.

- [ ] **Step 1: teste de banco** (`describe.skipIf(!process.env.TESTE_BANCO)`, padrão de `src/server/motor/banco-teste.ts`):
  - `definirAdmin` cria → `listarAdmins` contém o usuário; `bcrypt.compare(senha, senha_hash)` é `true`.
  - chamar de novo com outra senha → retorna `"atualizado"`, a senha antiga não confere mais, continua 1 linha.
  - senha `"curta"` → rejeita com erro.
- [ ] **Step 2:** rodar `bash scripts/banco-teste.sh` numa porta separada (`NOME=wakecrm-teste-admin PORTA=54391`) e `PORTA=54391 bun run test:db scripts/admin-crm.db.test.ts` → FAIL (arquivo não existe).
- [ ] **Step 3:** implementar; carregamento de env igual a `scripts/migrar.mjs`; casts SQL explícitos.
- [ ] **Step 4:** mesmo comando → PASS; remover o contêiner de teste.
- [ ] **Step 5: commit** `feat(scripts): admin-crm lista e define o admin do CRM`

### Task 3: `deploy/lib.sh` (funções puras) e `deploy/lib.test.sh`

**Files:**
- Create: `deploy/lib.sh`, `deploy/lib.test.sh`

**Interfaces (todas sem efeito colateral fora do que a assinatura diz):**
- `gerar_segredo` → stdout: 64 caracteres hex.
- `garantir_credencial ARQUIVO CHAVE VALOR_NOVO` → se `CHAVE=` já existe com valor não vazio no arquivo, não mexe; senão grava `CHAVE=VALOR_NOVO`. Cria o arquivo com `umask 077`.
- `ler_credencial ARQUIVO CHAVE` → stdout: valor (sem aspas), vazio se não houver.
- `valor_env_servico TEXTO CHAVE` → recebe a saída de `docker service inspect --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}'`; stdout: valor de `CHAVE` (primeiro `=` separa).
- `certresolver_traefik TEXTO` → recebe args/labels do Traefik, um por linha; stdout: nome do resolver de `--certificatesresolvers.<nome>.` ou de `tls.certresolver=<nome>`; vazio se não houver.
- `url_postgres USUARIO SENHA HOST PORTA BANCO` → stdout: `postgres://USUARIO:<senha percent-encoded>@HOST:PORTA/BANCO`.
- `render_stack MODELO ARQUIVO_ENV` → stdout: o modelo com cada `${CHAVE}` trocado pelo valor do arquivo; chave ausente ⇒ código 1 com o nome.
- `rede_attachable TEXTO` → recebe `docker network inspect --format '{{.Attachable}}'`; código 0 se `true`.
- `esperar_ate SEGUNDOS INTERVALO COMANDO...` → repete `COMANDO` até sucesso ou estourar; código do último resultado.
- `passo N TITULO`, `ok TEXTO`, `falha TEXTO`, `aviso TEXTO` → saída padronizada (cores só se `-t 1`).

- [ ] **Step 1: testes** em `deploy/lib.test.sh` (bash puro, `assert_eq`/`assert_falha` locais, sai 1 no primeiro erro):
  - `gerar_segredo` casa `^[0-9a-f]{64}$`; duas chamadas diferem.
  - `garantir_credencial` em arquivo novo grava; segunda chamada com outro valor mantém o primeiro; arquivo com modo `600`.
  - `valor_env_servico $'POSTGRES_PASSWORD=a=b\nX=1' POSTGRES_PASSWORD` → `a=b`.
  - `certresolver_traefik` com `--certificatesresolvers.letsencryptresolver.acme.email=x` → `letsencryptresolver`; com label `traefik.http.routers.a.tls.certresolver=le` → `le`; sem nada → vazio.
  - `url_postgres postgres 'p@ss:w/rd#1' postgres 5432 wakeclub` → `postgres://postgres:p%40ss%3Aw%2Frd%231@postgres:5432/wakeclub`.
  - `render_stack` troca `${DOMINIO}`; chave faltando → código 1 e o nome no stderr.
  - `rede_attachable true` → 0; `false` → 1.
  - `esperar_ate 2 1 false` → código ≠ 0 em ≤ 3 s; `esperar_ate 2 1 true` → 0.
- [ ] **Step 2:** `bash deploy/lib.test.sh` → FAIL (lib ausente).
- [ ] **Step 3:** implementar `deploy/lib.sh` (sem `jq`; `set -euo pipefail` só no instalador, não na lib).
- [ ] **Step 4:** `bash deploy/lib.test.sh` → todos ok; `docker run --rm -v "$PWD:/w" -w /w koalaman/shellcheck:stable deploy/lib.sh deploy/lib.test.sh` → sem achados.
- [ ] **Step 5: commit** `feat(deploy): funções do instalador com testes`

### Task 4: modelo da stack `deploy/wakecrm-stack.yml`

**Files:**
- Create: `deploy/wakecrm-stack.yml`

**Interfaces:**
- Consumes: `render_stack` (Task 3).
- Variáveis do modelo: `${DOMINIO}`, `${REDE}`, `${CERTRESOLVER}` e todas as da lista de Global Constraints.
- Produces: um serviço `wakecrm` (a stack `wakecrm` vira `wakecrm_wakecrm`), 1 réplica, `deploy.update_config.order: start-first`, `restart_policy.condition: on-failure`, rede externa `${REDE}`, labels Traefik: `traefik.enable=true`, router `wakecrm` com `Host(\`${DOMINIO}\`)`, entrypoint `websecure`, `tls.certresolver=${CERTRESOLVER}`, `loadbalancer.server.port=3000`, `traefik.docker.network=${REDE}`.

- [ ] **Step 1:** escrever o modelo; no topo, comentário de como usar à mão no Portainer.
- [ ] **Step 2: verificar** renderizando com um env de exemplo: `bash -c 'source deploy/lib.sh; render_stack deploy/wakecrm-stack.yml /tmp/x.env' | docker stack config -c -` (Docker ≥ 25) ou `docker compose -f - config` → válido, sem `${` restante.
- [ ] **Step 3: commit** `feat(deploy): modelo da stack wakecrm`

### Task 5: `deploy/instalar.sh` · detectar, perguntar, confirmar

**Files:**
- Create: `deploy/instalar.sh`

**Interfaces:**
- Consumes: `deploy/lib.sh` (baixado junto: o instalador, quando rodado via `curl`, baixa `lib.sh` e `wakecrm-stack.yml` da mesma ref para um diretório temporário; quando rodado do repo, usa os locais).
- Produces: variáveis de shell `PG_SERVICO`, `PG_HOST`, `PG_SENHA`, `PG_MAJOR`, `REDE`, `CERTRESOLVER`, `EVO_SERVICO`, `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `DOMINIO`, `EVOLUTION_INSTANCIA`, e o `credenciais.env` completo.

- [ ] **Step 1:** pré-condições: root, `docker info` com Swarm ativo e manager; falha ⇒ `✗` e sai.
- [ ] **Step 2:** detecção (ordem: imagem do serviço, depois nome): Postgres (`postgres:*` / `pgvector/*`), Traefik (`traefik:*`), Evolution (`atendai/evolution-api*` ou `evoapicloud/evolution-api*`), Portainer (`portainer/portainer*`). Mais de um candidato ⇒ menu numerado; nenhum ⇒ pergunta o valor. Senha e major do Postgres por `valor_env_servico` (`POSTGRES_PASSWORD`, tag da imagem). Checar `rede_attachable` da rede compartilhada entre Postgres e Traefik.
- [ ] **Step 3:** perguntas com sugestão entre colchetes: domínio (obrigatório, sem `http`), instância da Evolution (padrão `wakeclub`). Valores vindos de `credenciais.env` são reapresentados como padrão.
- [ ] **Step 4:** gerar o que falta com `garantir_credencial` (segredos, senhas das roles, VAPID via `bunx web-push generate-vapid-keys --json` dentro da imagem do app).
- [ ] **Step 5:** tela de resumo: tudo detectado/decidido (segredos mascarados), o aviso de que as senhas de `painel_ro`/`painel_rw` serão redefinidas, as migrações pendentes (Task 6, modo `--listar`) e se haverá backup. Uma confirmação `Continuar? [s/N]`.
- [ ] **Step 6: verificar** com `shellcheck` (como na Task 3) e `bash -n deploy/instalar.sh`.
- [ ] **Step 7: commit** `feat(deploy): instalador detecta o servidor e confirma`

### Task 6: banco · backup, migrar, aplicar, restaurar, admin

**Files:**
- Modify: `deploy/instalar.sh`, `scripts/migrar.mjs` (opção `--pendentes`)

**Interfaces:**
- `bun scripts/migrar.mjs --pendentes` → imprime um nome de arquivo pendente por linha, não aplica nada; código 0.
- Funções no instalador: `rodar_no_app ENVFILE CMD...` (contêiner temporário da imagem na `REDE`, `--env-file`), `rodar_no_pg ENVFILE CMD...` (`postgres:${PG_MAJOR}`, volume `/root/wakecrm/backups`), `fazer_backup` → caminho do dump, `restaurar BACKUP`, `aplicar_banco`.

- [ ] **Step 1: teste** em `scripts/migrar.db.test.ts` (skip sem `TESTE_BANCO`): banco migrado só até 0002 ⇒ `--pendentes` lista `0003_virada.sql`, `0004_ia_followup.sql`, `0005_vendas.sql` e a tabela `migracoes` não muda.
- [ ] **Step 2:** rodar → FAIL; implementar `--pendentes`; rodar → PASS.
- [ ] **Step 3:** no instalador: sem pendentes ⇒ pular backup e restauração. Com pendentes: escalar `wakecrm_wakecrm` para 0 se existir; `fazer_backup` (`pg_dump -Fc wakeclub`, conferir com `pg_restore --list`); `aplicar_banco` (`migrar.mjs` e depois `painel-db.mjs apply`, envs: `ADMIN_DATABASE_URL`, `WAKECRM_MOTOR_PASSWORD`, `PAINEL_RO_PASSWORD`, `PAINEL_RW_PASSWORD`, `DATABASE_URL`, `DATABASE_URL_RW`); falha ⇒ `restaurar`.
- [ ] **Step 4:** `restaurar BACKUP`: `drop schema wakeclub cascade` e `pg_restore -n wakeclub -d wakeclub BACKUP` (dono preservado, sem `--no-owner`); depois conferir que `wakeclub.migracoes` tem o mesmo conteúdo do backup; imprime "banco restaurado" ou, se a restauração falhar, `✗` com o caminho do dump e o comando manual.
- [ ] **Step 5:** admin: `admin-crm.mjs listar`; vazio ⇒ perguntar nome/usuário/senha (senha com `read -s`, duas vezes) e `definir`; com admins ⇒ listar e perguntar `Redefinir a senha de algum? [usuário/Enter pula]`.
- [ ] **Step 6: verificar** a restauração no banco de teste local: subir `banco-teste.sh` só até 0002 (`NOME=wakecrm-teste-inst PORTA=54392`), rodar `fazer_backup`, forçar falha (env `WAKECRM_FALHAR_MIGRACAO=0004` lido pelo instalador: aplica até 0003 e retorna erro), `restaurar` e conferir com `pg_dump -s` antes/depois que o schema é idêntico.
- [ ] **Step 7: commit** `feat(deploy): backup, migração com volta automática e admin`

### Task 7: publicar, conferir e resumir

**Files:**
- Modify: `deploy/instalar.sh`

- [ ] **Step 1:** publicar: com Portainer detectado, perguntar usuário/senha (Enter pula); com credencial, `POST /api/auth`, achar endpoint e `swarmID`, criar (`POST /api/stacks/create/swarm/string`) ou atualizar (`PUT /api/stacks/{id}`, `pullImage: true`) a stack `wakecrm` com o stack renderizado; sem credencial, `docker stack deploy --with-registry-auth=false -c - wakecrm` (o `-c -` lê do stdin). As chamadas à API saem de um contêiner `curlimages/curl` na `REDE` quando o Portainer não estiver exposto no host. Depois do deploy, `docker service scale wakecrm_wakecrm=1` se foi escalado a 0.
- [ ] **Step 2:** conferir: `esperar_ate 180 5` réplica `Running` (`docker service ps`); `esperar_ate 180 10 curl -fsS https://DOMINIO/login`; `curl -s -o /dev/null -w '%{http_code}' -X POST https://DOMINIO/api/webhooks/evolution` = `404`. Falha ⇒ `✗` com o comando `docker service logs --tail 100 wakecrm_wakecrm` e, se a réplica estiver de pé, o aviso de DNS/certificado.
- [ ] **Step 3:** resumo final: URL do CRM, URLs dos webhooks (sem segredo; "veja Configurações › Webhooks"), caminho do backup e o `scp root@<ip>:<dump> .` pronto, caminho do `credenciais.env`, próximo passo (apontar a Evolution).
- [ ] **Step 4: verificar ponta a ponta num Swarm local (precisa do OK do dono para `docker swarm init` no Mac):** Postgres 14 + Traefik com certificado padrão; domínio `wakecrm.localhost`; rodar o instalador duas vezes. Esperado: 1ª execução migra 0003–0005, cria admin, publica, `/login` 200 (`curl -k`); 2ª execução sem backup, sem perguntas novas, `credenciais.env` idêntico (`sha256sum` antes/depois). Ao fim, `docker stack rm` e `docker swarm leave --force`.
- [ ] **Step 5:** docs: `docs/runbook-virada.md` (instalador cobre passos 1–4, 8 e 9; Evolution API 2.3.7), `docs/architecture.md` (publicação, variáveis `EVOLUTION_URL`/`EVOLUTION_API_KEY`), `docs/onboarding.md` (como rodar `deploy/lib.test.sh`), `.env.example` (`EVOLUTION_URL`, `EVOLUTION_API_KEY`).
- [ ] **Step 6: commit** `feat(deploy): instalador publica, confere e resume`
