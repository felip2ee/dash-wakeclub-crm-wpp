# WakeCRM · Vendas diretas por Pix lidas do WhatsApp

Data: 08/11/2026. Status: aprovado pelo dono (08/11/2026).

## 1. Intenção

Parte das vendas sai fora do app: o lead paga por Pix e manda o comprovante na conversa. Hoje
essas vendas não entram no CRM, então o faturado, a meta do dia, a comissão e a etapa do aluno
ficam errados. O dono quer que o sistema perceba o comprovante sozinho, entenda a compra pela
conversa e registre a venda, perguntando ao admin só o que não tiver certeza.

## 2. Decidido pelo dono (07–08/11/2026)

- Duas origens de venda: **app** (webhook de vendas) e **direta** (Pix na conversa). O faturado
  soma as duas e mostra cada uma separada.
- **Automático**: o sistema identifica o comprovante, analisa e deduz as horas pela conversa.
- O que não tiver certeza vira **pergunta ao admin**; só o admin confirma.
- **Pacotes avulsos de 1, 2 ou 4 horas.**
- A chave Pix / CNPJ da Wake fica num campo em Configurações (seção do admin), preenchido depois.

## 3. Fluxo

1. Chega do **lead** uma mensagem de `tipo` `imagem` ou `documento` (PDF).
2. Tarefa `comprovantes` (motor, a cada 2 min, só com IA disponível) baixa a mídia pela
   Evolution (`baixarMidia`) e pede à IA, com visão, que diga se é um comprovante de Pix e
   extraia: valor, data/hora, nome de quem pagou, nome/chave/CNPJ de quem recebeu, banco e o
   identificador da transação (E2E / ID da transação), cada um com confiança.
3. Não é comprovante → marca e encerra (sem custo extra).
4. É comprovante → a IA recebe as últimas mensagens da conversa (texto e transcrições) e a
   tabela de pacotes, e responde quantas horas foram compradas e por quê.
5. Decisão:
   - **Registra sozinho** quando tudo vale: comprovante legível; recebedor confere com a chave
     ou o CNPJ configurado; valor igual ao preço de **exatamente um** pacote configurado e as
     horas deduzidas da conversa batem com ele; data do pagamento nos últimos 3 dias; o
     identificador da transação ainda não existe em nenhuma venda; o lead tem dono.
   - **Pergunta ao admin** em qualquer outro caso, com tudo já preenchido e o motivo da dúvida
     (ex.: "valor R$ 700 não bate com nenhum pacote", "recebedor não confere", "chave Pix da Wake
     não configurada").
6. Venda registrada (sozinha ou pelo admin) entra como venda **paga, origem `pix`**, ligada ao
   lead e ao dono do lead, e faz o mesmo que uma venda paga do app ligada ao lead: entra no
   faturado e na meta do dia, gera comissão pelas regras atuais, leva o lead a **Aluno com
   horas** e soma as horas no saldo.

## 4. Perguntas ao admin ("Vendas para confirmar")

- Lista no admin, em **Dinheiro**, acima das vendas, com contador; o admin também recebe
  notificação push ("Comprovante para confirmar: <lead>, R$ <valor>").
- Cada item mostra: miniatura do comprovante (abre grande), lead e dono, o que a IA leu, as horas
  sugeridas com o trecho da conversa que a levou à conclusão e o motivo da dúvida.
- Ações: **Confirmar** (como está), **Corrigir e confirmar** (valor, horas, data, lead) e
  **Não é venda** (com motivo). Confirmar registra a venda como no §3.6.
- Item respondido sai da lista. Um item sem resposta continua na lista (não expira).

## 5. Configurações (admin)

Novo cartão **"Venda direta por Pix"**:

- Chave Pix da Wake (texto) e CNPJ da Wake (texto), ambos opcionais e vazios no início.
- Preço de cada pacote: 1 h, 2 h e 4 h (R$), vazios no início.
- Enquanto chave/CNPJ ou preços estiverem vazios, **nada é registrado sozinho**: todo
  comprovante vira pergunta ao admin, com o motivo "configure a chave Pix e os preços".

## 6. Faturado por origem

- `vendas.origem_externa` ganha o valor `pix` (o webhook continua `webhook`). Na tela:
  **"App"** = `webhook`, **"Direta"** = `pix`.
- Visão geral e Dinheiro mostram o faturado total e a divisão App / Direta no período; a lista
  de vendas mostra a origem de cada venda.

## 7. Não-objetivos

- Falar com o cliente: nenhuma pergunta vai para o lead; nada é enviado.
- Conferir no banco se o Pix caiu de fato (sem integração bancária).
- Venda de pacote com valor fora da tabela registrada sozinha.
- Ler comprovante enviado pela equipe.

## 8. Anti-objetivos

- Contar a mesma venda duas vezes: mesmo identificador de transação, mesmo arquivo (hash) ou o
  mesmo comprovante reenviado.
- Registrar sozinho um comprovante falso ou de outra conta (recebedor que não confere).
- Gravar o conteúdo do comprovante (nome, CPF) em log.

## 9. Restrições

- Migração numerada nova; toda decisão do motor vira linha em `eventos_automacao` no mesmo
  comando que muda o dado.
- A IA continua no cliente atual (`ClienteIa`, OpenAI); a leitura de imagem/PDF entra como
  capacidade nova desse cliente, sem trocar provedor.
- A mídia não é guardada no banco: a miniatura da tela é buscada na Evolution sob demanda pelo
  admin.

## 10. Decisões minhas (revisáveis pelo dono)

- Pagamento com data de mais de 3 dias vira pergunta (comprovante antigo reenviado).
- Na primeira execução depois do deploy, a tarefa olha imagens e PDFs de leads dos **últimos
  7 dias** (para pegar as vendas de 07/11); mensagens mais antigas ficam de fora.
- Venda do app que chegar para o mesmo lead, com o mesmo valor, até 48 h depois de uma venda
  direta (ou o contrário) **não soma**: vira pergunta ao admin ("possível venda repetida").
- Um comprovante por mensagem; vários comprovantes na mesma conversa viram vendas separadas,
  cada um com sua checagem de repetição.
- A pergunta ao admin não expira.

## 10b. Decisões do construtor após a revisão do design (08/11/2026, revisáveis)

- **Onde mora:** tabela nova `comprovantes` (uma linha por mensagem analisada: `mensagem_id`
  único, `hash` SHA-256 do arquivo, `e2e`, `status`, leitura da IA em jsonb, horas sugeridas,
  motivo da dúvida, `venda_id`, quem decidiu e quando). A pergunta não aparece em faturado,
  vendas sem dono ou fechamento até ser confirmada. O admin grava pelo pool do motor, como o
  `vincular` de hoje (sem grant novo para `painel_rw`).
- **Chave da venda Pix:** `origem_externa = 'pix'`; `id_externo` = E2E lido do comprovante ou,
  sem E2E, `msg:<evolution_msg_id>`. `vinculada_por` ganha os valores `comprovante` (registro
  automático) e continua `admin` quando o admin confirma.
- **Repetição:** é repetido o comprovante com o mesmo `hash`, o mesmo E2E (contra qualquer venda
  ou comprovante, de qualquer origem) ou, sem E2E, mesmo lead + mesmo valor + pagamento a até
  10 min de outro comprovante. Repetido de um já registrado ou recusado não gera nada novo
  (fica `repetido`, com referência ao original).
- **App x direta (§10):** o caminho do webhook não muda. Comprovante de lead que tem venda do app
  paga com o mesmo valor nas 48 h anteriores vira pergunta. Venda do app que chega com o mesmo
  valor até 48 h depois de uma venda direta do mesmo lead entra normalmente e **abre uma pergunta**
  "possível venda repetida" apontando as duas; o admin decide qual desfazer.
- **Desfazer:** "Não é venda" também vale para venda Pix já registrada: estorna pelo `estornar`
  atual e **devolve as horas** (saldo = saldo − horas, sem ficar negativo), com evento. A etapa
  não volta sozinha.
- **Data e vendedor:** `comprada_em` = data e hora do pagamento lidas do comprovante; sem hora
  legível, `enviada_em` da mensagem. O vendedor é o dono do lead no momento do registro (o
  automático ou a confirmação do admin). Lead sem dono: a venda entra sem vendedor (sem comissão),
  como as vendas do app de lead sem dono hoje.
- **Correção pelo admin:** horas inteiras de 1 a 100 e valor livre maior que zero; um comprovante
  vira no máximo uma venda.
- **Horas no CRM:** a venda direta credita o saldo do CRM. Se a mesma compra também for lançada no
  app e voltar pelo webhook, cai na regra "possível venda repetida".
- **Varredura inicial:** a tarefa só considera mensagens dos últimos 7 dias; cada mensagem é lida
  uma vez, então a primeira rodada cobre os 7 dias anteriores ao deploy sem marcador extra.
- **Miniatura:** buscada na Evolution sob demanda pelo admin (`src/server/midia.ts`); se a mídia
  sumiu, a tela mostra "comprovante indisponível" e mantém o que a IA leu.

## 11. Fica para o construtor

- Formato exato dos prompts de leitura e de dedução das horas; modelo de visão.
- Layout da lista "Vendas para confirmar" e do cartão de Configurações (`docs/design.md`,
  mobile primeiro).
- Quantas mensagens da conversa entram na dedução das horas.
