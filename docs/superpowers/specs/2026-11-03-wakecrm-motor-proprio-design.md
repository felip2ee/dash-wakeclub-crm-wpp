# WakeCRM · motor próprio, sem n8n

> Design escrito em 03/11/2026 a partir da conversa com o dono do produto (Felipe).
> Marcação: **[decidido]** = dito pelo dono; **[minha decisão]** = escolha de quem
> escreveu o design, revisável; **[construtor]** = deixado para quem implementar.
> Idioma do projeto: português (BR) em tela, comentário e nome de coluna.

## 1. Intenção

A Wake Club (escola de wakeboard/wakesurf em Palmas) vende pelo WhatsApp. Até agosto
de 2026 o CRM era movido por workflows n8n (WF-01 a WF-11) e este painel era só
espelho. **Os workflows estão parados hoje**, e a operação está sem CRM. O objetivo é
voltar a operar o quanto antes, agora com o próprio app como motor: um container,
o Postgres que já existe, nada mais.

O app passa a se chamar **WakeCRM**. A atendente trabalha de casa por ele (PWA no
celular ou desktop): vê só as conversas dela, responde por ali, aprova follow-ups
escritos pela IA numa fila estilo Reels e enxerga quanto pode ganhar de comissão.
O admin vê o funil inteiro em dinheiro, vendas por vendedor e por origem, e paga
comissão.

Por que importa: a IA que qualifica e escreve follow-up é "o coração do CRM"
**[decidido]**; sem ela lead esfria. E o vendedor ver a comissão estimada "alegra o
cara" **[decidido]**: é ferramenta de motivação, não enfeite.

## 2. Esta decisão substitui regras anteriores

`AGENTS.md`, `ESPEC-PAINEL-EQUIPE.md` e `docs/architecture.md` dizem que o
painel nunca escreve no CRM e nunca chama a Evolution. **Isso deixa de valer.** O dono
decidiu que o app assume todas as responsabilidades do n8n **[decidido]**. A primeira
fase atualiza `AGENTS.md` (seção "Responsabilidade dos dados" e "Semântica") para
refletir este documento. O que continua valendo dessas fontes:

- `usuarios.senha_hash` nunca sai do servidor;
- segredos só no `.env`, `.env.example` com placeholder;
- autorização validada no servidor (vendedor só acessa lead dele);
- Zod nas fronteiras, casts SQL explícitos, datas em `America/Sao_Paulo`;
- stack atual (TanStack Start, React 19, Nitro, Bun, `pg`, Tailwind v4, shadcn/ui);
  reutilizar telas e componentes existentes (Kanban, `Thread`/`Bolha`,
  `OpportunityWorkspace`, `/minha-fila`, push, login).

`plan(2).md` continua sendo referência de UX (oportunidade no centro, workspace),
mas onde ele presume n8n como motor, este documento manda.

**n8n nunca volta a rodar em paralelo.** Dois motores escrevendo no mesmo lead
brigam. Quando o WakeCRM receber o webhook, os workflows ficam desligados de vez.

## 3. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
1. Atendimento volta a funcionar pelo app: receber e enviar texto, áudio, foto,
   vídeo, documento, localização e templates via Evolution Go.
2. Distribuição de leads por peso, com lead "pra sempre" do vendedor.
3. IA de volta: transcrição, qualificação, porteiro e redator de follow-up.
4. Fila de aprovação de follow-ups (Reels + motivo) com modos de ritmo.
5. Vendas por webhook, categorizadas, com comissão por vendedor.
6. Kanban e painéis com dinheiro: pipeline, esperado, vendido, comissão.

**Não-objetivos (agora)**
- Arrastar card no Kanban. **Só a IA move lead de etapa** **[decidido]**.
- Recalibrar automaticamente as probabilidades por etapa (fica para quando houver
  histórico de vendas; ver §10).
- Ler ou escrever labels do WhatsApp (o WF-08 "Labels" ficou pela metade e é
  descartado **[minha decisão]**).
- Mais de um número de WhatsApp. É um número só para todo mundo **[decidido]**.
- IA respondendo o lead sozinha, sem humano.
- Treinar modelo. "Aprender" = memória no prompt (§7.5).
- Importar o histórico do período parado (agosto até a virada). Fica para depois,
  feito por um agente de IA que adapta os dados às tabelas novas **[decidido]**.

**Anti-objetivos (falha mesmo que "funcione")**
- Perder mensagem ou evento num pico de webhook.
- Qualquer follow-up sair sem um humano ter tocado "Enviar".
- Disparo fora do horário comercial ou em rajada que queime o número.
- Vendedor ver lead, conversa ou comissão de outro (exceto o ranking semanal).
- Comissão calculada errada em silêncio.
- Dois motores (n8n + app) ativos ao mesmo tempo.

## 4. Arquitetura

Um processo Nitro (o app atual) faz três coisas:

1. **Servir o app** (como hoje).
2. **Receber webhooks** e só enfileirar.
3. **Trabalhadores e tarefas agendadas** dentro do mesmo processo.

Sem Redis, sem fila externa, sem n8n **[decidido: "funcione sem nada"]**. Tudo
no Postgres `wakeclub`, schema `wakeclub`, mantendo os dados atuais (leads,
mensagens, followups, usuários) **[minha decisão]**.

### 4.1 Fila de entrada (webhooks)

- Endpoints:
  - `POST /api/webhooks/evolution`: Evolution Go;
  - `POST /api/webhooks/vendas`: sistema de vendas.
  Cada um autenticado por segredo próprio (header ou token na URL, conforme o que o
  emissor suportar), comparado de forma resistente a timing, 404 quando inválido.
- O endpoint **só grava o corpo bruto** numa tabela de entrada (`webhook_eventos`:
  origem, recebido_em, corpo jsonb, status, tentativas, próxima_tentativa_em, erro,
  chave_ordem) e responde 200. Não processa nada na requisição.
- `chave_ordem` = telefone/conversa quando dá pra extrair barato do corpo; vazio
  quando não dá.
- Trabalhador: pega lotes com `FOR UPDATE SKIP LOCKED`, em ordem de chegada.
  **Eventos com a mesma `chave_ordem` são processados estritamente em sequência**
  **[decidido: "fila sequencial"]**. Conversas diferentes rodam em paralelo, até 4
  ao mesmo tempo **[minha decisão]**.
- Falha: volta pra fila com espera crescente, até 5 tentativas, depois status
  `falhou`, visível e reprocessável pelo admin. Nada some **[minha decisão]**.
- Processamento idempotente: reprocessar o mesmo evento não duplica mensagem/venda.
- Eventos órfãos (`processando` há mais de 15 min) voltam pra `pendente`, como os
  workflows já faziam.

### 4.2 Tarefas agendadas

Rodam no processo com intervalo e trava no banco (advisory lock ou linha de
controle), para que duas réplicas nunca executem a mesma tarefa ao mesmo tempo:

| Tarefa | Origem | Intervalo de referência |
|---|---|---|
| Transcrição de áudio | WF-11 | 1 min |
| Qualificador | WF-02 | 1 min (debounce por `qualificar_apos`) |
| Porteiro + redator | WF-03 | 15 min |
| Envio de follow-ups aprovados | novo | 1 min |
| Distribuição (varredura de soltos) | WF-08 | 5 min |
| Heartbeat do número | WF-07 | 5 min |
| Push (fila `notificacoes`) | WF-09 | 1 min |

Os intervalos exatos são **[construtor]**; o que não pode mudar é o comportamento
descrito em §5–§8.

### 4.3 Evolution Go

O número hoje está na Evolution API 2.3.7; vamos para o **Evolution Go**
**[decidido]**, que tem rotas e formato de webhook diferentes. **Não chutar o
formato pela documentação.** Passo obrigatório antes de escrever o normalizador:

1. Subir o endpoint de §4.1 gravando bruto.
2. O dono aponta a instância Evolution Go para ele e manda testes: texto recebido,
   texto enviado pelo celular, áudio, imagem, vídeo, documento, localização,
   confirmação de entrega/leitura, queda/reconexão.
3. A partir dos corpos reais, escrever um adaptador isolado (`src/server/evolution/`
   ou equivalente) com: normalizar evento, enviar (texto/mídia/localização), baixar
   mídia, estado da conexão. O resto do sistema só conhece o formato normalizado.

URL e chave da instância ficam no `.env`.

### 4.4 Banco e permissões

- O schema hoje vive dentro do workflow n8n "db setup". O app passa a ser dono dele:
  migrações SQL versionadas no repositório, aplicadas por script (evoluir
  `scripts/painel-db.mjs` ou similar) **[minha decisão]**. Formato **[construtor]**.
- O app precisa de uma role com escrita nas tabelas do motor. As roles atuais
  `painel_ro`/`painel_rw` podem ser mantidas para leitura de telas ou substituídas;
  **[construtor]**, desde que `senha_hash` continue fora de qualquer view.

## 5. Mensagens e atendimento

### 5.1 Entrada (porta do WF-01)

Portar a lógica do WF-01 (`~/Downloads/wakeclubcrm · WF-01 Ingestor Evolution.json`,
a copiar para `docs/n8n-legado/` na fase 1) adaptada ao formato do Evolution Go:

- telefone em E.164, com o 9º dígito brasileiro; resolver `@lid` pelo número real;
- descartar grupo, status e canal;
- extrair texto/tipo de mídia (desembrulhar efêmera, visualização única, editada);
- upsert do lead por telefone; mensagem idempotente pelo id da Evolution;
- opt-out por regex (determinístico, não IA): `opt_out = true`, etapa
  "Negociação encerrada", nunca mais recebe follow-up;
- toda mensagem nova: atualiza `ultima_msg_lead_em`/`ultima_msg_equipe_em`, zera
  `n_toques` se foi o lead, **cancela follow-up pendente ("conversa viva")** e agenda
  `qualificar_apos = now() + 2 min`;
- áudio entra com `transcricao_status = 'pendente'`.

### 5.2 Autoria

- Mensagem enviada **pelo app** guarda quem enviou (`usuario_id`) e o id devolvido
  pela Evolution. Quando o eco desse envio volta pelo webhook, casa pelo id e não
  duplica.
- Mensagem `fromMe` que **não** saiu do app (alguém usou o celular do número)
  aparece como **"enviado pelo ADM"** **[decidido]**.
- Mensagem de follow-up aprovado guarda o `followup_id`.

### 5.3 Saída

O vendedor envia pelo app **[decidido]**: texto, áudio gravado na hora, foto,
vídeo, documento, localização e templates. Digitar `/` no campo abre as respostas
rápidas (templates cadastrados em `/templates`) **[decidido]**.

- Áudio precisa chegar como mensagem de voz (OGG/Opus). Confirmar no teste se o
  Evolution Go converte ou se o app converte. **[construtor]**
- Mídia recebida: imagem e vídeo abrem no app, áudio toca com a transcrição
  embaixo, documento baixa **[minha decisão]**. Guardar mídia em volume local ou
  buscar sob demanda na Evolution: **[construtor]**, conforme a retenção do
  Evolution Go.
- Envio de mensagem livre (atendimento) não respeita cota nem horário: é humano
  respondendo. Cota e horário valem só para follow-up (§7).

### 5.4 Quem vê o quê

- Vendedor: só conversas dos leads atribuídos a ele. Responde só nelas.
- Admin: todas as conversas; pode responder qualquer uma.
- **Sem assinatura no WhatsApp [decidido]:** o lead nunca vê quem escreveu. O nome
  do autor aparece só dentro do app.
- Lead sem dono só aparece pro admin.

### 5.5 Saúde do número (porta do WF-07)

Ack de entrega (`entrega_nivel` com `greatest`, porque chega fora de ordem), estado
da conexão, QR pendente e heartbeat periódico, alimentando `instancia_estado`,
`instancia_eventos` e o alerta global que já existe (`v_saude_numero`). Adaptar aos
eventos do Evolution Go.

### 5.6 Transcrição (porta do WF-11)

Fila em `mensagens.transcricao_status`, até 3 tentativas, órfãs voltam após 15 min.
Baixa o áudio pelo adaptador, transcreve (OpenAI, `language: pt`), **sobrescreve
`mensagens.texto`** e empurra `qualificar_apos` do lead para que a qualificação use
a transcrição. Transcreve também áudio da equipe.

## 6. Distribuição de leads

Regras **[decididas]**:

- Lead que já teve dono **é desse vendedor pra sempre**, enquanto ele estiver ativo.
  Mensagem nova de lead com dono nunca passa pela distribuição.
- Lead que cita um vendedor pelo nome ("quero comprar com a Tâmara") vai direto pra
  ele, sem passar pela distribuição.
- Quando o vendedor é desativado, os leads dele **voltam pra distribuição**.
- Cada vendedor tem um **peso**: peso 2 recebe dois leads novos para cada um do
  peso 1.

Como funciona **[minha decisão]**:

- A atribuição acontece **na entrada da mensagem** (no processamento do evento),
  não a cada 5 min. A varredura periódica só cuida dos leads soltos por desativação.
- Escolha: vendedor ativo com o menor `recebidos_por_distribuição_nos_últimos_30d ÷
  peso`; empate vai pra menor carga ativa e depois para aleatório. Quem fica uns dias
  fora volta e recebe mais até equilibrar.
- Peso 0 = pausado: não recebe lead novo, mantém os dele.
- Menção ao nome: só vale para lead **sem dono**; compara o primeiro nome dos
  vendedores ativos, sem acento e sem diferenciar maiúscula, como palavra inteira.
  Lead com dono que cita outro nome continua com o dono. Atribuição por menção
  **não conta** na conta do peso. O admin vê "atribuído por menção" e pode corrigir.
  Nome ambíguo (dois vendedores com o mesmo primeiro nome) cai na distribuição normal.
- Mantém o corte do WF-08: lead solto sem movimento há 90 dias não é redistribuído
  até voltar a falar.
- Toda mudança de dono vira evento em `eventos_automacao` (`assignment_changed`),
  com o motivo: rodízio, menção, desativação ou correção do admin.

## 7. IA e follow-up

Fica na OpenAI com os mesmos modelos e prompts dos workflows (gpt-5.4-mini no
qualificador e porteiro, gpt-5.4 no redator), para não perder a calibração já feita
**[minha decisão]**. Chave no `.env`. Prompts portados **literalmente** dos JSON
(`docs/n8n-legado/` na fase 1), com `versao_prompt` nova quando mudarem.

Toda saída de LLM passa por validação em código antes de tocar no banco (como os
nós "Validar" dos workflows). Toda decisão vira linha em `eventos_automacao` no
mesmo comando que muda o dado. Nunca guardar raciocínio do modelo.

### 7.1 Qualificador (porta do WF-02)

Igual ao WF-02: reivindica leads com `qualificar_apos` vencido, manda as últimas 40
mensagens e a ficha, recebe etiqueta, temperatura, interesse, objeção,
data_agendada, resumo, justificativa e follow-up opcional; valida; cancela
pendente e agenda o novo; em falha reagenda +10 min.

**Mudança:** o qualificador passa a devolver também `horas_estimadas` (inteiro),
seguindo a regra do artefato de pipeline: pacote de 4h vira 4h, "2 pessoas" vira
2h, pacote sem tamanho vira 4h, sem sinal vira 1h, teto de 8h **[minha decisão]**.
Isso alimenta o valor do lead (§9.1).

### 7.2 Porteiro e redator (porta do WF-03)

Igual ao WF-03: porteiro (default deixar passar, pode barrar ou reagendar) e redator
(modo REABRIR/RETOMAR calculado em código, lista de links permitidos só com
`/agendar` e `/carteira`, sem emoji, sem travessão, 10 a 600 caracteres). Só
roda das 8h às 19h59 de São Paulo, nunca com `opt_out` ou `sem_atendimento`, nunca
em lead sem dono. Erro reagenda +30 min.

**Mudança:** quando o texto fica pronto, o follow-up entra na **fila de aprovação**
do dono do lead (§7.4) e gera push "follow-up pronto" (agrupado, como o WF-09).

### 7.3 Modos de ritmo

Na tela de setup do admin **[decidido]**:

- **Conservador:** até **20** follow-ups preparados por dia **[minha decisão]**, ao
  longo do dia.
- **Aquecido:** até **60** por dia **[decidido]**, para dia de fechamento. A tela
  avisa que é "modo perigoso" e pede confirmação para ligar.

Detalhes **[minha decisão]**:
- O Aquecido **volta sozinho para Conservador à meia-noite** (São Paulo). Esquecer
  ligado queima o número.
- Follow-up preparado e não decidido até 19h59 do mesmo dia **expira** (status
  próprio, sai da fila); o lead segue no ciclo normal de requalificação. Assim um
  vendedor parado não trava a cota dos colegas no dia seguinte, e texto velho nunca
  sai.
- A cota é do **número inteiro**, não por vendedor (quem corre risco é o número).
- Conta follow-ups **preparados pelo redator** no dia (São Paulo). Bateu a cota, os
  vencidos esperam o dia seguinte, os de maior valor esperado primeiro.
- Envio de aprovados respeita intervalo mínimo entre disparos de follow-up (ex.:
  2 min no conservador, 45 s no aquecido; valores **[construtor]**) e a janela de
  8h às 19h59. Aprovado fora da janela sai na abertura da próxima.

### 7.4 Fila de aprovação (tela)

Mockup escolhido: **A + C** (arquivo `.superpowers/brainstorm/.../fila-followup.html`)
**[decidido]**:

- Um card por tela, rola pra cima pro próximo (Reels).
- O card mostra: nome, temperatura, etapa, horas e valor estimado, número do
  toque, últimas mensagens da conversa (com autor), e o texto que a IA quer
  mandar, com o modo (REABRIR/RETOMAR). Tocar no texto edita.
- Dois botões grandes: **Não enviar** e **Enviar**.
- Depois de decidir, sobe uma folha com motivos prontos e um campo livre:
  - recusa: Cedo demais, Tom errado, Já falei com ele, Repetiu assunto, Lead não
    quer, Outro;
  - envio: Texto certo, Lead quente, Ajustei o texto, Outro.
  Os motivos são opcionais, e "Pular" fecha sem registrar **[minha decisão]**.
- Vendedor vê só a fila dele. O admin pode ver a de qualquer vendedor.
- Se o lead mandar mensagem antes da aprovação, o follow-up é cancelado (conversa
  viva) e some da fila.
- Recusar: follow-up vira `abortado` pelo humano. O qualificador agenda o próximo
  na próxima requalificação, como já fazia.

Reaproveitar `/minha-fila` e `/followups` onde fizer sentido; o fluxo antigo de
"abrir no WhatsApp" (wa.me + `followup_toques`) é substituído pelo envio direto.

### 7.5 Aprendizado com o motivo

Cada decisão grava uma avaliação: follow-up, vendedor, enviar/recusar, motivos,
texto livre, texto original da IA e texto enviado (se foi editado).

O redator e o porteiro recebem no prompt as últimas avaliações relevantes
**[minha decisão]**: até 10 do próprio vendedor e até 10 recusas gerais recentes,
no formato "texto que a IA sugeriu → decisão → motivo". Também recebem os pares
original/editado, que mostram o tom que o vendedor prefere. A quantidade e o
formato ficam com o **[construtor]**. Mudou o prompt, muda a `versao_prompt`.

## 8. Vendas e comissão

### 8.1 Webhook de vendas

O sistema de vendas manda um webhook a cada venda; o vendedor não marca nada
**[decidido]**. O formato só será conhecido no envio de teste **[decidido]**:
primeiro o endpoint grava bruto (§4.1), depois se modela a tabela `vendas` a
partir do corpo real. Campos que precisamos achar nele: id da venda, data/hora da
compra, valor, CPF, telefone, produto/horas, status (paga/estornada).

### 8.2 Cruzamento com o lead

**[decidido: CPF ou telefone]**
1. CPF: casa com `leads.cpf` (coluna nova).
2. Senão, telefone normalizado como em §5.1; ao casar, grava o CPF no lead para as
   próximas compras.
3. Sem casamento: vai para **"vendas sem dono"**; o admin liga a venda a um lead
   na mão **[minha decisão]**.

### 8.3 Categoria da venda

Testadas nesta ordem; janela de **48h antes da compra** **[decidido]**:

1. **Follow-up:** um follow-up desse lead foi aprovado e enviado nas 48h.
2. **Atendimento:** houve mensagem da equipe pro lead nas 48h (pelo app ou "pelo
   ADM").
3. **Recompra:** nenhuma interação nas 48h e o lead já tinha venda anterior.
4. **Espontânea:** nenhuma interação nas 48h e é a primeira compra.

### 8.4 Comissão

- Só **Follow-up** e **Atendimento** pagam comissão. **Recompra** e **Espontânea**
  não pagam **[decidido]**, mas entram no faturamento e nos relatórios.
- O vendedor da comissão é o dono do lead no momento da venda, e o % é o dele
  naquele momento. Os dois ficam gravados na venda: mudar o % depois não altera venda
  passada **[minha decisão]**.
- O % de cada vendedor é configurado no super admin **[decidido]**.
- Pagamento **todo dia 10**, referente às vendas do mês anterior inteiro (1º ao
  último dia, São Paulo) **[decidido o dia; período é minha decisão]**.
- **Fechamento [minha decisão]:** no dia 10 o admin vê o fechamento do mês anterior
  por vendedor e marca "pago". Mês pago fica congelado.
- Estorno: estorno de venda de mês ainda não pago só tira a venda do cálculo.
  Estorno de venda de mês já pago vira **lançamento negativo** no próximo
  fechamento do mesmo vendedor, visível pra ele e pro admin. Nada é descontado em
  silêncio. A regra final depende do payload (§11).

## 9. Kanban e painéis

### 9.1 Valor de um lead (modelo do artefato de pipeline)

- Valor cheio = `horas_estimadas × preço da hora`. O preço começa em **R$ 360** e
  pode ser configurado no setup.
- Chance de fechar por etapa × temperatura, vinda do artefato e guardada como
  configuração:

| Etapa | quente | morno | frio |
|---|---|---|---|
| Aguardando pagamento | 70% | 70% | 70% |
| Link enviado | 40% | 20% | 20% |
| Follow-up | 30% | 15% | 5% |
| Atendimento | 25% | 12% | 4% |
| Novo Lead | 5% | 5% | 5% |

  Etapas fora da tabela (Agendado, Aula realizada) e lead sem temperatura:
  **[construtor]** define, documentando na tela de "como estimamos".
- Valor esperado = cheio × chance.
- Fora do pipeline: opt-out, Negociação encerrada, Aula realizada, agendado no
  passado, `sem_atendimento`.
- A tela explica que as chances são premissas, não histórico.

### 9.2 Kanban do admin

Mockup: `kanban-paineis.html`. Colunas aprovadas **[decidido]**.

- Só leitura: só a IA move. Sem arrastar para ninguém **[decidido]**.
- Filtros: vendedor e período das vendas.
- Números do topo:
  - pipeline cheio (e leads ativos);
  - estimativa realista;
  - vendido no período;
  - vendas por categoria, em valor e em quantidade (as quatro de §8.3);
  - **comissão a pagar no dia 10**.
- Cada coluna mostra a quantidade de leads, o valor cheio e o esperado. Cada card
  mostra o dono.
- Abrir o card abre o `OpportunityWorkspace` que já existe.

### 9.3 Painel do vendedor (celular)

- **Comissão que pode entrar:** soma do esperado dos leads ativos dele × % dele.
- **Já garantida no mês:** vendas comissionáveis do mês corrente × %.
- **A pagar dia 10:** as vendas comissionáveis do mês anterior.
- Atalhos: follow-ups pra aprovar e conversas esperando resposta.
- **Ranking semanal** contra os colegas **[decidido]**, de segunda a domingo,
  ordenado pelo valor vendido comissionável na semana **[minha decisão]**. É a
  única coisa de outro vendedor que ele vê.

### 9.4 Super admin / setup

Só existem dois papéis, `admin` e `atendente` (= vendedor) **[decidido]**. "Super
admin" é a área de configuração do `admin` de hoje, não um papel novo. Só
`atendente` entra na distribuição e ganha comissão, como no WF-08 atual **[minha
decisão]**.

- Usuários:
  - campos: nome, usuário, senha, papel, ativo, **peso** e **% de comissão**
    **[decidido]**;
  - desativar usuário dispara a redistribuição dos leads dele.
- Ritmo: conservador ou aquecido (§7.3).
- Preço da hora.
- Estado do número (o que já existe).
- Monitor da fila: eventos pendentes, atrasados, com falha e "reprocessar".
- Vendas sem dono, para ligar a um lead.

### 9.5 Push

Mantém o WF-09 (agrupado por pessoa e tipo, `tag` substitui o não lido). Avisos:
follow-up pronto pra aprovar e, **[minha decisão]**, mensagem nova de lead do
vendedor quando o app não está aberto.

## 10. Fases

Ordem pensada para voltar a operar logo **[minha decisão]**. Cada fase termina
utilizável em produção.

1. **Atendimento volta.**
   - Copiar os JSON do n8n para `docs/n8n-legado/` e atualizar `AGENTS.md`.
   - **Corte na virada [decidido]:** cancelar todos os follow-ups pendentes antigos
     e zerar `qualificar_apos` de todos os leads, com evento de auditoria. Um lead
     antigo só volta a ser qualificado quando mandar mensagem nova. Os donos atuais
     (`atendente_id`) ficam como estão.
   - Fila de entrada e endpoint bruto; captura do Evolution Go; adaptador.
   - Entrada de mensagens (§5.1), autoria, envio de todos os tipos de mídia e
     templates com `/`, saúde do número.
   - Distribuição por peso e menção; peso e % no super admin.
   - Push de mensagem nova.
2. **IA de volta.** Transcrição, qualificador com `horas_estimadas`.
3. **Follow-up.** Porteiro e redator, modos de ritmo, fila A+C, avaliações no
   prompt, envio com cadência.
4. **Dinheiro.**
   - Webhook de vendas: captura, modelagem e cruzamento.
   - Categorias, comissão e dia 10.
   - Kanban com valores, painel do vendedor e ranking semanal.

Depois, fora deste escopo: recalibrar as chances com a conversão real por etapa e
temperatura.

## 11. Pendências que dependem de dado real

- Formato dos eventos do Evolution Go: envio, mídia, ack, conexão e conversão de
  áudio (fase 1).
- Formato do webhook de vendas e se ele traz estorno (fase 4).
- Retenção de mídia no Evolution Go, que decide entre guardar a mídia ou buscar sob
  demanda.

## 12. Deixado para o construtor

- Formato das migrações, nomes finais de tabela e coluna, e índices.
- Intervalos das tarefas e do disparo de follow-up, dentro do que §4.2 e §7.3
  pedem.
- Mecanismo de trava das tarefas.
- Componentização das telas novas, reaproveitando o que existe.
- Testes: lógica nova não trivial leva teste, principalmente distribuição por peso,
  categoria da venda, comissão, cota de ritmo e o normalizador de eventos.
