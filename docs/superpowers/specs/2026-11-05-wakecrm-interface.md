# WakeCRM · interface · temas, densidade e telas de referência

> Spec escrita em 04/11/2026 a partir das imagens em `docs/ref/ui/` (ver `docs/ref/README.md`)
> e do pedido do dono: "exatamente isso, na identidade verde que a gente tinha antes; nas
> configurações podem ter temas: esse rosa e o verde". **[dono]** = dito por ele;
> **[construtor]** = decisão desta spec, revisável.

## 1. Objetivo

Levar todas as telas ao visual das referências: superfícies escuras, cartões com degradê,
navegação por abas no celular e barra lateral no desktop, fila "Para avaliar", conversa com
linha do tempo, Configurações e operação, Visão geral e Pipeline com dinheiro. Tema padrão
verde **[dono]**; rosa opcional **[dono]**; densidade Grande/Médio/Pequeno (referências 02 e 03).

## 2. Tokens e temas **[construtor]**

- `src/styles.css` continua a fonte única. Novos tokens: `--gradiente-primario` (degradê
  dos KPIs, botão Enviar, item ativo, chips "Quente"), `--gradiente-primario-suave` (fundo
  de caixas "Sugestão da IA"), `--quente`, `--morno`, `--frio` (chips de temperatura),
  `--sucesso-whatsapp` (verde do ✓✓ e do status "Conectado").
- Temas por atributo em `<html data-tema="verde" | "rosa">`; modo por `.dark` (já existe)
  com `prefers-color-scheme` como padrão e opção de fixar.
  - **verde** (padrão): primária `oklch(0.55 0.16 158)` claro / `oklch(0.7 0.17 158)`
    escuro (os atuais); degradê `linear-gradient(135deg, oklch(0.45 0.15 158), oklch(0.72 0.17 150))`.
  - **rosa**: primária `oklch(0.62 0.25 15)`; degradê `linear-gradient(135deg, oklch(0.62 0.25 15), oklch(0.72 0.2 40))`
    (o rosa→laranja das imagens); fundo escuro idêntico ao do verde.
  - Escuro das referências: fundo `oklch(0.13 0.01 260)`, cartão `oklch(0.18 0.01 260)`,
    borda `oklch(1 0 0 / 8%)`. O modo claro mantém os tokens atuais.
- Densidade em `<html data-densidade="grande" | "medio" | "pequeno">`: muda
  `font-size` base (17 / 16 / 14.5 px), `--radius` (0.9 / 0.75 / 0.6 rem) e o espaçamento
  de cartões, tabelas e listas via uma escala `--espaco` (1.15 / 1 / 0.85) usada nos
  componentes de layout. Padrão `medio`.
- Preferências (tema, modo, densidade) ficam em `localStorage` (`wakecrm.preferencias`),
  aplicadas antes da hidratação por um script inline em `__root.tsx` para não piscar.
  "Se aplica a todo o CRM neste navegador" (referência 02).
- Fotos de perfil não existem: `Avatar` com iniciais, cor derivada do nome.

## 3. Shell e navegação **[construtor, a partir das referências]**

- **Desktop admin** (barra lateral, referência 02–04): Visão geral `/visao-geral`,
  Pipeline `/pipeline`, Conversas `/`, Follow-ups `/aprovar`, Vendas e comissões `/vendas`
  (fase 4; até lá o item leva a uma página "em breve" com o que já existe de `/reports`),
  Equipe `/equipe`, Configurações `/configuracoes`. Topo: sino (alertas de operação) e ajuda.
  Usuário logado no rodapé com menu (sair, tema).
- **Celular** (barra inferior, referências 01 e 05):
  - atendente: Início `/inicio`, Conversas `/meus-leads`, Follow-ups `/aprovar`, Perfil
    `/perfil` (tema, modo, instalar app, sair);
  - admin: Início `/visao-geral`, Conversas `/`, Pipeline `/pipeline`, Config. `/configuracoes`.
- Rotas antigas (`/admin`, `/kanban`, `/wf02`, `/reports`, `/followups`, `/minha-fila`,
  `/templates`) continuam no ar e acessíveis por URL até a fase 4 confirmar paridade; saem
  da navegação. `/templates` passa a ser um cartão dentro de `/configuracoes`.

## 4. Telas (todas seguem a imagem indicada em `docs/ref/README.md`)

1. **Para avaliar** `/aprovar` (ref. 01 esq.): card por tela com rolagem vertical e
   `scroll-snap`; nome grande, chip de temperatura, etapa, horas estimadas, última
   mensagem com "há X", caixa "Sugestão da IA" com Editar, botões redondos "Não enviar" e
   "Enviar", "Ver conversa completa" abrindo a conversa. Dados: `listarFilaAprovacao` /
   `decidirFollowup` (fases 2–3, Task 4); folha de motivos depois de decidir (spec das
   fases 2–3, §8).
2. **Conversa** (ref. 01 dir.): usada em `/` (admin) e `/meus-leads` (atendente): cabeçalho
   com avatar, nome, "WhatsApp · Lead", menu; chips de linha do tempo só com fatos que
   existem (cadastro = `leads.criado_em`; mudança de etapa e follow-up enviado vêm de
   `eventos_automacao`; compra/aluguel só depois da fase 4); separadores de data; bolhas
   (lead escuro à esquerda, equipe em degradê à direita com ✓✓ pelo `entrega_nivel`);
   autoria ("enviado pelo ADM", nome); caixa "Sugestão da IA" quando houver follow-up
   `aguardando_aprovacao` do lead, com os mesmos botões; `Composer` da fase 1 embaixo.
3. **Configurações e operação** `/configuracoes` (ref. 02): Tamanho da interface; Tema
   (verde/rosa) e Modo (sistema/claro/escuro) **[dono]**; Usuários (tabela editável:
   função, ativo, peso, comissão %, novo usuário); Modo de follow-up (Conservador 20/dia ×
   Aquecido 60/dia, aviso, "Confirmar alteração"); Distribuição de leads (total de peso
   ativo); Preço da hora (R$ com Editar); Status operacional (WhatsApp); Fila de eventos
   (pendentes/atrasados/falhos, reprocessar); Respostas rápidas (cartão que abre a tela);
   Vendas não conciliadas (fase 4; até lá o cartão mostra "nenhuma venda recebida ainda").
4. **Visão geral** `/visao-geral` (ref. 03): filtros Período e Vendedor; KPIs Pipeline
   cheio, Estimativa realista, Vendido no período, Comissão a pagar dia 10; Vendas por
   categoria; Pipeline por etapa; Desempenho de vendedores; Vendas recentes; Alertas de
   operações. Sem a fase 4, os blocos de vendas mostram "ainda sem vendas pelo webhook" e
   os de pipeline funcionam (valor cheio/esperado de `valorEsperado`).
5. **Pipeline** `/pipeline` (ref. 04): KPIs; faixa "Somente leitura · etapas atualizadas
   pela IA"; colunas por etapa do CRM com valor cheio/esperado; cards com nome, chip, dono,
   "~ n h", valor; clique abre o `OpportunityWorkspace` existente.
6. **Celular do atendente** (ref. 05 + 01): Início `/inicio` (comissão "Pode entrar",
   "Garantida no mês", "A pagar dia 10" — valores de comissão só na fase 4; até lá o card
   mostra o valor esperado dos leads dele e "comissão em breve"; ações rápidas Follow-ups e
   Conversas; Ranking da semana na fase 4); Conversas `/meus-leads` (busca, chips Todas /
   Não lidas / Follow-ups / Quentes, lista como a referência); Perfil `/perfil`.
7. **Equipe** `/equipe`: a tabela de usuários de `/admin` (cadastro, ativo, peso, %,
   aparelhos, push de teste) no visual novo. Mesmo conteúdo, nova pele.

## 5. Fora de escopo

Dinheiro de vendas e comissão (fase 4) — as telas nascem com os espaços e mostram estado
"em breve/sem dados". Arrastar card. Fotos de perfil.

## 6. Testes

Preferências (ler/gravar/defaults), escala de densidade (valores por nível), cor do avatar
por nome (determinística), montagem da linha do tempo da conversa (só fatos existentes),
filtros da lista de conversas (puros). Telas: `bun run build` e revisão visual por
captura de tela no navegador (skill de navegador) quando disponível.
