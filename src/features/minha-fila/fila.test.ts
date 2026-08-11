import { describe, expect, test } from "bun:test";

import { organizarMinhaFila } from "./fila";
import type { LeadFilaOperacional } from "@/server/followups";

const base = (leadId: string): LeadFilaOperacional => ({
  leadId,
  nome: leadId,
  telefone: "+5563999999999",
  etiqueta: "Atendimento",
  temperatura: "morno",
  resumo: null,
  nToques: 0,
  ultimaMsgLeadEm: "2026-08-10T12:00:00.000Z",
  ultimaMsgEquipeEm: "2026-08-10T13:00:00.000Z",
  ultimaMsgEm: "2026-08-10T13:00:00.000Z",
  aguardandoEquipe: false,
  horasEsperando: null,
  followup: null,
});

describe("organização da Minha Fila", () => {
  test("prioriza resposta, vencido, futuro e toque feito hoje sem duplicar lead", () => {
    const agora = new Date("2026-08-11T15:00:00.000Z");
    const esperandoEquipe = {
      ...base("responder"),
      aguardandoEquipe: true,
      horasEsperando: 5,
      ultimaMsgEquipeEm: null,
    };
    const vencido = {
      ...base("vencido"),
      followup: {
        followupId: "f1",
        tipo: "reengajar",
        motivo: "Retomar o interesse demonstrado.",
        agendadoPara: "2026-08-11T12:00:00.000Z",
        textoSugerido: "Oi, tudo bem?",
        sugeridoEm: "2026-08-11T11:00:00.000Z",
        vencido: true,
        toques: 0,
        ultimoToqueEm: null,
        jaTocado: false,
        temEco: false,
      },
    };
    const futuro = {
      ...base("futuro"),
      followup: {
        ...vencido.followup,
        followupId: "f2",
        agendadoPara: "2026-08-12T12:00:00.000Z",
        vencido: false,
      },
    };
    const feito = {
      ...base("feito"),
      followup: {
        ...vencido.followup,
        followupId: "f3",
        ultimoToqueEm: "2026-08-11T14:00:00.000Z",
        jaTocado: true,
      },
    };
    const respondeuDepoisDoToque = {
      ...feito,
      leadId: "respondeu-depois",
      aguardandoEquipe: true,
      horasEsperando: 1,
    };

    const fila = organizarMinhaFila(
      [vencido, futuro, feito, respondeuDepoisDoToque, esperandoEquipe, base("esperando")],
      agora,
    );

    expect(fila.agora.map((item) => item.leadId)).toEqual([
      "responder",
      "respondeu-depois",
      "vencido",
    ]);
    expect(fila.depois.map((item) => item.leadId)).toEqual(["futuro"]);
    expect(fila.feitos.map((item) => item.leadId)).toEqual(["feito"]);
    expect(fila.esperando.map((item) => item.leadId)).toEqual(["esperando"]);
  });
});
