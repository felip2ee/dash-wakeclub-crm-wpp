import { paraE164 } from "../motor/telefone";

export type VendaNormalizada = {
  idExterno: string;
  compradaEm: string;
  valor: number;
  cpf: string | null;
  telefone: string | null;
  produto: string | null;
  horas: number | null;
  status: "paga" | "estornada";
  decisoes: string[];
};

type Obj = Record<string, unknown>;

const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Primeiro valor útil entre os caminhos ("a.b" desce em objetos). Formato provisório: tolerante. */
function achar(corpo: Obj, caminhos: string[]): unknown {
  for (const c of caminhos) {
    let v: unknown = corpo;
    for (const k of c.split(".")) v = ehObj(v) ? v[k] : undefined;
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[^\d.,-]/g, "");
  // "1.234,56" → vírgula decimal; "1234.56" → ponto decimal.
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
}

/** Valor em reais; "1.500" (ponto + três dígitos, sem vírgula) é milhar, não 1,5. */
function lerValor(bruto: unknown, decisoes: string[]): { valor: number | null; milhar: boolean } {
  const milhar = typeof bruto === "string" && /^\D*\d{1,3}(\.\d{3})+\s*$/.test(bruto);
  const valor = milhar ? Number(String(bruto).replace(/\D/g, "")) : numero(bruto);
  if (milhar) decisoes.push(`valor com ponto de milhar: "${String(bruto)}" → ${valor?.toFixed(2)}`);
  return { valor, milhar };
}

function lerData(bruto: unknown, decisoes: string[]): string {
  const ms =
    bruto === null
      ? NaN
      : typeof bruto === "number"
        ? bruto * (bruto < 1e11 ? 1000 : 1)
        : Date.parse(String(bruto));
  if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  decisoes.push("data ausente ou ilegível: usado o horário de recebimento");
  return new Date().toISOString();
}

function lerCpf(bruto: unknown, decisoes: string[]): string | null {
  const digitos = bruto === null || bruto === undefined ? "" : String(bruto).replace(/\D/g, "");
  if (digitos.length === 11) return digitos;
  if (bruto !== null && bruto !== undefined && bruto !== "")
    decisoes.push("cpf descartado: não tem 11 dígitos");
  return null;
}

function lerTelefone(bruto: unknown, decisoes: string[]): string | null {
  let digitos = bruto === null || bruto === undefined ? "" : String(bruto).replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) {
    digitos = "55" + digitos;
    decisoes.push("telefone sem código do país: assumido +55");
  }
  return digitos ? paraE164(digitos) : null;
}

/**
 * Envelope real do app de agendamento: `{ event, timestamp, data }`. Só
 * USER_HOUR_PURCHASE_PAID vira venda; `data.price_paid` já vem em reais (sem a heurística de
 * centavos). Os demais eventos e os de teste (`data.test`) são ignorados, não erro.
 * Estorno: nenhum evento de estorno conhecido ainda; incluir aqui quando o app definir um.
 */
function normalizarEnvelopeApp(
  evento: string,
  corpo: Obj,
  data: Obj,
): VendaNormalizada | { erro: string } | { ignorar: string } {
  // "true" em texto também conta: na dúvida nunca é venda.
  if (data.test === true || data.test === "true") return { ignorar: "evento de teste do app" };
  if (evento !== "USER_HOUR_PURCHASE_PAID") return { ignorar: `evento ${evento} sem venda` };

  const id = achar(data, ["transaction_id", "payment_id"]);
  if (typeof id !== "string" && typeof id !== "number")
    return { erro: "formato desconhecido: sem id da venda" };
  const decisoes = ["envelope do app (USER_HOUR_PURCHASE_PAID): price_paid em reais"];
  const { valor } = lerValor(data.price_paid, decisoes);
  if (valor === null || valor <= 0) return { erro: "formato desconhecido: sem valor" };

  const compradaEm = lerData(
    achar(corpo, ["timestamp"]) ?? achar(data, ["paid_at", "date"]),
    decisoes,
  );
  const cpf = lerCpf(achar(data, ["cpf"]), decisoes);
  const telefone = lerTelefone(achar(data, ["phone"]), decisoes);

  const horasN = numero(data.hours);
  const horas = horasN !== null && Number.isInteger(horasN) ? horasN : null;
  const rotulo = achar(data, ["package_label"]);
  const produto =
    rotulo !== null
      ? String(rotulo)
      : horas !== null
        ? `${horas}h ${String(data.hour_type ?? "")}`.trim()
        : null;

  return {
    idExterno: String(id),
    compradaEm,
    valor,
    cpf,
    telefone,
    produto,
    horas,
    status: "paga",
    decisoes,
  };
}

export function normalizarVenda(
  corpo: unknown,
): VendaNormalizada | { erro: string } | { ignorar: string } {
  if (!ehObj(corpo)) return { erro: "formato desconhecido: corpo não é objeto" };
  // Só o namespace do app (USER_*); outro envelope cai no formato flat e falha alto, para calibrar.
  if (typeof corpo.event === "string" && /^USER_/.test(corpo.event) && ehObj(corpo.data))
    return normalizarEnvelopeApp(corpo.event, corpo, corpo.data);
  const decisoes: string[] = [];

  const id = achar(corpo, ["id", "order_id", "transaction", "transaction_id"]);
  if (typeof id !== "string" && typeof id !== "number")
    return { erro: "formato desconhecido: sem id da venda" };

  const bruto = achar(corpo, ["amount", "valor", "price", "value"]);
  const { valor: lido, milhar } = lerValor(bruto, decisoes);
  let valor = lido;
  if (valor === null) return { erro: "formato desconhecido: sem valor" };
  if (valor <= 0) return { erro: "formato desconhecido: valor não positivo" };
  // Inteiro > 1000 sem casas decimais: assume centavos.
  const semCasas =
    typeof bruto === "number" ? Number.isInteger(bruto) : !/[.,]\d{1,2}\s*$/.test(String(bruto));
  if (!milhar && Number.isInteger(valor) && valor > 1000 && semCasas) {
    const reais = valor / 100;
    decisoes.push(`valor em centavos: ${valor} → ${reais.toFixed(2)}`);
    valor = reais;
  }

  const compradaEm = lerData(achar(corpo, ["created_at", "paid_at", "data", "date"]), decisoes);
  const cpf = lerCpf(
    achar(corpo, ["cpf", "document", "buyer.document", "customer.document"]),
    decisoes,
  );
  const telefone = lerTelefone(
    achar(corpo, ["phone", "telefone", "buyer.phone", "customer.phone"]),
    decisoes,
  );

  const prod = achar(corpo, ["product", "produto", "plan", "plano", "product.name"]);
  const produto =
    prod === null
      ? null
      : String(typeof prod === "object" ? (achar(prod as Obj, ["name", "nome"]) ?? "") : prod) ||
        null;

  let horas: number | null = null;
  const h = achar(corpo, ["horas", "hours", "duracao"]);
  const hn = h === null ? null : numero(h);
  if (hn !== null && Number.isInteger(hn)) horas = hn;
  else if (produto) {
    const m = /(\d+)\s*h\b/i.exec(produto) ?? /(\d+)\s*horas?\b/i.exec(produto);
    if (m) {
      horas = Number(m[1]);
      decisoes.push(`horas ${horas} lidas do nome do produto`);
    }
  }

  const st = String(achar(corpo, ["status"]) ?? "").toLowerCase();
  let status: "paga" | "estornada" = "paga";
  if (!st) decisoes.push("status ausente: assumido paga");
  else if (/estornad|refund|chargeback|cancel/.test(st)) status = "estornada";
  else if (!/^(paga|pago|aprovad|approved|paid|complet|confirm)/.test(st))
    return { erro: `status "${st}" não reconhecido` };

  return {
    idExterno: String(id),
    compradaEm,
    valor,
    cpf,
    telefone,
    produto,
    horas,
    status,
    decisoes,
  };
}
