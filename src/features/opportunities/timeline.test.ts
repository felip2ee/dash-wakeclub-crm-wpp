import { describe, expect, test } from "bun:test";

import type { Mensagem } from "@/server/conversas";
import { montarTimeline } from "@/server/opportunities";
import type { Followup, QualificacaoIA } from "@/server/wf02";

describe("timeline da oportunidade", () => {
  test("ordena os rastros e permite sobrepor mensagens da IA e da equipe", () => {
    const mensagens = [
      {
        id: "m1",
        leadId: "lead",
        direcao: "equipe",
        texto: "Olá",
        enviadaEm: "2026-08-11T10:00:00.000Z",
        entregaNivel: 3,
        entregaEm: null,
        autoria: null,
      },
      {
        id: "m2",
        leadId: "lead",
        direcao: "ia",
        texto: "Sugestão",
        enviadaEm: "2026-08-11T11:00:00.000Z",
        entregaNivel: null,
        entregaEm: null,
        autoria: null,
      },
    ] satisfies Mensagem[];
    const qualificacoes = [
      {
        id: "q1",
        leadId: "lead",
        qualificadoEm: "2026-08-11T12:00:00.000Z",
      },
    ] as QualificacaoIA[];
    const followups = [
      {
        id: "f1",
        leadId: "lead",
        status: "cancelado",
        criadoEm: "2026-08-11T09:00:00.000Z",
        atualizadoEm: "2026-08-11T13:00:00.000Z",
        enviadoEm: null,
      },
    ] as Followup[];

    const eventos = montarTimeline({ mensagens, qualificacoes, followups });

    expect(eventos.map((evento) => evento.tipo)).toEqual([
      "followup_cancelado",
      "decisao_ia",
      "mensagem",
      "mensagem",
      "followup_criado",
    ]);
    expect(eventos.filter((evento) => evento.categorias.includes("ia"))).toHaveLength(2);
  });
});
