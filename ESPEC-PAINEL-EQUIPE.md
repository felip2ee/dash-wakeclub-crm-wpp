# Especificação · Painel da equipe (login, push, fila de followups, admin)

> **Para quem vai implementar:** este documento é auto-suficiente. Ele descreve o que
> construir dentro de `dashhboard/`, na ordem, com o SQL pronto, os arquivos a criar e o
> critério de aceite de cada fase. Você **não precisa** ler o resto do projeto para
> executá-lo, mas se quiser o _porquê_ das decisões, elas estão em `../CLAUDE.md` §15 e
> §16 — e o CLAUDE.md manda quando houver divergência de intenção.
>
> **Escrito em 03/08/2026.** Idioma do projeto: **português (BR)** — código, comentários,
> textos de tela e nomes de coluna.

---

## 0. O contexto em cinco parágrafos

A Wake Club é uma escola de wakeboard em Palmas. O atendimento acontece **no WhatsApp e é
100% humano** — a equipe conversa com o lead como sempre. Uma automação em n8n lê essas
conversas por trás (via Evolution API), mantém um CRM em Postgres preenchido sozinho, e
**escreve o texto dos followups**.

**A IA não envia nada para o cliente.** Ela escreve o texto e para. Quem manda é uma
atendente, que lê a sugestão no celular e toca num botão — o botão abre o WhatsApp
Business com o texto já digitado. Ela pode editar antes de mandar, e pode não mandar.

**Este painel é onde esse botão vive.** Hoje ele existe como tela de leitura sem login
(`/`, `/kanban`, `/wf02`, `/reports`). O que falta é: saber quem está olhando, mostrar
para cada atendente a fila dela, avisar por notificação quando tem trabalho, e dar ao
admin uma visão de como o time e a IA estão indo.

**O painel é ESPELHO.** Ele lê o CRM e não escreve nele. Quem escreve nos leads,
mensagens e followups é o n8n. Se o painel também escrevesse, os dois brigariam pelo
mesmo registro. Esta entrega abre **uma exceção nomeada e só ela**: uma segunda conexão
de banco que alcança apenas sessão, inscrição de push e o log de toques no botão.

**O que o botão registra é "abri", não "enviei".** A prova de que a mensagem saiu vem
por outro caminho (o eco da própria mensagem voltando pela Evolution para o n8n). Não
invente um estado "enviado" no painel — a distância entre um toque e esse eco é uma
métrica de produto, e apagá-la destrói a única medida que diz se os textos da IA prestam.

### As cinco regras invioláveis

1. **Nunca escrever em `leads`, `mensagens`, `followups` ou `crm_outbox`.** Nem UPDATE de
   etiqueta, nem marcar followup como enviado, nem arrastar card de kanban.
2. **Nunca chamar a Evolution API a partir do painel.** Quem fala com serviço externo é o
   n8n. O painel só fala com o Postgres (e recebe uma chamada do n8n para o push).
3. **`usuarios.senha_hash` nunca sai do servidor.** Não vai em view exposta ao
   `painel_ro`, não vai em resposta de API, não vai em log.
4. **Nada de segredo commitado.** Senhas, chaves VAPID e o segredo de push vivem no
   `.env` (gitignored) e no `.env.example` como placeholder.
5. **Toda tela nova precisa de GRANT explícito** na role do painel. Ver §Armadilhas.

---

## 1. O que já existe (não recriar)

**Stack:** TanStack Start (React 19) + Vite + Nitro, shadcn/ui, Tailwind v4,
TanStack Query, `pg`. Gerenciador: **bun**. Rodando em container (Docker/GHCR +
Portainer).

```
dashhboard/
├── src/
│   ├── routes/            # roteamento por arquivo. __root.tsx é o shell
│   │   ├── __root.tsx     index.tsx  kanban.tsx  wf02.tsx  reports.tsx  templates.tsx
│   ├── server/            # createServerFn — roda só no servidor
│   │   ├── db.ts          ← ÚNICO arquivo que toca `pg` e a DATABASE_URL
│   │   ├── leads.ts  conversas.ts  wf02.ts  relatorios.ts  saude.ts
│   ├── components/        # AppSidebar.tsx + components/ui (shadcn)
│   ├── lib/               # formato.ts (datas/números), utils.ts
│   ├── start.ts           # createStart + requestMiddleware (erro global)
│   └── server.ts          # entry do Nitro
├── scripts/painel-db.mjs  # bun run db:apply / db:check
└── vite.config.ts         # importProtection.client.excludeFiles ← ATENÇÃO (§Armadilhas)
```

**Convenções observadas no código atual — siga-as:**

- Comentário de cabeçalho em cada módulo de servidor explicando **por que** ele existe,
  não o que ele faz.
- SQL fica dentro do módulo em `src/server/`, nunca no componente.
- O servidor devolve **camelCase** para o front, mapeado à mão a partir do `snake_case` do
  Postgres (ver `src/server/saude.ts`).
- `numeric` do Postgres chega como **string** no driver `pg` — sempre `Number(...)`.
- Datas viram ISO string no servidor (`d.toISOString()`), nunca `Date` cru.
- Fuso de exibição: `America/Sao_Paulo`.

**O banco** (`wakeclub`, schema `wakeclub`, Postgres 14) já tem as tabelas do CRM e 11
views de leitura, e a role `painel_ro`. O DDL das tabelas de equipe está em
`../db/schema-equipe.sql` — **aplicado pelo n8n, não por este projeto**. Se as tabelas
`usuarios` / `sessoes` / `push_subscriptions` / `notificacoes` / `followup_toques` /
`whatsapp_labels` não existirem quando você começar, **pare e peça** para aplicarem — não
crie tabela a partir daqui.

---

## 2. O que construir

| Rota                    | Quem      | O quê                                                         |
| ----------------------- | --------- | ------------------------------------------------------------- |
| `/login`                | público   | usuário + senha                                               |
| `/followups`            | atendente | **a tela principal** — o que a IA escreveu para os leads dela |
| `/meus-leads`           | atendente | os leads dela, por etiqueta                                   |
| `/instalar`             | logado    | como colocar o app na Tela de Início + ligar as notificações  |
| `/admin`                | admin     | métricas do time e da IA                                      |
| `POST /api/push/enviar` | n8n       | entrega um push (segredo compartilhado)                       |

As telas que já existem (`/`, `/kanban`, `/wf02`, `/reports`) passam a exigir login e
ficam **só para admin** — são telas de operação inteira, de desktop.

**Ordem de implementação (cada fase entrega valor sozinha):**

```
A. Banco (role painel_rw + views novas)     ← bloqueia todo o resto
B. Login e sessão
C. PWA instalável
D. Push (depende de C — no iPhone só funciona instalado)
E. Tela /followups + o botão                ← o coração da entrega
F. /meus-leads
G. /admin
```

---

## 3. Fase A — Banco

### A1. A segunda role: `painel_rw`

Colar em `../db/painel-role.sql` (o script `db:apply` já roda esse arquivo).

```sql
-- ---------------------------------------------------------------------------
-- painel_rw · a exceção nomeada à regra de espelho
--
-- O painel continua sem escrever no fluxo: nada de leads, mensagens, followups
-- ou crm_outbox. Esta role alcança só o que é do próprio painel — sessão,
-- inscrição de push e o log de toque no botão.
--
-- SELECT em `usuarios` é necessário para o login (comparar o bcrypt). O hash
-- nunca sai do handler de login: não vai em view, nem em resposta, nem em log.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'painel_rw') then
    execute format('create role painel_rw login password %L', :'senha_rw');
  else
    execute format('alter role painel_rw password %L', :'senha_rw');
  end if;
end $$;

grant usage on schema wakeclub to painel_rw;

grant select                    on wakeclub.usuarios           to painel_rw;
grant update (ultimo_acesso_em) on wakeclub.usuarios           to painel_rw;
grant select, insert, update    on wakeclub.sessoes            to painel_rw;
grant select, insert, update, delete on wakeclub.push_subscriptions to painel_rw;
grant insert                    on wakeclub.followup_toques    to painel_rw;

-- Explicitamente NÃO concedido: leads, mensagens, followups, crm_outbox,
-- instancia_*, whatsapp_labels. Se precisar ler algo dali, leia pela painel_ro.
```

> O `:'senha_rw'` é placeholder — o `painel-db.mjs` passa parâmetros por
> `format()`/bind. **Parâmetro em posição que o Postgres não consegue inferir precisa de
> cast explícito** (`$1::text`); esse bug já aconteceu duas vezes neste projeto.

### A2. Views novas

Colar em `../db/painel-views.sql`, e **acrescentar cada nome à lista
`VIEWS_ESPERADAS` em `scripts/painel-db.mjs`** — senão o `db:check` não confere e uma
tela vai vir vazia sem explicação.

```sql
-- ---------------------------------------------------------------------------
-- v_sessao_valida · a leitura de toda requisição autenticada
--
-- Uma sessão só vale se não foi revogada, não expirou E a pessoa continua
-- ativa. `usuarios.ativo = false` é o botão de desligar: corta na hora, sem
-- depender de expiração e sem precisar caçar sessão para revogar.
--
-- Não expõe senha_hash. É lida pela painel_ro (é leitura pura).
-- ---------------------------------------------------------------------------
create or replace view v_sessao_valida as
select
    s.id            as sessao_id,
    s.token_hash,
    s.expira_em,
    u.id            as usuario_id,
    u.nome,
    u.usuario,
    u.papel,
    u.label_id
  from sessoes s
  join usuarios u on u.id = s.usuario_id
 where s.revogada = false
   and s.expira_em > now()
   and u.ativo = true;


-- ---------------------------------------------------------------------------
-- v_followups_fila · o que a atendente tem para mandar
--
-- Um followup entra aqui quando o WF-03 escreveu o texto e ele ainda não foi
-- resolvido. Note que `status` continua 'pendente' depois de redigido: isso é
-- de propósito e load-bearing no desenho do n8n (mantém o índice único de um
-- pendente por lead, e deixa o WF-01 cancelar este followup quando o eco da
-- mensagem voltar). Não invente status novo.
--
-- Filtros duros já aplicados aqui, para que nenhuma tela precise lembrar:
-- opt_out e sem_atendimento. Ver CLAUDE.md §7.1.
-- ---------------------------------------------------------------------------
create or replace view v_followups_fila as
select
    f.id                 as followup_id,
    f.lead_id,
    l.atendente_id,
    l.nome,
    l.telefone,
    l.etiqueta,
    l.temperatura,
    l.interesse,
    l.objecao,
    l.resumo,
    l.n_toques,
    l.data_agendada,
    l.ultima_msg_lead_em,
    l.ultima_msg_equipe_em,

    f.tipo,
    f.motivo,                       -- por que a IA agendou. Mostrar na tela.
    f.agendado_para,
    f.texto_sugerido,
    f.sugerido_em,

    (f.agendado_para <= now())                       as vencido,
    coalesce(t.toques, 0)                            as toques,
    t.ultimo_toque_em,
    (coalesce(t.toques, 0) > 0)                      as ja_tocado,

    -- Houve mensagem da equipe DEPOIS do toque? É a prova de envio (o eco).
    -- Sem isso, "abri e desisti" e "abri e mandei" seriam indistinguíveis.
    (t.ultimo_toque_em is not null
       and l.ultima_msg_equipe_em > t.ultimo_toque_em)  as tem_eco
  from followups f
  join leads l on l.id = f.lead_id
  left join lateral (
        select count(*)::int as toques, max(aberto_em) as ultimo_toque_em
          from followup_toques ft
         where ft.followup_id = f.id
  ) t on true
 where f.status = 'pendente'
   and f.texto_sugerido is not null
   and l.opt_out = false
   and l.sem_atendimento = false;


-- ---------------------------------------------------------------------------
-- v_admin_atendentes · uma linha por pessoa
--
-- Tudo aqui é POR LEAD ATRIBUÍDO, nunca por mensagem: o WhatsApp é um número
-- só e o banco não sabe quem digitou cada mensagem. Ranking de "quem responde
-- mais rápido" seria invenção — não construa.
-- ---------------------------------------------------------------------------
create or replace view v_admin_atendentes as
select
    u.id                as usuario_id,
    u.nome,
    u.usuario,
    u.ativo,
    u.ultimo_acesso_em,
    u.label_id,

    coalesce(fila.na_fila, 0)          as na_fila,
    coalesce(fila.vencidos, 0)         as vencidos,
    coalesce(fila.parados_2h, 0)       as parados_2h,
    coalesce(leads.ativos, 0)          as leads_ativos,

    coalesce(s7.sugeridos, 0)          as sugeridos_7d,
    coalesce(s7.tocados, 0)            as tocados_7d,
    case when coalesce(s7.sugeridos, 0) = 0 then null
         else round(100.0 * s7.tocados / s7.sugeridos, 1)
    end                                as taxa_toque_7d,
    s7.mediana_min_ate_toque
  from usuarios u
  left join lateral (
        select count(*)::int                                          as na_fila,
               count(*) filter (where vencido)::int                   as vencidos,
               count(*) filter (
                   where vencido and not ja_tocado
                     and sugerido_em < now() - interval '2 hours'
               )::int                                                 as parados_2h
          from v_followups_fila q
         where q.atendente_id = u.id
  ) fila on true
  left join lateral (
        select count(*)::int as ativos
          from leads l
         where l.atendente_id = u.id
           and l.opt_out = false
           and l.etiqueta <> 'Negociação encerrada'
  ) leads on true
  left join lateral (
        select count(*)::int                                  as sugeridos,
               count(*) filter (where t.aberto_em is not null)::int as tocados,
               percentile_cont(0.5) within group (
                   order by extract(epoch from t.aberto_em - f.sugerido_em) / 60
               ) filter (where t.aberto_em is not null)       as mediana_min_ate_toque
          from followups f
          join leads l on l.id = f.lead_id
          left join lateral (
                select min(aberto_em) as aberto_em
                  from followup_toques ft where ft.followup_id = f.id
          ) t on true
         where l.atendente_id = u.id
           and f.sugerido_em > now() - interval '7 days'
  ) s7 on true
 where u.papel = 'atendente';


-- ---------------------------------------------------------------------------
-- v_admin_resumo · os números do time inteiro, 7 dias
--
-- `toque_sem_eco` é o sinal mais honesto de texto ruim que existe: a pessoa
-- abriu o WhatsApp com o texto pronto, releu e desistiu. Janela de 30 min
-- porque quem vai mandar, manda logo.
--
-- `abortados` é o termômetro do Porteiro (CLAUDE.md §7.1): muito alto = está
-- paranoico e o followup voltou a não acontecer; zero = não está olhando nada.
-- ---------------------------------------------------------------------------
create or replace view v_admin_resumo as
select
    (select count(*)::int from v_followups_fila where vencido)          as fila_agora,
    (select count(*)::int from v_followups_fila
      where vencido and not ja_tocado
        and sugerido_em < now() - interval '2 hours')                   as parados_2h,

    s.sugeridos_7d,
    s.tocados_7d,
    case when s.sugeridos_7d = 0 then null
         else round(100.0 * s.tocados_7d / s.sugeridos_7d, 1)
    end                                                                 as taxa_toque_7d,
    s.mediana_min_ate_toque,
    s.toque_sem_eco_7d,

    (select count(*)::int from followups
      where status = 'abortado' and atualizado_em > now() - interval '7 days')
                                                                        as abortados_7d,
    (select count(*)::int from leads
      where sem_atendimento = true)                                     as sem_atendimento,
    (select count(*)::int from leads
      where atendente_id is null and opt_out = false
        and sem_atendimento = false)                                    as sem_dona
  from (
    select
        count(*)::int                                          as sugeridos_7d,
        count(*) filter (where t.aberto_em is not null)::int    as tocados_7d,
        percentile_cont(0.5) within group (
            order by extract(epoch from t.aberto_em - f.sugerido_em) / 60
        ) filter (where t.aberto_em is not null)               as mediana_min_ate_toque,
        count(*) filter (
            where t.aberto_em is not null
              and not exists (
                    select 1 from mensagens m
                     where m.lead_id = f.lead_id
                       and m.direcao = 'equipe'
                       and m.enviada_em between t.aberto_em
                                            and t.aberto_em + interval '30 minutes'
              )
        )::int                                                 as toque_sem_eco_7d
      from followups f
      left join lateral (
            select min(aberto_em) as aberto_em
              from followup_toques ft where ft.followup_id = f.id
      ) t on true
     where f.sugerido_em > now() - interval '7 days'
  ) s;
```

**GRANTs** (mesmo arquivo `painel-role.sql`, junto dos que já existem):

```sql
grant select on wakeclub.v_sessao_valida    to painel_ro;
grant select on wakeclub.v_followups_fila   to painel_ro;
grant select on wakeclub.v_admin_atendentes to painel_ro;
grant select on wakeclub.v_admin_resumo     to painel_ro;
```

### A3. Script

Em `scripts/painel-db.mjs`:

- Acrescentar as 4 views a `VIEWS_ESPERADAS`.
- Acrescentar as 6 tabelas novas a `TABELAS` (o `check` conta linhas).
- Ler `PAINEL_RW_PASSWORD` no `apply` e criar/atualizar a role `painel_rw`.
- No `check`, testar as **duas** conexões: a `painel_ro` continua tendo que falhar num
  INSERT em `leads` (é a trava de escrita), e a `painel_rw` tem que **conseguir** inserir
  e apagar uma linha de teste em `sessoes` e **falhar** num select em `leads`.

### ✅ Aceite da Fase A

```
bun run db:apply && bun run db:check
```

- 15 views listadas e legíveis pela `painel_ro`.
- `painel_ro` → `42501 permission denied for table leads` num INSERT.
- `painel_rw` → INSERT em `sessoes` funciona; `select * from leads` dá 42501.

---

## 4. Fase B — Login e sessão

### B1. Dependências

```
bun add bcryptjs
bun add -d @types/bcryptjs
```

`bcryptjs` é JS puro — atravessa bun, node e o container sem compilar nada. Não troque
por binding nativo sem testar a imagem Docker.

### B2. `src/server/db.ts` — a segunda conexão

Acrescentar (sem mexer no `getPool()` existente):

```ts
/**
 * Conexão de ESCRITA do painel. Ver CLAUDE.md §16.
 *
 * Ela alcança sessão, inscrição de push e o log de toque — e nada do fluxo do
 * CRM. Não tem `default_transaction_read_only` (óbvio), então a única proteção
 * aqui são os GRANTs da role painel_rw. Por isso: NUNCA escreva SQL de leads,
 * mensagens ou followups usando este pool, mesmo que "só para conferir".
 */
export function getPoolRw(): Pool {
  /* mesmo padrão do getPool, com DATABASE_URL_RW */
}
```

Singleton em `globalThis`, `max: 4`, igual ao existente.

### B3. `src/server/auth.ts` (novo)

Responsabilidades, todas server-only:

| Função                       | O que faz                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `entrar({ usuario, senha })` | Normaliza (`trim().toLowerCase()`), busca em `usuarios` pela `painel_rw`, compara bcrypt, cria sessão, grava cookie, carimba `ultimo_acesso_em`. |
| `getSessao()`                | Lê o cookie, hasheia, consulta `v_sessao_valida` pela `painel_ro`, devolve `{ usuarioId, nome, usuario, papel, labelId }` ou `null`.             |
| `sair()`                     | `update sessoes set revogada = true where token_hash = $1`, apaga o cookie.                                                                      |
| `exigirSessao()`             | `getSessao()` ou `throw redirect({ to: '/login' })`.                                                                                             |
| `exigirAdmin()`              | `exigirSessao()` + `papel === 'admin'`, senão redirect para `/followups`.                                                                        |

Detalhes que não são opcionais:

```ts
// Token: 32 bytes aleatórios. O que vai no cookie é o token; o que vai no
// banco é o SHA-256 dele. Quem tiver leitura de `sessoes` não consegue se
// passar por ninguém a partir dali.
const token = randomBytes(32).toString("base64url");
const tokenHash = createHash("sha256").update(token).digest("hex");
```

```ts
// 30 dias de propósito: são celulares, e pedir senha toda semana na correria
// do atendimento termina em senha anotada no papel. O corte de acesso é
// `usuarios.ativo = false`, que a v_sessao_valida aplica na hora.
setCookie("wc_sessao", token, {
  httpOnly: true,
  secure: true, // o painel roda atrás de HTTPS
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
});
```

- **Senha errada e usuário inexistente devolvem a mesma mensagem** ("usuário ou senha
  incorretos") e levam o mesmo tempo — rode o `bcrypt.compare` contra um hash fixo quando
  o usuário não existir, para não vazar quem existe pelo tempo de resposta.
- **Rate limit simples**: no máximo 10 tentativas por usuário a cada 5 minutos, em memória
  do processo. É um painel de 3 a 5 pessoas; não precisa de Redis.
- `getSessao()` não deve escrever `sessoes.usado_em` a cada requisição (seria um UPDATE
  por request). Atualize no máximo uma vez por hora, comparando antes.

### B4. Proteção das rotas

Em `src/routes/__root.tsx`, `beforeLoad` chama `getSessao()` e joga a sessão no contexto
do router. Cada rota protegida declara o seu `beforeLoad`:

```ts
// src/routes/followups.tsx
export const Route = createFileRoute("/followups")({
  beforeLoad: async () => ({ sessao: await exigirSessao() }),
  component: Followups,
});
```

`/login` faz o contrário: se já tem sessão, redireciona para `/followups` (atendente) ou
`/admin` (admin).

**Não** tente resolver isso só com o `requestMiddleware` de `src/start.ts` — ele já existe
para tratamento de erro global e misturar as duas coisas dificulta o debug. Middleware
para o que é transversal (ler o cookie), `beforeLoad` para quem pode ver o quê.

### B5. Tela `/login`

Uma coluna, centralizada, pensada para celular: logo, campo usuário, campo senha,
botão. `autoComplete="username"` e `"current-password"` (o gerenciador de senhas do
iPhone precisa disso). Erro em `<Alert variant="destructive">`. Sem "esqueci minha senha"
— quem reseta é o admin, direto no banco, e isso está dito na tela.

### B6. Cabeçalho

`AppSidebar` ganha o rodapé com nome da pessoa e "Sair". A navegação passa a ser filtrada
por papel:

- **atendente**: Followups, Meus leads, Instalar app.
- **admin**: tudo (as telas antigas + Admin).

### ✅ Aceite da Fase B

- `/followups` sem cookie → redireciona para `/login`.
- Login errado 10x → bloqueia por 5 min.
- Sessão de alguém com `ativo = false` → cai para `/login` na requisição seguinte.
- Nenhuma resposta de rede contém `senha_hash` (confira na aba Network).
- `grep -r "senha_hash" src/` só aparece em `src/server/auth.ts`.

---

## 5. Fase C — App instalável (PWA)

**Por que antes do push:** no iPhone, Web Push **só funciona se o app tiver sido
adicionado à Tela de Início** (iOS 16.4+). Sem PWA instalado não existe notificação para
a maior parte da equipe. Instalação não é enfeite: é pré-requisito.

### C1. `public/manifest.webmanifest`

```json
{
  "name": "Wake Club · Atendimento",
  "short_name": "Wake Club",
  "start_url": "/followups",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0b1220",
  "theme_color": "#0b1220",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

`start_url` é `/followups` de propósito: quem abre pelo ícone é a atendente, e ela quer a
fila, não o inbox.

### C2. `src/routes/__root.tsx` — head

```tsx
links: [
  { rel: "manifest", href: "/manifest.webmanifest" },
  { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
],
meta: [
  { name: "theme-color", content: "#0b1220" },
  { name: "apple-mobile-web-app-capable", content: "yes" },
  { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
  { name: "apple-mobile-web-app-title", content: "Wake Club" },
]
```

### C3. `public/sw.js`

Service worker **mínimo**. Não faça cache offline nesta entrega: o painel mostra dados de
minuto a minuto e uma tela em cache mentindo sobre a fila é pior que uma tela vazia.

```js
// Wake Club · service worker.
// Só existe para receber push e abrir a tela certa no toque. Sem cache: dado
// velho de fila é pior que fila vazia.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
```

Registrar no cliente (efeito no `__root.tsx`, só em produção e só se
`"serviceWorker" in navigator`).

### C4. Tela `/instalar`

Instruções **com print ou ícone**, separadas por plataforma, detectando pelo user agent:

- **iPhone/iPad:** abrir no **Safari** (não funciona no Chrome do iOS) → botão
  Compartilhar → "Adicionar à Tela de Início" → abrir o app **pelo ícone** → então
  permitir notificações.
- **Android:** menu → "Instalar app" / "Adicionar à tela inicial", ou o banner do Chrome.

A tela mostra o estado atual em três checks: **instalado?** (`display-mode: standalone`),
**permissão de notificação?** (`Notification.permission`), **inscrito?** (existe registro
para este aparelho). É o roteiro de suporte quando alguém disser "não recebo nada".

### ✅ Aceite da Fase C

- Lighthouse → instalável.
- No iPhone real: ícone na tela de início, abre sem barra de endereço, cai em
  `/followups`.

---

## 6. Fase D — Push

### D1. Chaves VAPID

```
npx web-push generate-vapid-keys
```

Pública → `VITE_VAPID_PUBLIC_KEY` (vai para o navegador, pode ser pública mesmo).
Privada → `VAPID_PRIVATE_KEY` (só servidor, nunca no repositório).

```
bun add web-push
bun add -d @types/web-push
```

### D2. Inscrição (cliente)

`src/lib/push.ts`:

1. `Notification.requestPermission()` — **tem que ser dentro de um gesto do usuário**
   (clique no botão da tela `/instalar`). Chamada em `useEffect` é ignorada no iOS.
2. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
3. Manda `{ endpoint, p256dh, auth, apelido }` para uma server fn `salvarInscricao()`,
   que faz `insert ... on conflict (endpoint) do update` pela `painel_rw`.
4. Botão "testar notificação" que insere uma linha em `notificacoes` para o próprio
   usuário… **não** — o painel não escreve em `notificacoes` (é fila do n8n). O teste
   chama direto `/api/push/enviar` com o payload de teste, pelo caminho normal.

`apelido`: derive do user agent ("iPhone · Safari") e deixe o usuário renomear depois.
Ele existe para a pessoa saber qual aparelho remover.

### D3. Recepção (service worker)

```js
self.addEventListener("push", (event) => {
  const d = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(d.titulo ?? "Wake Club", {
      body: d.corpo ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: { url: d.url ?? "/followups" },
      // Uma notificação por followup, sem empilhar 12 iguais na tela.
      tag: d.tag,
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/followups";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
      // Se o app já está aberto, navega a aba existente em vez de abrir outra.
      const c = cs.find((c) => "focus" in c);
      if (c) return c.focus().then(() => c.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
```

### D4. `POST /api/push/enviar` — quem chama é o n8n

**Este é o contrato com o WF-09.** O n8n é dono da fila (`notificacoes` no Postgres); o
painel só assina e entrega, sem estado. Motivo: Web Push exige VAPID (ES256) e payload
`aes128gcm` com ECDH — no painel isso é a biblioteca `web-push`; num Code node do n8n
seria reimplementar criptografia na mão.

**Requisição** (header `x-push-secret: <PUSH_DISPATCH_SECRET>`):

```json
{
  "usuarioId": "uuid | null",
  "titulo": "3 followups esperando",
  "corpo": "Marina, João e mais 1",
  "url": "/followups",
  "tag": "followups"
}
```

`usuarioId: null` = todos os **admins ativos** (é o caso do alerta "o número caiu", que
não tem dona).

**Resposta:**

```json
{ "enviados": 2, "removidos": 1, "falhas": 0 }
```

**Regras do handler:**

- Compare o segredo com `timingSafeEqual`. Segredo errado → **404**, não 401: um endpoint
  que responde 401 confirma que existe.
- Busca as inscrições do usuário (`painel_rw`), envia uma a uma.
- **`404` ou `410` do serviço de push → apague a inscrição na hora.** É o navegador
  dizendo que aquele registro morreu; mantê-lo faz a fila falhar para sempre.
- Outros erros → `falhas + 1` e `ultimo_erro`, sem apagar.
- Erro de uma inscrição **não** derruba as outras.
- O endpoint **não** consulta nem atualiza `notificacoes`. Quem faz isso é o WF-09.

### ✅ Aceite da Fase D

- No iPhone instalado: permissão concedida, linha em `push_subscriptions`.
- `curl -H "x-push-secret: ..." -d '{...}' .../api/push/enviar` → notificação no aparelho.
- Toque na notificação abre o app em `/followups`.
- Segredo errado → 404.
- Inscrição revogada no aparelho → primeira tentativa devolve `removidos: 1` e a linha
  some.

---

## 7. Fase E — `/followups`, a tela principal

É a tela que justifica a entrega inteira. **Desenhe para celular, uma mão, entre um
atendimento e outro.**

### E1. Dados

`src/server/followups.ts`:

```ts
listarMinhaFila(); // v_followups_fila where atendente_id = sessao.usuarioId
// order by vencido desc, agendado_para asc
registrarToque(id); // insert into followup_toques (followup_id, usuario_id)
// pela painel_rw. Append-only. Não toca em `followups`.
```

`registrarToque` valida que o followup é **daquela** atendente antes de inserir (leia pela
`painel_ro` e compare) — senão qualquer sessão poderia logar toque no lead de outra
pessoa e sujar a métrica.

### E2. Layout

Três grupos, nesta ordem:

1. **Agora** — `vencido && !ja_tocado`. É o trabalho.
2. **Já abri** — `ja_tocado`, colapsado. Fica visível para a pessoa lembrar do que
   fez, e mostra se houve eco (`tem_eco`): "mensagem confirmada" vs "aberto, sem resposta
   sua ainda".
3. **Depois** — `!vencido`, com a hora prevista.

**O card:**

```
┌─────────────────────────────────────────────┐
│ Marina Souza          Aguardando pagamento  │  nome + etiqueta
│ há 2 dias sem resposta · 3º toque           │  contexto temporal + n_toques
├─────────────────────────────────────────────┤
│ ⓘ Sumiu depois do link de pagamento         │  followups.motivo (por que a IA agendou)
├─────────────────────────────────────────────┤
│ "Marina, tudo certo? Vi que o link ficou    │  texto_sugerido, legível, sem truncar
│  pendente. Se preferir, consigo te mandar   │
│  o Pix direto por aqui."                    │
├─────────────────────────────────────────────┤
│ [ Abrir no WhatsApp ]        [ Copiar ]     │
└─────────────────────────────────────────────┘
```

O `motivo` fica **em cima do texto** de propósito: a pessoa decide se faz sentido antes de
ler a redação. É o julgamento humano acontecendo, e é o que a Fase 4 do projeto está
medindo.

### E3. O botão — e a armadilha do iOS

```ts
function abrirNoWhatsApp(f: FollowupFila) {
  const numero = f.telefone.replace(/\D/g, ""); // wa.me não aceita "+"
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(f.textoSugerido)}`;

  // O toque é registrado SEM await: no iOS, navegar depois de um await quebra
  // o vínculo com o gesto do usuário e o Safari bloqueia a abertura. `keepalive`
  // garante que a requisição sobrevive à saída da página.
  registrarToque({ data: { followupId: f.followupId } });

  window.location.href = url;
}
```

- **Não** use `window.open()` — no iOS instalado ele é bloqueado com frequência.
- **Não** faça `await registrarToque(...)` antes de navegar.
- Perder um registro de toque é aceitável; **impedir a atendente de mandar a mensagem não
  é.** A hierarquia é essa e ela é deliberada.

Depois de tocar, o card **muda de estado na tela** (vai para "Já abri") mas **não some** —
a pessoa pode ter desistido e vai querer voltar. E o texto continua legível: se ela editou
no WhatsApp, saber o que a IA tinha escrito ajuda a entender a diferença.

### E4. O que a tela NÃO faz

- Não marca followup como enviado (o painel não sabe disso — o eco é quem sabe).
- Não deixa editar o texto no painel. A edição acontece no WhatsApp, que é onde ela já
  vai estar. Um editor aqui seria um segundo lugar para revisar a mesma coisa.
- Não deixa cancelar nem reagendar followup — isso é decisão da IA (§7.1). Se a sugestão
  estiver ruim, a pessoa simplesmente não toca, e **isso é o dado**.

### E5. Atualização

`refetchInterval` de 60s na query, e refetch ao voltar o foco da janela (a pessoa sai para
o WhatsApp e volta). Contador no título da aba, não.

### ✅ Aceite da Fase E

- A atendente A não vê nenhum followup da atendente B.
- Tocar o botão abre o WhatsApp Business com o texto **completo e acentuado** correto.
- Uma linha em `followup_toques` por toque, com o `usuario_id` certo.
- `followups` não sofreu **nenhum** UPDATE (confira `atualizado_em` antes e depois).
- Testado no iPhone real, instalado na tela de início.

---

## 8. Fase F — `/meus-leads`

`v_leads_painel` filtrada por `atendente_id`, agrupada por etiqueta na ordem do funil
(a view já traz `etiqueta_ordem` — use, não ordene alfabeticamente).

Lista em cartões, não kanban: é celular. Toque no lead abre a conversa
(`/?lead=<uuid>` já existe) — reaproveite `v_conversas_painel` /
`v_mensagens_painel`, mas em layout de uma coluna.

Campo de busca por nome ou telefone, client-side (são poucas centenas de leads).

**Somente leitura.** Sem arrastar card, sem editar etiqueta, sem campo de mensagem.

---

## 9. Fase G — `/admin`

Primeira tela do admin. Quatro blocos, nesta ordem:

**1. Agora** — `v_admin_resumo`: `fila_agora`, `parados_2h` (destaque vermelho se > 0),
`sem_dona`, `sem_atendimento`, e a saúde do número (`v_saude_numero`, já existe no
cabeçalho).

**2. A IA está acertando?** — as métricas que decidem o futuro do projeto:

| Cartão                 | Campo                   | Como ler (mostre isto na tela, em texto pequeno)                                                                   |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Taxa de toque (7d)     | `taxa_toque_7d`         | A vendedora dizendo com o dedo se a IA leu o lead direito. Baixa = ou o momento está errado, ou o texto está ruim. |
| Tempo até o toque      | `mediana_min_ate_toque` | Se for de horas, o push não está funcionando ou está sendo ignorado.                                               |
| Toque sem eco (7d)     | `toque_sem_eco_7d`      | Abriu e desistiu ao reler. O sinal mais honesto de texto ruim.                                                     |
| Barrados pelo Porteiro | `abortados_7d`          | Muito alto = paranoico. Zero = não está olhando nada.                                                              |

Explicar o significado **na própria tela** é convenção deste painel (a `/wf02` já faz
isso). Número sem leitura vira ranking, e ranking de gente com número inventado é o que
este projeto passou três documentos evitando.

**3. Por atendente** — `v_admin_atendentes`, uma linha por pessoa: nome, na fila,
vencidos, parados há 2h+, leads ativos, taxa de toque 7d, tempo até o toque, último
acesso. Ordenar por `parados_2h desc`.

> Este quadro responde **"o problema é a IA ou é a rotina de alguém?"**. Se uma pessoa
> deixa a fila encher e as outras não, não é o Redator que está errado. Sem esta quebra, a
> taxa de toque geral seria cobrada injustamente do agente.

**4. Funções** — o que o admin pode fazer:

- **Ativar/desativar atendente** (`usuarios.ativo`). Botão de desligar: tira do rodízio do
  WF-08 e mata a sessão na requisição seguinte.
- **Ver aparelhos inscritos** por pessoa e remover um.
- **Mandar notificação de teste** para uma pessoa (mesmo caminho da Fase D).
- **Link para as telas de operação** (`/`, `/kanban`, `/wf02`, `/reports`).

> ⚠️ Ativar/desativar atendente é **escrita em `usuarios`**, que a `painel_rw` só tem
> como UPDATE de `ultimo_acesso_em`. Duas saídas: (a) conceder
> `update (ativo) on usuarios to painel_rw` e restringir no handler a `papel = 'admin'`,
> ou (b) deixar de fora desta entrega e desligar gente por SQL. **Escolha (a)**, mas
> conceda **só a coluna `ativo`**, e não `senha_hash`, `papel` ou `label_id` — trocar
> label de atendente tem que continuar sendo feito no WhatsApp, senão banco e celular
> divergem (CLAUDE.md §15).

**Cadastro de novas atendentes fica de fora desta entrega.** Envolve gerar hash bcrypt e
casar com uma label existente na Evolution; por ora é SQL na mão, e está registrado como
pendência no CLAUDE.md §11.

---

## 10. Variáveis de ambiente

Acrescentar ao `.env.example` (com placeholders — **nunca** valores reais):

```bash
# Conexão de escrita do painel (sessão, push, toques). Role painel_rw.
DATABASE_URL_RW=postgres://painel_rw:SENHA_RW@HOST:5432/wakeclub

# Senha que a painel_rw vai passar a ter. Só o scripts/painel-db.mjs lê.
# Tem que ser byte a byte igual à que está na DATABASE_URL_RW acima.
PAINEL_RW_PASSWORD=SENHA_RW

# Web Push. Gerar com: npx web-push generate-vapid-keys
VITE_VAPID_PUBLIC_KEY=BJ...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contato@wakeclub.com.br

# Segredo que o n8n (WF-09) manda em x-push-secret para POST /api/push/enviar.
PUSH_DISPATCH_SECRET=troque-isto
```

> A armadilha das senhas divergentes já custou tempo neste projeto: `DATABASE_URL_RW` e
> `PAINEL_RW_PASSWORD` precisam ser **idênticas**. O script grava uma e a aplicação usa a
> outra; divergiram por uma letra e o sintoma é `28P01`, longe da causa.

Lembre de replicar as variáveis novas no `portainer-stack.yml` / no ambiente do container.

---

## 11. Armadilhas conhecidas (todas já custaram tempo aqui)

1. **`vite.config.ts` — `importProtection.client.excludeFiles`.** O preset nega
   `**/server/**` no bundle do cliente. Todo módulo novo em `src/server/` que exporte um
   `createServerFn` **precisa ser acrescentado àquela lista**, senão `bun dev` funciona e
   `bun run build` quebra — o pior par possível. Nesta entrega: `auth.ts`,
   `followups.ts`, `push.ts`, `admin.ts`.
   **`src/server/db.ts` continua fora da lista, de propósito** — é o único arquivo que
   toca `pg` e as URLs de conexão, e nenhuma rota o importa.

2. **View nova sem GRANT = tela vazia sem erro.** O `painel-role.sql` revoga privilégios
   default. É chato de propósito. `bun run db:check` é a **primeira** coisa a rodar quando
   uma tela vier vazia: ele separa "não tem dado" de "sem permissão", que são idênticos na
   tela e completamente diferentes na causa.

3. **Cast explícito de parâmetro.** O Postgres não infere tipo de parâmetro em posição
   ambígua (dentro de `format()`, ou num `case` sobre `''`). Já quebrou duas vezes:
   `nullif($6::text, '')::timestamp` e `$1::boolean`. Na dúvida, castar.

4. **`numeric` vira string no `pg`.** `taxa_toque_7d`, `mediana_min_ate_toque` e qualquer
   `round()` chegam como string. Sempre `Number(...)` no mapeamento.

5. **iOS:** push só com o app na Tela de Início; `requestPermission` só dentro de gesto do
   usuário; `window.open` costuma ser bloqueado no modo standalone — use
   `window.location.href`.

6. **O host do banco é `n8n.agencianovabr.com`** (ou o IP). O domínio nu
   `agencianovabr.com` **não resolve** — só os subdomínios existem.

7. **Não importe `mock-data.ts` em tela nova.** Ele é da `/templates`, que é demo
   assumida. Dado falso em tela de operação é pior que tela vazia.

---

## 12. Resumo do contrato com o n8n

Para não haver dúvida sobre quem faz o quê:

| Quem            | Faz                                                                                                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WF-02** (n8n) | Qualifica o lead, escreve etiqueta/campos, agenda o followup.                                                                                                                           |
| **WF-03** (n8n) | Escreve `followups.texto_sugerido` + `sugerido_em`. Insere em `notificacoes`.                                                                                                           |
| **WF-08** (n8n) | Preenche `leads.atendente_id` e `sem_atendimento` a partir das labels.                                                                                                                  |
| **WF-09** (n8n) | Consome `notificacoes` e chama `POST /api/push/enviar` do painel.                                                                                                                       |
| **Painel**      | Lê tudo isso. Escreve **só** `sessoes`, `push_subscriptions`, `followup_toques`, `usuarios.ultimo_acesso_em` (+ `usuarios.ativo` na Fase G). Assina e entrega o push quando o n8n pede. |
| **Atendente**   | Lê, decide, toca, manda (ou não manda) pelo WhatsApp dela.                                                                                                                              |

Se em algum momento a implementação parecer precisar que o painel escreva um followup,
mande uma mensagem, ou chame a Evolution — **é sinal de que a especificação foi mal lida**.
