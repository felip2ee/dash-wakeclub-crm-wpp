# WakeCRM · instalador de produção num comando

Data: 04/11/2026. Status: aprovado pelo dono em 04/11/2026.

## 1. Intenção

O dono quer colocar o WakeCRM em produção colando **um comando** no Termius (SSH como root
no servidor), no mesmo estilo do SetupOrion. O instalador faz o máximo sozinho, pergunta
só o que não consegue descobrir, acompanha cada passo e termina dizendo, sem ambiguidade,
se deu tudo certo ou onde parou.

Por que agora: as fases 1 a 4 estão em `main` (imagem pública no GHCR), não existe stack do
WakeCRM no servidor, e a Evolution precisa de um domínio público para mandar os webhooks
(captura dos eventos reais para o adaptador da Evolution API 2.3.7).

## 2. O servidor (o que o dono informou)

- Docker Swarm com Portainer, no padrão do SetupOrion (Orion Design).
- Traefik já rodando; a arquitetura cita a rede externa `NovaNet`.
- Postgres já rodando no Swarm, com o banco do CRM (`wakeclub`, schema `wakeclub`).
- Evolution API 2.3.7 já rodando e conectada ao número.
- n8n parado desde agosto. O painel antigo nunca foi publicado (não há stack).

O layout exato do Orion (nomes de serviço, arquivos de credenciais, nome do certresolver)
**não foi verificado**: o instalador detecta em vez de supor e pergunta quando não achar.

## 3. Objetivos

1. Um comando: `bash <(curl -fsSL https://raw.githubusercontent.com/felip2ee/dash-wakeclub-crm-wpp/main/deploy/instalar.sh)`.
2. **Descobrir sozinho**, a partir do Swarm:
   - serviço do Postgres, host interno e senha do superusuário (variáveis do serviço);
   - rede overlay do Traefik e nome do certresolver (argumentos/labels do serviço Traefik);
   - serviço da Evolution API 2.3.7 (não Evolution Go, decisão do dono de 04/11/2026), URL
     interna e `AUTHENTICATION_API_KEY`, gravadas como `EVOLUTION_URL` e `EVOLUTION_API_KEY`
     para o adaptador que vem depois (hoje nada no app lê essas duas);
   - credenciais do Portainer, se o Orion as deixou em disco.
3. **Perguntar só o resto**, com valor sugerido quando houver: domínio do CRM e nome da
   instância da Evolution. Confirmar o que foi detectado numa tela de resumo antes de mexer
   em qualquer coisa (uma confirmação só, `s/N`).
4. **Gerar sozinho** os segredos (`WEBHOOK_EVOLUTION_SECRET`, `WEBHOOK_VENDAS_SECRET`, senhas
   das roles `painel_ro`, `painel_rw`, `wakecrm_motor`, `PUSH_DISPATCH_SECRET`, chaves VAPID do
   push) com valores
   fortes, e guardá-los num arquivo só do root (`/root/wakecrm/credenciais.env`, `chmod 600`).
5. **Banco, com backup e volta automática:**
   1. checar que o banco `wakeclub` existe e a pré-checagem do runbook
      (`select count(*) from wakeclub.followups where status = 'enviando'` = 0, quando a tabela
      e o status existirem);
   2. `pg_dump` completo do banco `wakeclub` (formato custom), guardado em
      `/root/wakecrm/backups/wakeclub-AAAAMMDD-HHMMSS.dump`, conferido (`pg_restore --list`)
      antes de seguir;
   3. `db:migrate` (0001 a 0005, as já aplicadas são puladas) e `db:apply` (roles e views).
      **Inclui o corte destrutivo da 0003, decidido pelo dono (04/11/2026):** o n8n está parado
      desde agosto, os follow-ups pendentes estão velhos, e a 0004/0005 (que as telas novas
      exigem) só podem entrar junto com a 0003. Os eventos capturados ficam em
      `webhook_eventos` (0002) e não são tocados pela 0003. O runbook deixava o corte para
      depois da captura; com o motor desligado essa ordem não protege nada;
   4. **se qualquer passo de 5.3 falhar, restaurar o backup automaticamente** e parar com a
      mensagem do erro. O banco volta exatamente como estava antes do instalador. Se tudo der
      certo, o backup fica guardado e não é usado.
6. **Publicar a stack** `wakecrm` com a imagem `ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest`,
   labels do Traefik (HTTPS com o certresolver detectado), a rede detectada e as variáveis.
   `MOTOR_ATIVO` vazio e `OPENAI_API_KEY` ausente: o motor não liga e nada gera custo.
7. **Acompanhar e conferir:** esperar a réplica ficar `Running`, depois testar:
   - `https://<domínio>/login` responde 200 com certificado válido;
   - `POST /api/webhooks/evolution` sem segredo responde 404 (endpoint vivo e protegido).
8. **Resumo final:** URL do CRM, URLs dos webhooks (o cartão "Webhooks" de Configurações mostra
   os segredos), caminho do backup e do arquivo de credenciais, e o próximo passo (colar o
   webhook na Evolution). Em falha: qual passo, a mensagem, o comando para ver o log
   (`docker service logs wakecrm_wakecrm`) e se o banco foi restaurado.
9. **Execuções seguintes (atualização) [minha decisão]:** backup e restauração só acontecem
   se houver migração pendente. Quando houver, o serviço `wakecrm` é escalado para 0 antes do
   backup e volta depois, para nada gravar entre o dump e uma eventual restauração.
10. **Admin do CRM [minha decisão]:** se não houver usuário `admin` ativo em `usuarios`, o
    instalador pergunta nome, usuário e senha e cria o admin com o mesmo hash bcrypt do
    `auth.ts` (pelo contêiner do app). Se houver, lista os admins e oferece redefinir a senha
    de um deles (o dono não lembra as credenciais antigas); `N` não mexe.
11. **Backup fora do servidor [minha decisão]:** o runbook pede o dump guardado fora do
    servidor. O instalador não bloqueia por isso: a volta automática cobre falha de migração;
    no resumo final ele mostra o comando `scp` pronto para copiar o dump para o computador.
12. **Idempotente:** rodar de novo reaproveita `/root/wakecrm/credenciais.env` (não troca
   senhas nem segredos), pula migrações aplicadas e atualiza a stack para a imagem mais nova.
   Serve também para atualizar a versão.

## 4. Não-objetivos

- Ligar o motor (`MOTOR_ATIVO=1`), pôr chave da OpenAI ou apontar o webhook na Evolution:
  ficam para depois, com o adaptador da Evolution API pronto.
- Instalar Docker, Swarm, Traefik, Portainer ou Postgres.
- Webhook de vendas: só a URL fica disponível; a calibração do formato é outra tarefa.

## 5. Anti-objetivos (falhou mesmo que "funcione")

- Banco com o corte pela metade: migração aplicada em parte sem restauração.
- Segredo ou senha impresso na tela, em log do Docker ou na linha de comando de um processo
  (`ps`). Passar segredos por arquivo de ambiente ou stdin, nunca por argumento.
- Senha do superusuário do Postgres gravada no ambiente do serviço do WakeCRM: o app não
  lê `ADMIN_DATABASE_URL` (fica só no contêiner temporário de migração).
- Trocar senhas já em uso numa segunda execução (quebraria o app publicado).
- Mexer em outras stacks do Swarm.

## 6. Decisões de construção (chamadas minhas, revisáveis)

- **Script único em bash** (`deploy/instalar.sh`), dependências só do que o servidor Orion
  já tem (`docker`, `curl`, `openssl`). Nada instalado no host.
- **Migrações dentro de um contêiner temporário** da mesma imagem do app, na rede do
  Postgres: a imagem de runtime passa a incluir `db/` e `scripts/` (mudança no `Dockerfile`).
  `pg_dump`/`pg_restore` rodam num contêiner `postgres:<major do servidor>` temporário.
- **Deploy pela API do Portainer** quando houver credencial (a stack fica com controle total
  no Portainer, como as do Orion); senão, `docker stack deploy` (a stack aparece no Portainer
  com controle limitado).
- **Arquivo da stack versionado** em `deploy/wakecrm-stack.yml` (modelo com variáveis), que o
  instalador preenche. Também serve para quem quiser colar no Portainer à mão.
- **Saída do terminal** em português, com passos numerados, `✓`/`✗` e cores, como o resto dos
  scripts do projeto (`painel-db.mjs`).

## 7. Restrições do projeto que valem aqui

- Postgres 14; roles `painel_ro`, `painel_rw`, `wakecrm_motor`; `DATABASE_URL_RW` e
  `PAINEL_RW_PASSWORD` representam a mesma senha (AGENTS.md).
- Sessão com cookie `Secure` em produção: o app precisa rodar atrás de HTTPS.
- Runbook da virada (`docs/runbook-virada.md`) passa a apontar o instalador como caminho
  principal dos passos 1 a 4, 8 e 9; captura, adaptador e ligar o motor (5 a 7, 10 a 13)
  continuam depois, com o adaptador da Evolution API.
- Roles são do cluster e não entram no `pg_dump` do banco: a restauração desfaz dados e
  schema, não senhas de role.
- Nenhum outro sistema usa `painel_ro`/`painel_rw`: o painel antigo que as usava foi publicado
  e excluído, e as credenciais se perderam (dono, 04/11/2026). A primeira execução redefine
  essas senhas; o resumo de confirmação avisa.

## 8. Fica para o construtor

- Como detectar cada serviço de forma robusta (nome, imagem, labels) e o texto das perguntas.
- Estratégia exata de restauração (`pg_restore --clean --if-exists` no banco, ou recriar o
  banco) desde que o resultado seja o banco idêntico ao backup.
- Teste do script: `shellcheck` e uma execução contra um Swarm local de teste (Docker
  Desktop em modo Swarm com Postgres e Traefik mínimos) antes de entregar.
