// Gera qualificador.ts, porteiro.ts e redator.ts a partir dos workflows legados
// (docs/n8n-legado), para o prompt nunca ser digitado à mão. Acréscimos só ao fim.
// Uso: node src/server/ia/prompts/extrair.mjs   (prompts.test.ts confere o resultado)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";

const AQUI = dirname(fileURLToPath(import.meta.url));
const LEGADO = resolve(AQUI, "../../../../docs/n8n-legado");

const HORAS =
  '\n\n  HORAS ESTIMADAS\n\n  Devolva horas_estimadas como inteiro de 1 a 8: pacote de 4h vira 4; "2 pessoas" vira 2;\n  pacote sem tamanho vira 4; sem nenhum sinal vira 1; nunca acima de 8.';
// A Task 5 troca o marcador pelo bloco de avaliações do vendedor (spec §8).
const AVALIACOES = "\n\n{{AVALIACOES}}";

const ALVOS = [
  {
    saida: "qualificador.ts",
    arquivo: "wf-02-qualificador-ia.json",
    agente: "Qualificador IA",
    formato: "Formato da qualificacao",
    versao: "motor-qualificador-2026-11-04",
    sufixo: HORAS,
    ajustarSchema(schema) {
      schema.properties.horas_estimadas = { type: "integer", minimum: 1, maximum: 8 };
      schema.required.push("horas_estimadas");
    },
  },
  {
    saida: "porteiro.ts",
    arquivo: "wf-03-redator-de-followup.json",
    agente: "Porteiro IA",
    formato: "Formato da decisao",
    versao: "motor-porteiro-2026-11-04",
    sufixo: AVALIACOES,
  },
  {
    saida: "redator.ts",
    arquivo: "wf-03-redator-de-followup.json",
    agente: "Redator IA",
    formato: "Formato do texto",
    versao: "motor-redator-2026-11-04",
    sufixo: AVALIACOES,
  },
];

function parametros(nos, nome) {
  const no = nos.find((n) => n.name === nome);
  if (!no) throw new Error(`nó "${nome}" não encontrado`);
  return no.parameters;
}

const literal = (texto) =>
  "`" + texto.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

const config = await resolveConfig(resolve(AQUI, "qualificador.ts"));

for (const alvo of ALVOS) {
  const { nodes } = JSON.parse(readFileSync(resolve(LEGADO, alvo.arquivo), "utf8"));
  // "= " no começo é marcação de expressão do n8n, não parte do prompt.
  const sistema = parametros(nodes, alvo.agente).options.systemMessage.replace(/^= /, "");
  const schema = JSON.parse(parametros(nodes, alvo.formato).inputSchema);
  alvo.ajustarSchema?.(schema);
  const codigo = `/**
 * GERADO por extrair.mjs a partir de docs/n8n-legado/${alvo.arquivo} (nó "${alvo.agente}").
 * Não edite à mão: rode \`node src/server/ia/prompts/extrair.mjs\`.
 */
export const VERSAO_PROMPT = ${JSON.stringify(alvo.versao)};

export const SISTEMA = ${literal(sistema + alvo.sufixo)};

export const SCHEMA: Record<string, unknown> = ${JSON.stringify(schema)};
`;
  const destino = resolve(AQUI, alvo.saida);
  writeFileSync(destino, await format(codigo, { ...config, filepath: destino }));
}
