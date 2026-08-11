# AGENTS.md · Refatoração do CRM Wake Club

## Mandato atual

Este repositório entra agora na refatoração descrita em `plan(2).md`.

“Começar do zero” significa começar pela **Fase 0 do plano**, sem presumir que alguma
fase nova está pronta. Não significa apagar o app, recriar a stack, zerar banco ou
descartar telas que já funcionam. O sistema atual é a linha de base que a refatoração
deve preservar até cada substituição ter sido validada.

Estado atual da refatoração:

- **Fase 0 concluída:** `docs/current-architecture.md` registra entidades, views,
  server functions, páginas, permissões e fluxos n8n existentes;
- **Fases 1 e 2 implementadas localmente:** o Kanban abre o `OpportunityWorkspace`,
  que recebe mensagens, atividade do WF-02, followups e timeline por uma única
  `getOpportunityWorkspace`; ainda requer validação visual com login real;
- **Fase 7 implementada localmente por autorização explícita fora da ordem:**
  `/minha-fila` unifica carteira e followup atual pelas views existentes, prioriza e
  explica cada card; `/followups` e `/meus-leads` continuam disponíveis;
- as **Fases 3–6 não devem ser presumidas concluídas**: banco/n8n seguem sob trabalho de
  outro agente e a integração só avança após o relatório dessa entrega;
- a Fase 7 ainda requer validação visual com login real e teste do retorno do WhatsApp
  em aparelho; “Feitos hoje” enxerga somente toques ainda presentes em
  `v_followups_fila`, pois não existe view histórica própria para a atendente;
- nenhuma mudança funcional pertenceu à Fase 0.

Execute uma fase por vez. Não avance automaticamente para a próxima fase quando houver
dependência externa, decisão de produto pendente ou risco de alterar comportamento.

## Fontes de verdade

Use esta ordem, sem escolher silenciosamente o documento mais conveniente:

1. `plan(2).md` define objetivo, experiência final, ordem e escopo da refatoração.
2. `../CLAUDE.md`, principalmente as decisões mais recentes das seções 15 e 16,
   define o porquê do produto, a responsabilidade dos workflows e fatos medidos em
   serviços reais. Blocos históricos/arquivados não superam um veredito datado mais
   novo no mesmo documento.
3. `ESPEC-PAINEL-EQUIPE.md` preserva o contrato já implementado de login, autorização,
   PWA, push, followups e privilégios mínimos.
4. `ESPEC-BOTAO-NAO-ATENDER.md` preserva a diferença entre rejeitar uma sugestão,
   requalificar o lead e marcar um contato como `sem_atendimento`.
5. O código, os SQLs em `../db/` e os workflows em `../n8n/` são evidência do estado
   atual. Não são autorização para contrariar as decisões acima.

Se o plano exigir nova escrita, nova fonte de estado ou mudança de responsabilidade
entre painel e n8n, pare, exponha o conflito e proponha a menor decisão explícita
necessária antes de implementar.

Use português do Brasil em textos de tela e comentários explicativos. Preserve nomes
técnicos exigidos por bibliotecas, APIs e pelo plano. Não renomeie `plan(2).md` nem
altere documentos de produto sem pedido do usuário.

## Produto que estamos construindo

A oportunidade passa a ser o centro da experiência. O administrador deve responder
“quem precisa de atenção agora e por quê?” pela Central e investigar todo o contexto no
`OpportunityWorkspace`. A atendente deve receber uma fila mobile priorizada que explique
quem chamar, por que o item apareceu e qual é o próximo passo.

A navegação final `Central / Inteligência / Equipe / Configurações` é um destino, não
uma migração imediata. Preserve `/`, `/kanban`, `/wf02`, `/reports`, `/admin`,
`/followups` e `/meus-leads` até a nova experiência cobrir e validar suas funções.

Métricas operacionais são controles: quando representam uma população, devem aplicar o
filtro correspondente. Não adicione números decorativos nem misture logs técnicos à
visão operacional.

## Base existente — não recriar

- Stack: TanStack Start, React 19, Vite, Nitro, TanStack Query, Tailwind v4,
  shadcn/ui, PostgreSQL via `pg`; gerenciador: Bun.
- Rotas ficam em `src/routes/`; servidor e SQL em `src/server/`; componentes não
  executam SQL.
- `src/server/db.ts` é o único módulo que importa `pg` ou lê URLs do banco.
- `getPool()` usa `painel_ro`; `getPoolRw()` usa a role limitada `painel_rw`.
- Login, sessão por papel, PWA, push, fila individual, meus leads e admin já existem.
- O Kanban já possui `HistoricoDoLead` + `getMensagens`; `/` possui `Thread`/`Bolha`;
  `/meus-leads` possui outra conversa; `/wf02` possui `AbaTimeline`; reutilize esses
  comportamentos antes de criar uma quarta implementação.
- `src/lib/mock-data.ts` pertence à demonstração de `/templates`. Nunca o use em tela
  operacional nem como prova de conclusão.

Não mova o projeto inteiro para `src/features/` antecipadamente. Extraia um componente
compartilhado quando uma fase exigir reutilização real; a componentização ampla pertence
à Fase 12.

## Responsabilidade dos dados

O atendimento continua humano pelo WhatsApp. O n8n lê conversas, mantém o CRM,
qualifica, agenda/cancela followups, redige sugestões e conversa com a Evolution API.
O painel apresenta o estado, autentica a equipe, registra ações próprias e abre o
WhatsApp; ele não é um segundo motor de automação.

Regras invioláveis:

1. O painel nunca chama a Evolution API e nunca envia mensagem ao lead.
2. O painel não altera `mensagens`, `followups`, `crm_outbox`, etapa, temperatura,
   resumo, `qualificar_apos` ou `leads.atendente_id` diretamente.
3. As escritas atuais da `painel_rw` ficam limitadas a:
   - sessões e inscrições push;
   - `followup_toques` por INSERT append-only;
   - `usuarios.ultimo_acesso_em`;
   - administração autenticada de `usuarios.ativo` e cadastro limitado às colunas
     `nome`, `usuario`, `senha_hash` e `label_id`, conforme os GRANTs atuais;
   - `leads.sem_atendimento` e `sem_atendimento_motivo`, a segunda exceção nomeada e
     limitada por coluna registrada em `../db/painel-role.sql` e
     `scripts/painel-db.mjs`.
4. Toda nova view ou tabela acessada pelo painel exige GRANT explícito, teste positivo
   do acesso necessário e teste negativo das duas roles.
5. `usuarios.senha_hash` é estritamente server-only: nunca aparece em view de leitura,
   resposta, bundle, erro ou log.
6. Credenciais, URLs com senha, chaves VAPID e segredos de webhook vivem somente em
   `.env`; `.env.example` contém apenas placeholders.

As fases futuras não ampliam esses privilégios por implicação:

- `automation_events` deve ser escrito pelos workflows responsáveis e lido pelo painel
  por uma superfície segura. Não armazene chain-of-thought; só decisão operacional,
  motivo resumido, estados observáveis e metadados necessários.
- `followup_feedback` ainda não faz parte da superfície autorizada da `painel_rw`.
  Antes da Fase 9, definir DDL no fluxo responsável por `../db/`, conceder apenas as
  colunas/operações necessárias e ampliar `db:check`. A Fase 8 pode guardar apenas o
  retorno pendente no navegador; isso não é persistência durável nem conclusão da
  coleta de feedback.
- `contacts`, `opportunities` e uma etapa própria da oportunidade são decisões das
  Fases 13 e 14. Até lá, trate `lead` como o modelo legado exposto pelas views; não
  antecipe tabelas nem drag-and-drop.

Se tabelas esperadas do CRM/equipe não existirem, não as crie pelo dashboard. Informe
qual schema em `../db/` precisa ser aplicado pelo fluxo autorizado.

## Semântica que não pode ser adulterada

- “Abrir no WhatsApp” significa **abriu**, nunca **enviou**. O envio só é confirmado
  pelo eco capturado pelo n8n.
- `followup_toques` é append-only e não altera o ciclo de vida do followup.
- Mensagens distinguem `lead`, `equipe` e `ia`, mas hoje não identificam qual atendente
  digitou. Mostre “Equipe” e não invente autora ou ranking individual de resposta.
- Métricas por atendente são por lead atribuído, não por autoria de mensagem.
- Uma timeline só mostra fatos sustentados pelos dados. Na Fase 1, alterações históricas
  de etapa/temperatura ou agentes específicos aparecem apenas quando houver evidência;
  ausência de evento deve ser visível, não preenchida por inferência.
- Followup cancelado não é automaticamente erro; mostre o motivo disponível.
- Requalificar uma sugestão inadequada não é `sem_atendimento`, não é opt-out e não
  remove o lead da distribuição. A requalificação pertence ao n8n e deve ser
  idempotente.
- As labels do WhatsApp não são fonte legível/confiável na instância atual. A dona do
  lead vem de `leads.atendente_id`, preenchido pelo rodízio pegajoso do WF-08; não reabra
  a investigação de labels sem upgrade, repareamento ou outro dado real novo.

## Leitura prática das fases

- **Fase 0:** documentar o estado real; zero mudança funcional.
- **Fases 1–2:** abrir o workspace a partir do Kanban reutilizando leituras atuais e,
  depois, consolidar a maior parte da carga em uma única `createServerFn`. Admin pode
  ler qualquer lead; atendente só lead atribuído, validado no servidor.
- **Fases 3–4:** criar auditoria no domínio do n8n/banco e então uma timeline unificada
  confiável. Não reconstruir como fato o que o banco não registra.
- **Fases 5–6:** evoluir o Kanban existente para Central e conectar métricas a filtros;
  não remover telas antigas.
- **Fases 7–11:** unificar a fila mobile, feedback e lifecycle sem perder a distinção
  sugestão → abertura → eco confirmado → avaliação humana.
- **Fase 12:** extrair componentes compartilhados comprovadamente duplicados.
- **Fases 13–14:** migrar contato/oportunidade e fonte de etapa progressivamente, com
  compatibilidade e rollback. Só depois considerar drag-and-drop.
- **Fase 15:** remover navegação antiga apenas após paridade funcional demonstrada.

## Convenções de implementação

- Inspecione todos os chamadores antes de alterar helper, server function ou view.
- Prefira o padrão já instalado e o menor diff correto; não adicione dependência ou
  abstração para necessidade futura.
- Cada módulo de servidor começa com comentário explicando por que existe.
- Mapeie `snake_case` para `camelCase` explicitamente no servidor.
- Converta `numeric` do `pg` com `Number(...)` e datas para ISO string no servidor.
- Exiba datas no fuso `America/Sao_Paulo`, reutilizando `src/lib/formato.ts`.
- Faça casts SQL explícitos, por exemplo `$1::uuid`, `$1::text` e `$1::boolean`.
- Valide entrada com Zod e autorização no servidor. Botão oculto não é controle de
  acesso.
- Preserve os acessos atuais até a fase que os substituir: `/`, `/kanban`, `/wf02`,
  `/reports`, `/admin` e `/templates` são de admin; `/followups` e `/meus-leads` são
  isoladas por atendente; `/instalar` exige sessão; `/login` é pública.
- A sessão usa cookie `HttpOnly`, `SameSite=Lax`, `Path=/` e `Secure` em produção; o
  banco persiste somente o SHA-256 do token.
- Antes de inserir `followup_toques`, confirme no servidor que o followup pertence à
  atendente autenticada.
- Novos módulos com `createServerFn` em `src/server/` entram em
  `importProtection.client.excludeFiles` de `vite.config.ts`; nunca exclua
  `src/server/db.ts` da proteção.
- Para `wa.me`, mantenha telefone só em dígitos e texto com `encodeURIComponent`.
  Registre o toque sem `await` e navegue com `window.location.href`; não use
  `window.open()` no fluxo instalado do iOS.
- Push no iOS exige app instalado e permissão solicitada diretamente por gesto. O
  service worker não faz cache offline de dados operacionais.
- No endpoint push, compare segredo de forma resistente a timing, responda 404 quando
  inválido, isole falhas e remova inscrições após 404/410 do provedor.
- `DATABASE_URL_RW` e `PAINEL_RW_PASSWORD` devem representar exatamente a mesma senha
  quando a role for aplicada.
- Paginação/load-more só entra quando o workspace puder carregar histórico grande; não
  carregue milhares de mensagens para resolver o primeiro card.
- Logs estruturados não incluem texto de conversa, senha, token ou segredo sem
  necessidade explícita.

## Fluxo obrigatório de trabalho

Antes de cada fase:

1. ler a seção correspondente de `plan(2).md` e as fontes relacionadas;
2. consultar o grafo e inspecionar o código/SQL/workflows reais;
3. registrar dependências, conflitos e dados que ainda não existem;
4. informar os arquivos que serão alterados;
5. preservar mudanças locais não relacionadas.

Depois de cada fase:

1. executar a validação proporcional ao risco;
2. corrigir apenas erros introduzidos pela fase;
3. listar arquivos alterados e decisões tomadas;
4. separar claramente o que foi validado localmente, em banco/serviço real, em
   aparelho físico e o que segue pendente;
5. não declarar produção pronta com mock, build isolado ou inspeção visual.

Não faça formatação global para corrigir achados herdados. Não publique, aplique schema,
ative workflow ou altere serviço externo sem pedido/autorização correspondente.

## Comandos e validação

```powershell
bun install
bun run db:apply
bun run db:check
bun run lint
bun run build
git diff --check
```

- Mudança só documental: no mínimo `git diff --check` e revisão do diff.
- Frontend/servidor sem banco: `bun run lint`, `bun run build` e o menor teste executável
  que cubra lógica não trivial nova.
- Banco/integração: `bun run db:check`, testes de privilégio positivo/negativo e
  validação do serviço real envolvido.
- Nunca rode `db:apply` sem credencial administrativa e autorização explícita para o
  ambiente alvo.
- PWA, push, retorno do WhatsApp e comportamento de instalação só ficam concluídos após
  teste em aparelho real, especialmente iPhone adicionado à Tela de Início.
- Antes de concluir, confirme que `.env`, segredos, dumps e artefatos gerados não
  entraram no diff.

## Graphify

O projeto usa a skill Graphify e mantém o grafo em `graphify-out/`.

- Em perguntas sobre o código, rode primeiro `graphify query "<pergunta>"` quando
  `graphify-out/graph.json` existir.
- Use `graphify path "<A>" "<B>"` para relações e `graphify explain "<conceito>"`
  para um nó específico.
- Use `graphify-out/wiki/index.md` para navegação ampla quando existir. Leia
  `GRAPH_REPORT.md` apenas para revisão arquitetural ampla ou quando query/path/explain
  não bastarem.
- Arquivos sujos em `graphify-out/` são esperados; não descarte o grafo por isso.
- Após modificar código, rode `graphify update .` (AST local, sem custo de API).
- Só ignore o grafo quando a tarefa tratar do próprio grafo desatualizado/incorreto ou
  quando o usuário pedir explicitamente.
