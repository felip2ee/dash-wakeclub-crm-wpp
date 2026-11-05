import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { ETAPAS } from "../../../lib/etapas";
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

const ETAPAS_QUAL =
  '\n\n  ETAPAS (substitui a lista ETIQUETAS acima)\n\n  Devolva etiqueta como uma destas: Novo lead, Em atendimento, Link enviado, Encerrado.\n  Cadastrado, Aguardando pagamento, Aluno com horas e Aluno sem horas são movidas pelo app de\n  agendamentos, nunca por voce; se o lead ja esta numa delas, repita a etiqueta atual.\n  O campo followup nao e mais usado: devolva null. Quem decide o follow-up e o sinal "parado" do CRM.';
const ETAPA_OBJETIVO =
  "\n\n  ETAPA E OBJETIVO\n\n  O contexto traz ETIQUETA (a etapa do funil) e OBJETIVO DESTE FOLLOW-UP (o que o CRM quer que\n  este toque consiga). Escreva ou avalie para esse objetivo; um lembrete de aula nunca e venda.";

describe("prompts copiados do n8n", () => {
  test("qualificador = WF-02 + horas + etapas", () => {
    const sufixo =
      '\n\n  HORAS ESTIMADAS\n\n  Devolva horas_estimadas como inteiro de 1 a 8: pacote de 4h vira 4; "2 pessoas" vira 2;\n  pacote sem tamanho vira 4; sem nenhum sinal vira 1; nunca acima de 8.';
    expect(qualificador.SISTEMA).toBe(sistema(WF02, "Qualificador IA") + sufixo + ETAPAS_QUAL);
    expect(qualificador.VERSAO_PROMPT).toBe("motor-qualificador-2026-11-05");
    const esperado = schema(WF02, "Formato da qualificacao");
    esperado.properties.horas_estimadas = { type: "integer", minimum: 1, maximum: 8 };
    esperado.required.push("horas_estimadas");
    esperado.properties.etiqueta.enum = [...ETAPAS];
    expect(qualificador.SCHEMA).toEqual(esperado);
  });

  test("porteiro = WF-03 + etapa/objetivo + marcador de avaliações", () => {
    expect(porteiro.SISTEMA).toBe(
      sistema(WF03, "Porteiro IA") + ETAPA_OBJETIVO + "\n\n{{AVALIACOES}}",
    );
    expect(porteiro.VERSAO_PROMPT).toBe("motor-porteiro-2026-11-05");
    expect(porteiro.SCHEMA).toEqual(schema(WF03, "Formato da decisao"));
  });

  test("redator = WF-03 + etapa/objetivo + marcador de avaliações", () => {
    expect(redator.SISTEMA).toBe(
      sistema(WF03, "Redator IA") + ETAPA_OBJETIVO + "\n\n{{AVALIACOES}}",
    );
    expect(redator.VERSAO_PROMPT).toBe("motor-redator-2026-11-05");
    expect(redator.SCHEMA).toEqual(schema(WF03, "Formato do texto"));
  });
});
