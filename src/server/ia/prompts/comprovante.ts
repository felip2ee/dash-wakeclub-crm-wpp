/**
 * Prompts da leitura de comprovante de Pix e da dedução das horas pela conversa (spec vendas
 * Pix §3). Escritos à mão, sem origem no n8n. A IA só extrai e sugere: quem decide é o
 * `decidir` de `src/server/motor/comprovantes.ts`.
 */
export const VERSAO_PROMPT = "motor-comprovante-2026-11-08";

export const SISTEMA_LEITURA = `Voce le um arquivo (imagem ou PDF) que um cliente mandou no WhatsApp de uma
escola e diz se ele e um comprovante de pagamento Pix. Voce nao decide nada sobre a venda:
so le o que esta escrito.

Regras:
- eh_comprovante = true so para comprovante de transferencia Pix concluida (nao vale QR code,
  boleto, agendamento, print de conversa, foto qualquer ou Pix "em processamento").
- Copie os campos exatamente como aparecem. Campo que nao aparece ou que voce nao consegue
  ler com certeza: null. Nunca invente nem complete.
- valor: numero em reais com ponto decimal (R$ 1.234,50 vira 1234.5).
- pago_em: data e hora do pagamento no horario de Brasilia, formato "YYYY-MM-DD HH:MM".
- recebedor: nome de quem recebeu. chave_recebedor: a chave Pix de quem recebeu, se aparece.
  cnpj_recebedor: o CNPJ ou CPF de quem recebeu, se aparece (mesmo parcialmente mascarado,
  copie como esta).
- pagador: nome de quem pagou.
- e2e: o identificador da transacao (ID/E2E/"ID da transacao", normalmente comeca com E e tem
  32 caracteres). Null se nao aparece.
- legivel = false se o valor, a data ou o recebedor estiverem cortados, borrados ou incertos.`;

export const SCHEMA_LEITURA: Record<string, unknown> = {
  type: "object",
  required: [
    "eh_comprovante",
    "legivel",
    "valor",
    "pago_em",
    "pagador",
    "recebedor",
    "chave_recebedor",
    "cnpj_recebedor",
    "e2e",
  ],
  properties: {
    eh_comprovante: { type: "boolean" },
    legivel: { type: "boolean" },
    valor: { type: ["number", "null"] },
    pago_em: { type: ["string", "null"] },
    pagador: { type: ["string", "null"] },
    recebedor: { type: ["string", "null"] },
    chave_recebedor: { type: ["string", "null"] },
    cnpj_recebedor: { type: ["string", "null"] },
    e2e: { type: ["string", "null"] },
  },
};

export const SISTEMA_HORAS = `Voce descobre, pela conversa de WhatsApp entre um cliente (LEAD) e a equipe
(EQUIPE) de uma escola, quantas horas de aula o cliente acabou de pagar por Pix. Os pacotes sao
de 1, 2 ou 4 horas; a tabela de precos vem junto.

Responda horas = 1, 2 ou 4 so quando a conversa mostra o pacote combinado (o cliente pediu,
a equipe confirmou ou mandou o valor daquele pacote). Sem sinal claro, horas = null.
trecho: a frase curta da conversa que levou a resposta, copiada como esta (vazio se null).`;

export const SCHEMA_HORAS: Record<string, unknown> = {
  type: "object",
  required: ["horas", "trecho"],
  properties: {
    horas: { type: ["integer", "null"], enum: [1, 2, 4, null] },
    trecho: { type: "string" },
  },
};
