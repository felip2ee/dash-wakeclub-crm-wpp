import { describe, expect, test } from "bun:test";

import { type ItemConversa, filtrarConversas } from "./filtro";

const item = (parcial: Partial<ItemConversa> & { id: string }): ItemConversa => ({
  nome: null,
  telefone: "+5563981110000",
  temperatura: null,
  ultimaTexto: null,
  ultimaMsgEm: null,
  msgsLeadSemResposta: 0,
  aguardandoEquipe: false,
  followupAguardando: false,
  ...parcial,
});

const LISTA = [
  item({ id: "a", nome: "Mariana Costa", temperatura: "quente", aguardandoEquipe: true }),
  item({ id: "b", nome: "Bruno Almeida", temperatura: "morno", followupAguardando: true }),
  item({ id: "c", telefone: "+5563999998888", ultimaTexto: "Qual o valor da hora?" }),
];

const ids = (l: ItemConversa[]) => l.map((c) => c.id);

describe("filtrarConversas", () => {
  test("todas sem busca devolve a lista inteira", () => {
    expect(ids(filtrarConversas(LISTA, "todas", ""))).toEqual(["a", "b", "c"]);
  });

  test("não lidas = aguardando a equipe", () => {
    expect(ids(filtrarConversas(LISTA, "nao-lidas", ""))).toEqual(["a"]);
  });

  test("follow-ups = sugestão aguardando aprovação", () => {
    expect(ids(filtrarConversas(LISTA, "followups", ""))).toEqual(["b"]);
  });

  test("quentes", () => {
    expect(ids(filtrarConversas(LISTA, "quentes", ""))).toEqual(["a"]);
  });

  test("busca por nome sem acento e caixa, telefone formatado e mensagem", () => {
    expect(ids(filtrarConversas(LISTA, "todas", "  BRUNO "))).toEqual(["b"]);
    expect(ids(filtrarConversas(LISTA, "todas", "(63) 99999-8888"))).toEqual(["c"]);
    expect(ids(filtrarConversas(LISTA, "todas", "valor da"))).toEqual(["c"]);
    expect(ids(filtrarConversas(LISTA, "todas", "mariána"))).toEqual(["a"]);
  });

  test("filtro e busca combinados", () => {
    expect(ids(filtrarConversas(LISTA, "quentes", "bruno"))).toEqual([]);
  });
});
