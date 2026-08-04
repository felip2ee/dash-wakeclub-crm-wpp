# AGENTS.md · Wake Club Dashboard

## Fonte de verdade e idioma

- Leia `ESPEC-PAINEL-EQUIPE.md` antes de implementar login, PWA, push, followups, telas de equipe ou administração. Ela é a especificação executável desta entrega.
- Em caso de divergência de intenção, consulte `../CLAUDE.md`, especialmente as seções 15 e 16. Não altere decisões de produto silenciosamente.
- Use português do Brasil em textos de tela, comentários explicativos e nomes novos de domínio. Preserve nomes técnicos exigidos por bibliotecas e APIs.
- Não recrie estruturas que já existem. Inspecione o repositório e estenda os padrões atuais.

## Objetivo do produto

Este painel é a interface interna de atendimento da Wake Club. O atendimento ao lead é humano pelo WhatsApp. O n8n lê as conversas, mantém o CRM, decide followups e redige sugestões. A atendente revisa a sugestão e abre o WhatsApp com o texto preenchido; ela decide se edita e se envia.

O painel é um espelho do CRM. Ele não é um segundo motor de automação nem uma fonte concorrente de estado.

## Regras invioláveis

1. Nunca insira, atualize ou apague dados em `leads`, `mensagens`, `followups` ou `crm_outbox` a partir do painel.
2. Nunca chame a Evolution API pelo painel. Integrações externas do fluxo pertencem ao n8n.
3. O painel só pode escrever em `sessoes`, `push_subscriptions`, `followup_toques`, `usuarios.ultimo_acesso_em` e, para ação autenticada de admin, `usuarios.ativo`.
4. Um toque em “Abrir no WhatsApp” significa **abriu**, não **enviou**. Não invente estado de envio nem atualize o followup. A confirmação vem do eco da mensagem capturado pelo n8n.
5. `usuarios.senha_hash` é estritamente server-only: nunca exponha em view de leitura, resposta, bundle, erro ou log.
6. Nunca versione credenciais, URLs com senha, chaves VAPID ou `PUSH_DISPATCH_SECRET`. Use `.env`; mantenha apenas placeholders em `.env.example`.
7. Toda view nova requer GRANT explícito para a role adequada e inclusão nos checks do banco.
8. Não use `src/lib/mock-data.ts` em telas operacionais. Dado falso não pode parecer dado real.

## Arquitetura e responsabilidades

- Stack: TanStack Start, React 19, Vite, Nitro, TanStack Query, Tailwind v4, shadcn/ui, PostgreSQL via `pg`; gerenciador de pacotes: Bun.
- Rotas ficam em `src/routes/`; módulos server-only e SQL ficam em `src/server/`; componentes não executam SQL.
- `src/server/db.ts` é o único módulo que importa `pg` ou lê URLs de banco.
- `getPool()`/`DATABASE_URL` usa `painel_ro` para leitura. `getPoolRw()`/`DATABASE_URL_RW` usa a role limitada `painel_rw` somente nas escritas permitidas.
- O n8n é dono de leads, mensagens, followups, labels, outbox e da fila `notificacoes`. O painel assina dispositivos e entrega Web Push quando o WF-09 chama `POST /api/push/enviar`; o endpoint não gerencia a fila.
- Não crie as tabelas de equipe pelo dashboard. Se `usuarios`, `sessoes`, `push_subscriptions`, `notificacoes`, `followup_toques` ou `whatsapp_labels` não existirem, pare e informe que `../db/schema-equipe.sql` precisa ser aplicado pelo fluxo responsável.

## Ordem obrigatória da entrega

Implemente e valide uma fase antes de depender dela:

1. A — banco: role `painel_rw`, views, GRANTs e `scripts/painel-db.mjs`.
2. B — login, cookie de sessão e autorização por papel.
3. C — PWA instalável, sem cache offline de dados.
4. D — inscrição e entrega de Web Push.
5. E — `/followups`, a principal tela mobile e o botão do WhatsApp.
6. F — `/meus-leads`, somente leitura e ordenado pelo funil.
7. G — `/admin`, métricas e ações administrativas limitadas.

Não avance simulando dependências de banco ausentes. Registre claramente o que foi validado com infraestrutura real e o que permanece pendente.

## Convenções de implementação

- Cada módulo de servidor começa com comentário explicando por que ele existe.
- Mapeie `snake_case` do Postgres para `camelCase` explicitamente no servidor.
- Converta `numeric` retornado por `pg` com `Number(...)`.
- Converta datas para ISO string no servidor; não devolva objetos `Date` ao cliente.
- Exiba datas no fuso `America/Sao_Paulo` usando os utilitários existentes quando possível.
- Faça casts explícitos em parâmetros SQL ambíguos, por exemplo `$1::text` e `$1::boolean`.
- Valide autorização no servidor em toda ação. Ocultar botão no cliente não é controle de acesso.
- A sessão deve usar cookie `HttpOnly`, `Secure` em produção, `SameSite=Lax` e `Path=/`; persista somente o hash SHA-256 do token.
- Rotas `/`, `/kanban`, `/wf02` e `/reports` exigem admin. `/followups` e `/meus-leads` são filtradas pelo usuário autenticado. `/login` é pública.
- Novos módulos com `createServerFn` em `src/server/` devem entrar em `importProtection.client.excludeFiles` de `vite.config.ts`. Nunca inclua `src/server/db.ts` ali.
- Preserve o layout existente nas telas administrativas, mas desenhe `/followups`, `/meus-leads` e `/instalar` para celular e uso com uma mão.

## Regras críticas de followup e iOS

- `/followups` consulta `v_followups_fila` somente para `sessao.usuarioId` e ordena/grupa como definido na especificação: Agora, Já abri e Depois.
- Antes de inserir `followup_toques`, confirme no servidor que o followup pertence à atendente autenticada.
- O log de toque é append-only. O card muda de grupo no cliente, mas permanece acessível.
- Monte `wa.me` com telefone apenas em dígitos e texto completo via `encodeURIComponent`.
- Ao tocar, dispare o registro sem `await` e navegue com `window.location.href`. Não use `window.open()`: o vínculo com o gesto do usuário precisa ser preservado no iOS instalado.
- Push no iOS só funciona com o app instalado e a permissão deve ser solicitada diretamente por gesto do usuário.
- O service worker não deve fazer cache offline nesta entrega; fila antiga apresentada como atual é um erro de produto.

## Banco, segurança e métricas

- Privilégio mínimo é parte do critério de aceite. A `painel_ro` continua read-only; a `painel_rw` não pode ler/escrever tabelas do fluxo fora das permissões expressas.
- `DATABASE_URL_RW` e `PAINEL_RW_PASSWORD` devem conter exatamente a mesma senha.
- No endpoint de push, compare o segredo de forma resistente a timing e responda 404 quando inválido.
- Remova inscrição de push ao receber 404/410 do provedor; isole falhas por inscrição.
- Não crie ranking de tempo de resposta por atendente: o banco não identifica quem digitou cada mensagem. Métricas por atendente são calculadas por lead atribuído.
- Preserve a distinção entre sugestão, toque/abertura e eco/envio confirmado. Não renomeie essas métricas como se fossem equivalentes.

## Comandos e validação

Use os scripts do projeto:

```powershell
bun install
bun run db:apply
bun run db:check
bun run lint
bun run build
```

- Não rode `db:apply` sem credencial administrativa e sem confirmar que a Fase A está autorizada no ambiente alvo.
- Para mudanças apenas de front sem acesso ao banco, rode no mínimo `bun run lint` e `bun run build`.
- Para mudanças de banco ou integração, rode `db:check` e confirme os testes de privilégios das duas roles descritos na especificação.
- Teste login, isolamento entre atendentes e autorização de admin no servidor.
- Recursos PWA/Push/WhatsApp só estão concluídos após teste em aparelho real, especialmente iPhone instalado pela Tela de Início.
- Antes de concluir, rode `git diff --check` e verifique que `.env`, segredos e artefatos gerados não entraram no diff.

## Critério de conclusão

Uma mudança só está pronta quando respeita `ESPEC-PAINEL-EQUIPE.md`, passa nas validações proporcionais ao risco e não enfraquece as travas de escrita. No relatório final, diferencie explicitamente:

- implementado e validado localmente;
- validado contra banco/serviços reais;
- dependente de n8n, Portainer, credenciais ou aparelho físico;
- não validado e motivo.

Nunca declare sucesso de produção com dados mock, build isolado ou apenas inspeção visual.
