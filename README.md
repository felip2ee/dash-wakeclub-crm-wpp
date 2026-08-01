# Wake Club Dashboard

Painel interno para acompanhamento do CRM da Wake Club, com inbox, kanban,
relatórios, templates e indicadores operacionais.

## Requisitos

- Node.js 22.12 ou superior
- Bun
- PostgreSQL acessível com uma conta de leitura

## Configuração local

```powershell
bun install
Copy-Item .env.example .env
```

Preencha as variáveis de `.env` e valide o acesso ao banco:

```powershell
bun run db:check
```

Para preparar a role e as views do painel com uma credencial administrativa:

```powershell
bun run db:apply
```

## Desenvolvimento

```powershell
bun run dev
```

## Qualidade e build

```powershell
bun run lint
bun run build
```

O arquivo `.env`, dependências e artefatos de build não são versionados.
