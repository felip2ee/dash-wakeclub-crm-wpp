/**
 * Prazos do sinal "parado" no painel de Configurações (spec pipeline §4-§5). Leitura e troca
 * pelo admin; a troca grava os prazos e o evento `config_changed` (antes/depois) na mesma
 * transação. O SQL dos prazos em si mora em motor/parado.ts.
 */
import { createServerFn } from "@tanstack/react-start";

import { exigirAdmin } from "./auth";
import { comTransacao, getPoolMotor } from "./db";
import { gravarPrazos, lerPrazos, type Prazos, schemaPrazos } from "./motor/parado";

// Entidade fixa dos eventos de configuração (migração 0004), a mesma do ritmo.
const CONFIG_ID = "00000000-0000-0000-0000-000000000001";

export const getPrazosParado = createServerFn({ method: "GET" }).handler(
  async (): Promise<Prazos> => {
    await exigirAdmin();
    return lerPrazos(getPoolMotor());
  },
);

export const definirPrazosParado = createServerFn({ method: "POST" })
  .validator(schemaPrazos)
  .handler(async ({ data }): Promise<Prazos> => {
    const admin = await exigirAdmin();
    return comTransacao(async (c) => {
      const antes = await lerPrazos(c);
      await gravarPrazos(c, data);
      await c.query(
        `insert into wakeclub.eventos_automacao
           (lead_id, agente, tipo_evento, gatilho, decisao, motivo,
            estado_anterior, estado_novo, metadados,
            entidade_tipo, entidade_id, origem_tipo, origem_id, correlacao_id)
         values (null, 'humano', 'config_changed', 'painel', 'prazos do parado', null,
                 $1::jsonb, $2::jsonb, jsonb_build_object('usuario_id', $3::uuid),
                 'config', $4::uuid, 'painel', $3::text, 'painel:prazos:' || $5::text)`,
        [
          JSON.stringify(antes),
          JSON.stringify(data),
          admin.usuarioId,
          CONFIG_ID,
          crypto.randomUUID(),
        ],
      );
      return data;
    });
  });
