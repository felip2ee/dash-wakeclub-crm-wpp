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

## Banco

- `bun run db:check` confere views e privilégios das roles `painel_ro` e `painel_rw`.
- `bun run db:apply` cria roles e views e exige `ADMIN_DATABASE_URL`. Só rode com
  autorização explícita para o ambiente alvo.
- Não existe banco local de teste versionado; o schema base ainda vive no workflow n8n
  "db setup". A fase 1 do WakeCRM traz as migrações para o repositório.
- Não use produção como ambiente de teste.

## Verificar

```sh
bun run check   # lint, tipos, testes e self-check das regras; sem rede nem banco
bun run build
```

Resultado esperado: tudo com código de saída 0. O lint mostra avisos herdados
contados em `docs/quality.md`.

## Agentes

Leia [AGENTS.md](../AGENTS.md). [CLAUDE.md](../CLAUDE.md) importa as mesmas instruções.
Skills locais, integrações e escopos estão em [setup.md](setup.md).

## Problemas conhecidos

- `proto::detect::failed` ao rodar `bun`: veja acima.
- Documentos antigos citam `../CLAUDE.md`, `../db/` e `../n8n/`, que não existem neste
  checkout.
