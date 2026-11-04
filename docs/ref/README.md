# Referências de interface (WakeCRM)

Imagens enviadas pelo dono em 04/11/2026 como **referência exata** de como as telas devem
ficar. Regra dada junto com as imagens:

> "Exemplos das telas como devem ser, só que na identidade verde que a gente tinha antes.
> Nas configurações podem ter temas: esse rosa e o verde."

Ou seja:

1. **Layout, hierarquia, componentes e textos** seguem as imagens.
2. **Tema padrão é o verde** já existente no app (`src/styles.css`: `--primary
   oklch(0.55 0.16 158)` no claro e `oklch(0.7 0.17 158)` no escuro; acento `oklch(0.94 0.05
   155)`). Onde a referência usa o degradê rosa→laranja (cards de KPI, botão "Enviar", item
   ativo da navegação, chips "Quente"), o tema verde usa um degradê equivalente em verde
   (escuro → claro, mesma direção), nunca rosa.
3. **O rosa das imagens vira um tema opcional**, escolhido em Configurações, ao lado do verde.
   Os dois temas trocam só os tokens de cor; nada de layout muda.
4. As imagens são **escuras** (superfícies pretas/grafite). O app deve ter o modo escuro
   igual às referências e um modo claro coerente com os mesmos tokens; o padrão segue a
   preferência do sistema, e Configurações permite fixar.
5. Densidade da interface (Grande / Médio / Pequeno) existe em Configurações, como na
   referência 02 e 03, e vale para o navegador inteiro.

Os números, nomes e fotos das imagens são inventados. Fotos de perfil não existem no CRM:
usar avatar com iniciais (componente `Avatar` já existente) no lugar.

## Arquivos (`docs/ref/ui/`)

| Arquivo | O que mostra |
|---|---|
| `01-mobile-para-avaliar-e-conversa.png` | Celular. Esquerda: **"Para avaliar"** (fila de aprovação de follow-ups): título, subtítulo "Leads que precisam de uma ação", contador "1 de 12"; card com nome grande, chip de temperatura com chama ("Quente"), etapa ("Atendimento"), horas ("4 horas"), bloco "Última mensagem · há 4 horas" com o texto entre aspas; caixa **"Sugestão da IA"** com botão "Editar" e o texto; dois botões redondos grandes **✕ Não enviar** (escuro) e **➤ Enviar** (degradê); botão largo "Ver conversa completa ›"; barra inferior Início / Leads / Perfil. Direita: **conversa** do lead: cabeçalho com avatar, nome, "WhatsApp · Lead", menu ⋮; linha do tempo com chips de eventos ("Cadastro realizado · 12 jan, 10:24", "Compra · pacote 4 horas", "Aluguel · 1 hora"); separadores de data; bolhas do lead (escuras, à esquerda) e da equipe (degradê, à direita, com ✓✓); caixa "Sugestão da IA" com "Editar" e os mesmos dois botões. |
| `02-admin-configuracoes-e-operacao.png` | Desktop admin, **"Configurações e operação"**. Barra lateral: logo, Visão geral, Pipeline, Conversas, Follow-ups, Vendas e comissões, Equipe, Configurações; usuário logado embaixo. Cartões: **Tamanho da interface** (Grande/Médio/Pequeno com miniaturas); **Usuários** (tabela: nome com avatar de iniciais, função em select, ativo em switch, peso de distribuição, comissão %, menu ⋯; botão "+ Novo usuário"); **Modo de follow-up** (Conservador 20/dia × Aquecido 60/dia como cartões selecionáveis, aviso laranja "este modo aumenta significativamente o volume…", nota "o limite é redefinido automaticamente à meia-noite", botão "Confirmar alteração"); **Distribuição de leads** (total de peso ativo); **Comissão/Preço** (valor grande R$ 360,00 com "Editar" — no WakeCRM é o **preço da hora**); **Status operacional** (WhatsApp conectado, número, "Gerenciar conexão"); **Fila de eventos** (Pendentes / Atrasados / Falhos + "Reprocessar fila"); **Vendas não conciliadas** (tabela com "Vincular a um lead"). |
| `03-admin-visao-geral.png` | Desktop admin, **"Visão geral"**. Topo: seletor de densidade, sino, ajuda. Filtros **Período** e **Vendedor**. Quatro KPIs em degradê: Pipeline cheio (leads ativos), Estimativa realista (% de probabilidade), Vendido no período (n vendas), Comissão a pagar dia 10. **Vendas por categoria** (Follow-up, Atendimento, Recompra, Espontânea: valor, % e quantidade). **Pipeline por etapa** (funil horizontal com leads, valor total e valor esperado por etapa — no WakeCRM as etapas são as do CRM: Novo Lead, Atendimento, Link enviado, Aguardando pagamento, Agendado, Aula realizada, Follow-up). **Desempenho de vendedores** (ranking com medalhas, vendas, valor, % do total, total da equipe). **Vendas recentes** (tabela). **Alertas de operações** (aprovações pendentes, vendas não conciliadas, follow-ups em atraso, com botões de ação). |
| `04-admin-pipeline.png` | Desktop admin, **"Pipeline"** (o Kanban). Mesmos KPIs; faixa "Pipeline de vendas · Somente leitura · etapas atualizadas pela IA"; colunas por etapa com cabeçalho em degradê (nome + "n leads"), linhas "Valor cheio" e "Valor esperado", cards com nome, chip de temperatura, dono, "~ 4 h" e valor. |
| `05-mobile-conversas-painel-pipeline-config.png` | Celular, quatro abas (Início / Conversas / Pipeline / Config.): **Conversas** (busca, chips Todas / Não lidas / Follow-ups / Quentes, lista com avatar, nome, chip de temperatura, última mensagem, hora e contador); **Meu painel** (card degradê "Pode entrar" com a comissão estimada, "Garantida no mês", "A pagar dia 10", ações rápidas Follow-ups / Conversas, Ranking da semana); **Pipeline** (KPIs e colunas roláveis com "+ n leads", "Taxa de conversão"); **Configurações** (lista: Time, Distribuição de leads, Comissões, Modo de follow-up com segmento Conservador/Aquecido, Preço por hora, WhatsApp, Fila de eventos, Vendas sem responsável). |
| `05b-variante-anterior-mobile-com-aba-painel.png` | Variante anterior da 05, com cinco abas (inclui "Painel") e "Ranking de vendas da semana" com contagem de vendas. Serve só de comparação; vale a 05. |

## Como usar

- Qualquer tela nova ou reformada parte destas imagens. Em dúvida entre a imagem e um
  componente atual, vale a imagem (com o tema verde).
- As decisões de tokens, temas e densidade estão na spec
  `docs/superpowers/specs/2026-11-05-wakecrm-interface.md`; o plano de execução em
  `docs/superpowers/plans/2026-11-05-wakecrm-interface.md`.
- `docs/design.md` aponta para esta pasta.
