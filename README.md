# WakeCRM · Wake Club

Painel interno do CRM da Wake Club: conversas, kanban, relatórios, fila de follow-ups
da equipe e indicadores operacionais. Hoje lê o CRM mantido pelos workflows n8n (parados
desde agosto de 2026); a próxima entrega transforma o app no próprio motor do CRM. Veja
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

Preencha as variáveis de `.env` e valide o acesso ao banco:

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
- [Instruções para agentes](AGENTS.md)
- [Setup do toolkit e evidência](docs/setup.md)
- [Design do WakeCRM, motor próprio](docs/superpowers/specs/2026-11-03-wakecrm-motor-proprio-design.md)

## Próxima entrega

Fase 1 do WakeCRM: o app recebe o webhook do Evolution Go numa fila no Postgres,
mostra e envia mensagens pela conversa e distribui leads por peso. Critério observável:
uma mensagem enviada ao número aparece na conversa do vendedor certo, e a resposta dele
chega ao WhatsApp do lead. Depende da instância Evolution Go apontada para o app.
