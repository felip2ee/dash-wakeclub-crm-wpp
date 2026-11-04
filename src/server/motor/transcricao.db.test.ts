import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { comTransacao, getPoolMotor } from "../db";
import type { AdaptadorEvolution, EventoMensagem } from "../evolution/tipos";
import { clienteIaFalso } from "../ia/falso";
import { bancoTesteAtivo, telefoneUnico } from "./banco-teste";
import { registrarMensagem } from "./ingestao";
import { tarefaTranscricao } from "./transcricao";

const db = () => getPoolMotor();

async function audio(extra: Partial<EventoMensagem> = {}) {
  const m: EventoMensagem = {
    tipo: "mensagem",
    telefone: telefoneUnico(),
    nome: "Lead Audio",
    daEquipe: false,
    texto: "[audio]",
    tipoMidia: "audio",
    enviadaEm: new Date().toISOString(),
    evolutionMsgId: randomUUID(),
    ...extra,
  };
  const r = await comTransacao((c) => registrarMensagem(c, m));
  return { ...r, msgId: m.evolutionMsgId, mensagemId: r.mensagemId as string };
}

/** Adaptador falso: só devolve mídia para os ids listados; os demais viram `null`. */
function adaptador(ids: string[]) {
  return {
    baixarMidia: async (id: string) =>
      ids.includes(id)
        ? { mime: "audio/ogg; codecs=opus", dados: new Uint8Array([1, 2, 3]) }
        : null,
  } as unknown as AdaptadorEvolution;
}

async function linha(id: string) {
  const { rows } = await db().query(
    `select texto, transcricao_status, transcricao_tentativas, transcricao_erro, transcrito_em
       from wakeclub.mensagens where id = $1::uuid`,
    [id],
  );
  return rows[0];
}

async function qualificarApos(leadId: string): Promise<Date | null> {
  const { rows } = await db().query(
    `select qualificar_apos from wakeclub.leads where id = $1::uuid`,
    [leadId],
  );
  return rows[0].qualificar_apos;
}

describe.skipIf(!bancoTesteAtivo)("tarefaTranscricao", () => {
  test("transcreve e sobrescreve texto e empurra qualificar_apos", async () => {
    const a = await audio();
    const ia = clienteIaFalso({ transcricao: ["quero saber o preço"] });
    const antes = Date.now();
    await tarefaTranscricao({ ia, adaptador: adaptador([a.msgId]) });
    const l = await linha(a.mensagemId);
    expect(l.texto).toBe("quero saber o preço");
    expect(l.transcricao_status).toBe("ok");
    expect(ia.chamadas.transcricao[0].nomeArquivo).toBe("audio.ogg");
    const q = await qualificarApos(a.leadId);
    if (!q) throw new Error("qualificar_apos nulo");
    expect(q.getTime() - antes).toBeGreaterThan(100_000);
    expect(q.getTime() - antes).toBeLessThan(140_000);
  });

  test("sem midia vira sem_midia", async () => {
    const a = await audio();
    const ia = clienteIaFalso({});
    await tarefaTranscricao({ ia, adaptador: adaptador([]) });
    expect((await linha(a.mensagemId)).transcricao_status).toBe("sem_midia");
    expect(ia.chamadas.transcricao).toHaveLength(0);
  });

  test("falha conta tentativa e na terceira vira falhou", async () => {
    const a = await audio();
    const ad = adaptador([a.msgId]);
    const ia = clienteIaFalso({
      transcricao: [new Error("boom"), new Error("boom"), new Error("boom")] as never,
    });
    await tarefaTranscricao({ ia, adaptador: ad });
    let l = await linha(a.mensagemId);
    expect([l.transcricao_status, l.transcricao_tentativas, l.transcricao_erro]).toEqual([
      "pendente",
      1,
      "boom",
    ]);
    await tarefaTranscricao({ ia, adaptador: ad });
    await tarefaTranscricao({ ia, adaptador: ad });
    l = await linha(a.mensagemId);
    expect([l.transcricao_status, l.transcricao_tentativas]).toEqual(["falhou", 3]);
  });

  test("orfao volta", async () => {
    const a = await audio();
    await db().query(
      `update wakeclub.mensagens
          set transcricao_status = 'transcrevendo', transcricao_tentativas = 1,
              transcrito_em = now() - interval '20 minutes'
        where id = $1::uuid`,
      [a.mensagemId],
    );
    const ia = clienteIaFalso({ transcricao: ["voltou"] });
    // As CTEs do SQL literal compartilham snapshot: o órfão volta a pendente na 1ª rodada
    // e só é reivindicado na 2ª.
    await tarefaTranscricao({ ia, adaptador: adaptador([a.msgId]) });
    expect((await linha(a.mensagemId)).transcricao_status).toBe("pendente");
    await tarefaTranscricao({ ia, adaptador: adaptador([a.msgId]) });
    const l = await linha(a.mensagemId);
    expect([l.texto, l.transcricao_status, l.transcricao_tentativas]).toEqual(["voltou", "ok", 2]);
  });

  test("audio da equipe tambem transcreve", async () => {
    const a = await audio({ daEquipe: true });
    const ia = clienteIaFalso({ transcricao: ["fala da equipe"] });
    await tarefaTranscricao({ ia, adaptador: adaptador([a.msgId]) });
    const l = await linha(a.mensagemId);
    expect([l.texto, l.transcricao_status]).toEqual(["fala da equipe", "ok"]);
  });
});
