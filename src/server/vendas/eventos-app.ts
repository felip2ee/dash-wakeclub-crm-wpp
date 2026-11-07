import { lerCpf, lerTelefone } from "./normalizar";

/**
 * Normaliza o envelope `{ event, timestamp, data }` dos eventos USER_* do app
 * (menos a compra paga, que também vira venda em normalizar.ts) num formato
 * único para o processador do motor. Puro: sem banco, sem relógio além do
 * fallback de `ocorridoEm`. Evento de teste e desconhecido é ignorado, não erro.
 */

export type PessoaApp = {
  userId: string | null;
  cpf: string | null;
  telefone: string | null;
  nome: string | null;
};
export type EventoApp = { ocorridoEm: string; pessoa: PessoaApp; chave: string } & (
  | { tipo: "cadastro" }
  | { tipo: "agendamento"; bookingId: string; aulaEm: string; modalidade: string | null }
  | { tipo: "aula"; bookingId: string; aulaEm: string; atendidaEm: string }
  | { tipo: "compra_pendente"; paymentId: string; horas: number | null; valor: number | null }
  | { tipo: "compra_paga"; horas: number | null }
);

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;

const numero = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** "YYYY-MM-DD" + "HH:MM" em America/Sao_Paulo → ISO UTC (offset real via Intl, sem depender de -03:00 fixo). */
function aulaEmSp(date: string, slot: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const h = /^(\d{1,2}):(\d{2})/.exec(slot);
  if (!d || !h) return null;
  const naiveMs = Date.UTC(
    Number(d[1]),
    Number(d[2]) - 1,
    Number(d[3]),
    Number(h[1]),
    Number(h[2]),
  );
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(new Date(naiveMs));
  const p = (t: string) => Number(partes.find((x) => x.type === t)?.value);
  const vistoMs = Date.UTC(p("year"), p("month") - 1, p("day"), p("hour"), p("minute"));
  const ms = naiveMs + (naiveMs - vistoMs);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function normalizarEventoApp(
  corpo: unknown,
): EventoApp | { ignorar: string } | { erro: string } {
  if (!ehObj(corpo) || typeof corpo.event !== "string" || !ehObj(corpo.data))
    return { erro: "formato desconhecido: sem event/data" };
  const evento = corpo.event;
  const data = corpo.data;
  if (data.test === true || data.test === "true") return { ignorar: "evento de teste do app" };

  const user = ehObj(data.user) ? data.user : {};
  const base = {
    pessoa: {
      userId: texto(data.user_id) ?? texto(user.id),
      cpf: lerCpf(data.cpf ?? user.cpf ?? null, []),
      telefone: lerTelefone(data.phone ?? user.phone ?? null, []),
      nome: texto(data.full_name) ?? texto(data.name) ?? texto(user.full_name) ?? texto(user.name),
    },
    ocorridoEm: (() => {
      const ms =
        typeof corpo.timestamp === "number"
          ? corpo.timestamp * (corpo.timestamp < 1e11 ? 1000 : 1)
          : Date.parse(String(corpo.timestamp ?? ""));
      return Number.isNaN(ms) ? new Date().toISOString() : new Date(ms).toISOString();
    })(),
  };
  const sem = (campo: string) => ({ erro: `formato desconhecido: sem ${campo}` });

  switch (evento) {
    case "USER_CREATE_ACCOUNT": {
      if (!base.pessoa.userId) return sem("user_id");
      return { ...base, tipo: "cadastro", chave: base.pessoa.userId };
    }
    case "USER_HOUR_BOOKED":
    case "USER_LESSON_ATTENDED": {
      const bookingId = texto(data.booking_id);
      if (!bookingId) return sem("booking_id");
      const date = texto(data.date);
      const slot = texto(data.time_slot);
      if (!date) return sem("date");
      if (!slot) return sem("time_slot");
      const aulaEm = aulaEmSp(date, slot);
      if (!aulaEm) return { erro: "formato desconhecido: date/time_slot ilegível" };
      if (evento === "USER_HOUR_BOOKED")
        return {
          ...base,
          tipo: "agendamento",
          chave: bookingId,
          bookingId,
          aulaEm,
          modalidade: texto(data.modality) ?? texto(data.lesson_type),
        };
      return {
        ...base,
        tipo: "aula",
        chave: `${bookingId}|${date}|${slot}`,
        bookingId,
        aulaEm,
        atendidaEm: base.ocorridoEm,
      };
    }
    case "USER_HOUR_PURCHASE_CREATED": {
      const paymentId = texto(data.payment_id);
      if (!paymentId) return sem("payment_id");
      return {
        ...base,
        tipo: "compra_pendente",
        chave: paymentId,
        paymentId,
        horas: numero(data.hours),
        valor: numero(data.price) ?? numero(data.price_paid),
      };
    }
    case "USER_HOUR_PURCHASE_PAID": {
      const chave = texto(data.transaction_id) ?? texto(data.payment_id);
      if (!chave) return sem("transaction_id");
      return { ...base, tipo: "compra_paga", chave, horas: numero(data.hours) };
    }
    default:
      return { ignorar: `evento ${evento} sem efeito no funil` };
  }
}
