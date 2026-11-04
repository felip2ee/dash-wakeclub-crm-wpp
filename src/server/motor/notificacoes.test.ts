import { describe, expect, test } from "bun:test";

import { agruparNotificacoes, type NotificacaoPendente } from "./notificacoes";

const n = (id: string, usuarioId: string | null, tipo: string, titulo: string) =>
  ({ id, usuarioId, tipo, titulo, corpo: "c", url: "/u", filaTotal: 5 }) as NotificacaoPendente;

describe("agruparNotificacoes", () => {
  test("agrupa por pessoa e tipo", () => {
    const grupos = agruparNotificacoes([
      n("1", "a", "mensagem", "Nova mensagem: Ana"),
      n("2", "a", "mensagem", "Nova mensagem: Bia"),
      n("3", "a", "mensagem", "Nova mensagem: Caio"),
      n("4", "b", "mensagem", "Nova mensagem: Duda"),
    ]);
    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({
      usuarioId: "a",
      titulo: "3 avisos novos",
      corpo: "Ana, Bia, Caio",
      ids: ["1", "2", "3"],
      tag: "mensagem",
    });
    expect(grupos[1]).toMatchObject({ titulo: "Nova mensagem: Duda", ids: ["4"] });
  });

  test("corpo com mais de 3 nomes e followup usa fila_total", () => {
    const m = agruparNotificacoes(
      ["A", "B", "C", "D", "E"].map((x, i) =>
        n(String(i), null, "mensagem", `Nova mensagem: ${x}`),
      ),
    );
    expect(m[0].corpo).toBe("A, B, C e mais 2");
    const f = agruparNotificacoes([
      n("1", "a", "followup", "Follow-up: X"),
      n("2", "a", "followup", "Follow-up: Y"),
    ]);
    expect(f[0].titulo).toBe("5 follow-ups esperando");
  });
});
