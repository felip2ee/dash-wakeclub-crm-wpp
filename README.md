# WakeCRM · Wake Club

Painel interno e motor do CRM da Wake Club: o app recebe os webhooks do Evolution Go e do
sistema de vendas, mantém o CRM, distribui os leads, sugere follow-ups com IA (aprovados por
um humano antes de sair), mostra o funil em dinheiro e calcula a comissão. Substitui os
workflows n8n. As fases 1 a 4 estão implementadas localmente e **não publicadas**; ver
[PRODUCT.md](PRODUCT.md).

## Requisitos

- Node.js 22.12 ou superior
- Bun (a imagem usa 1.3.14)
- PostgreSQL acessível com as roles do painel

## Configuração local

```sh
bun install --frozen-lockfile
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Preencha as variáveis de `.env` (a role do motor, `DATABASE_URL_MOTOR`, é obrigatória para as
telas; `OPENAI_API_KEY` é opcional) e valide o acesso ao banco:

```sh
bun run db:check
```

Para preparar a role e as views do painel com uma credencial administrativa (só com
autorização para o ambiente alvo):

```sh
bun run db:apply
```

## Desenvolvimento

```sh
bun run dev
```

## Qualidade e build

```sh
bun run check   # lint + tipos + testes + self-check das regras locais
bun run build
# testes de banco (Docker): sobe um Postgres 14 descartável e roda *.db.test.ts
NOME=wakecrm-teste PORTA=54339 bash scripts/banco-teste.sh && PORTA=54339 bun run test:db
docker rm -f wakecrm-teste
```

Detalhes e o lint tipado em [docs/quality.md](docs/quality.md). O arquivo `.env`,
dependências e artefatos de build não são versionados.

## Imagem Docker

A branch `main` publica automaticamente a imagem no GitHub Container Registry:

```sh
docker pull ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest
docker run --rm -p 3000:3000 --env-file .env ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest
```

## Documentação

- [Produto e escopo](PRODUCT.md)
- [Preparação local](docs/onboarding.md)
- [Arquitetura e regras de dados](docs/architecture.md)
- [Design e acessibilidade](docs/design.md)
- [Checagens de qualidade](docs/quality.md)
- [Runbook da virada](docs/runbook-virada.md)
- [Referências visuais](docs/ref/README.md)
- [Planos e specs](docs/superpowers/) (cada plano termina com um handoff)
- [Instruções para agentes](AGENTS.md)
- [Setup do toolkit e evidência](docs/setup.md)
- [Design do WakeCRM, motor próprio](docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md)

## Estado e próximos passos

Falta capturar os eventos reais do Evolution Go (adaptador e envio real), calibrar o webhook
de vendas, configurar a `OPENAI_API_KEY` e fazer a virada pelo
[runbook](docs/runbook-virada.md). Lista completa em [PRODUCT.md](PRODUCT.md).
