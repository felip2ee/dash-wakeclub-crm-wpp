# Preparação local

## Pré-requisitos

- Node.js 22.12 ou superior (o lint e o self-check rodam em Node).
- Bun. A imagem Docker usa 1.3.14; localmente qualquer 1.3.x funciona.
- Acesso a um PostgreSQL `wakeclub` com as roles do painel, só para telas com dados e
  `db:check`. Lint, tipos, testes e build não precisam de banco.

Se o Bun vem do `proto` e ele responde `proto::detect::failed`, não há versão fixada
para este diretório. Rode com a versão instalada na máquina, sem alterar configuração
global, por exemplo:

```sh
PROTO_BUN_VERSION=1.3.11 bun run check
```

## Primeira execução

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run dev
```

As variáveis estão descritas em `.env.example` e em `docs/architecture.md`
("Variáveis consumidas pelo dashboard"). Peça host e credenciais ao responsável pela
infraestrutura; nunca use a credencial dona do banco nem a do n8n em `DATABASE_URL`.

Variáveis do WakeCRM além das do painel:

- `DATABASE_URL_MOTOR` é **obrigatória para as telas**, mesmo com o motor desligado:
  Pipeline, conversas, Meus Leads, aprovação, vendas e dinheiro leem pela role
  `wakecrm_motor`. `WAKECRM_MOTOR_PASSWORD` só serve ao `db:migrate` e deve ser a mesma senha.
- `MOTOR_ATIVO` vazio em dev; `1` liga fila e tarefas.
- `WEBHOOK_EVOLUTION_SECRET`, `WEBHOOK_VENDAS_SECRET` e `EVOLUTION_INSTANCIA` (webhooks e saúde).
- `OPENAI_API_KEY` e `OPENAI_MODELO_TRANSCRICAO` (padrão `whisper-1`): sem a chave, as
  tarefas de IA ficam ociosas (log `ia.sem_chave`) e o resto funciona. Não coloque chave real
  em dev sem decidir: cada rodada de qualificação e redação custa dinheiro.

## Banco

- `bun run db:check` confere views e privilégios das roles `painel_ro` e `painel_rw`.
- `bun run db:apply` cria roles e views e exige `ADMIN_DATABASE_URL`. Só rode com
  autorização explícita para o ambiente alvo.
- `bun run db:migrate` aplica as migrações de `db/migrations/` (exige
  `ADMIN_DATABASE_URL`; `WAKECRM_MOTOR_PASSWORD` cria a role do motor, que a 0002, a 0004
  e a 0005 exigem). `bun run db:migrate -- --ate NNNN` para na migração NNNN; a 0003 é o
  corte da virada e só entra no momento do corte (`--ate 0002` antes disso). Como `db:migrate`
  aplica 0003, 0004 e 0005 juntas, a 0004 e a 0005 também esperam o corte (ver
  `docs/runbook-virada.md`). Só rode contra ambiente autorizado.
- Banco de teste descartável (precisa de Docker):

  ```sh
  bash scripts/banco-teste.sh   # Postgres 14, porta 54339, schema migrado (0001 a 0005)
  bun run test:db               # testes *.db.test.ts
  bun run test:db src/server/aprovacao.db.test.ts   # um arquivo
  ```

  `NOME=<contêiner> PORTA=<porta>` são opcionais no script. Para outro contêiner, use a mesma
  porta nos dois comandos: `NOME=meu-teste PORTA=54390 bash scripts/banco-teste.sh &&
  PORTA=54390 bun run test:db`. Dois agentes ou sessões em paralelo precisam de nomes e
  portas diferentes. Remova com `docker rm -f <contêiner>`.
- `MOTOR_ATIVO` fica vazio em dev: só `MOTOR_ATIVO=1` liga fila e tarefas, e dois
  motores no mesmo banco brigam. Não ligue contra o banco de produção.
- Não use produção como ambiente de teste.

## Verificar

```sh
bun run check   # lint, tipos, testes e self-check das regras; sem rede nem banco
bun run test:db # com o banco de teste no ar
bun run build
```

Resultado esperado: tudo com código de saída 0. O lint mostra avisos herdados
contados em `docs/quality.md`. `bun run check` não roda os testes de banco nem o build.

## Onde olhar

- Produto e estado: `PRODUCT.md`. Arquitetura, motor, dados e roles: `docs/architecture.md`.
- Interface e tokens: `docs/design.md` e `docs/ref/`. Virada: `docs/runbook-virada.md`.
- Planos com handoff (retomar trabalho): `docs/superpowers/plans/`.

## Agentes

Leia [AGENTS.md](../AGENTS.md). [CLAUDE.md](../CLAUDE.md) importa as mesmas instruções.
Skills locais, integrações e escopos estão em [setup.md](setup.md).

## Problemas conhecidos

- `proto::detect::failed` ao rodar `bun`: veja acima.
- Documentos antigos citam `../CLAUDE.md`, `../db/` e `../n8n/`, que não existem neste
  checkout.
