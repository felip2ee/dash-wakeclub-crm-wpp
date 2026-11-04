import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import * as porteiro from "./porteiro";
import * as qualificador from "./qualificador";
import * as redator from "./redator";

// O texto de referência é sempre o JSON legado lido agora, nunca uma cópia.
function no(arquivo: string, nome: string) {
  const wf = JSON.parse(readFileSync(`docs/n8n-legado/${arquivo}`, "utf8"));
  return wf.nodes.find((n: { name: string }) => n.name === nome).parameters;
}
const sistema = (arquivo: string, nome: string): string =>
  no(arquivo, nome).options.systemMessage.replace(/^= /, "");
const schema = (arquivo: string, nome: string) => JSON.parse(no(arquivo, nome).inputSchema);

const WF02 = "wf-02-qualificador-ia.json";
const WF03 = "wf-03-redator-de-followup.json";

describe("prompts copiados do n8n", () => {
  test("qualificador = WF-02 + bloco de horas", () => {
    const sufixo =
      '\n\n  HORAS ESTIMADAS\n\n  Devolva horas_estimadas como inteiro de 1 a 8: pacote de 4h vira 4; "2 pessoas" vira 2;\n  pacote sem tamanho vira 4; sem nenhum sinal vira 1; nunca acima de 8.';
    expect(qualificador.SISTEMA).toBe(sistema(WF02, "Qualificador IA") + sufixo);
    expect(qualificador.VERSAO_PROMPT).toBe("motor-qualificador-2026-11-04");
    const esperado = schema(WF02, "Formato da qualificacao");
    esperado.properties.horas_estimadas = { type: "integer", minimum: 1, maximum: 8 };
    esperado.required.push("horas_estimadas");
    expect(qualificador.SCHEMA).toEqual(esperado);
  });

  test("porteiro = WF-03 + marcador de avaliações", () => {
    expect(porteiro.SISTEMA).toBe(sistema(WF03, "Porteiro IA") + "\n\n{{AVALIACOES}}");
    expect(porteiro.VERSAO_PROMPT).toBe("motor-porteiro-2026-11-04");
    expect(porteiro.SCHEMA).toEqual(schema(WF03, "Formato da decisao"));
  });

  test("redator = WF-03 + marcador de avaliações", () => {
    expect(redator.SISTEMA).toBe(sistema(WF03, "Redator IA") + "\n\n{{AVALIACOES}}");
    expect(redator.VERSAO_PROMPT).toBe("motor-redator-2026-11-04");
    expect(redator.SCHEMA).toEqual(schema(WF03, "Formato do texto"));
  });
});
