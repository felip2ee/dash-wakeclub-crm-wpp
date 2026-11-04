/**
 * Transcrição de áudios (porta do WF-11, spec §3). O SQL é o dos nós "Reivindicar
 * audios", "Marcar falha" e "Gravar transcricao". Áudio da equipe também transcreve.
 */
import { type ClienteDb, getPoolMotor } from "../db";
import type { AdaptadorEvolution } from "../evolution/tipos";
import type { ClienteIa } from "../ia/tipos";
import { logErro } from "../log";

export type AudioReivindicado = { mensagem_id: string; lead_id: string; evolution_msg_id: string };

export async function reivindicarAudios(db: ClienteDb, limite = 5): Promise<AudioReivindicado[]> {
  const { rows } = await db.query<AudioReivindicado>(
    `with orfas as (
       update wakeclub.mensagens
          set transcricao_status = 'pendente'
        where transcricao_status = 'transcrevendo'
          and transcrito_em < now() - interval '15 minutes'
       returning 1
     ),
     desistir as (
       update wakeclub.mensagens
          set transcricao_status = 'falhou',
              transcricao_erro = coalesce(transcricao_erro, 'desistiu apos 3 tentativas')
        where transcricao_status = 'pendente'
          and transcricao_tentativas >= 3
       returning 1
     ),
     alvo as (
       select m.id
         from wakeclub.mensagens m
        where m.transcricao_status = 'pendente'
          and m.evolution_msg_id is not null
          and m.transcricao_tentativas < 3
        order by m.enviada_em desc
        limit $1::int
        for update skip locked
     )
     update wakeclub.mensagens m
        set transcricao_status = 'transcrevendo',
            transcricao_tentativas = m.transcricao_tentativas + 1,
            transcrito_em = now()
       from alvo a
      where m.id = a.id
     returning m.id as mensagem_id, m.lead_id, m.evolution_msg_id`,
    [limite],
  );
  return rows;
}

const EXTENSOES: [string, string][] = [
  ["mpeg", "mp3"],
  ["mp4", "m4a"],
  ["m4a", "m4a"],
  ["webm", "webm"],
  ["wav", "wav"],
  ["ogg", "ogg"],
];

function extensao(mime: string): string {
  return EXTENSOES.find(([k]) => mime.includes(k))?.[1] ?? "ogg";
}

export async function tarefaTranscricao(deps: {
  ia: ClienteIa;
  adaptador: AdaptadorEvolution;
}): Promise<number> {
  const db = getPoolMotor();
  const audios = await reivindicarAudios(db);
  for (const a of audios) {
    try {
      const midia = await deps.adaptador.baixarMidia(a.evolution_msg_id);
      if (!midia) {
        await db.query(
          `update wakeclub.mensagens set transcricao_status = 'sem_midia' where id = $1::uuid`,
          [a.mensagem_id],
        );
        continue;
      }
      const texto = await deps.ia.transcrever({
        dados: midia.dados,
        mime: midia.mime,
        nomeArquivo: "audio." + extensao(midia.mime),
      });
      await db.query(
        `with t as (
           update wakeclub.mensagens
              set texto = nullif($2::text, ''),
                  transcricao_status = 'ok',
                  transcrito_em = now(),
                  transcricao_erro = null
            where id = $1::uuid
           returning lead_id, texto
         )
         update wakeclub.leads l
            set qualificar_apos = now() + interval '2 minutes'
           from t
          where l.id = t.lead_id
            and l.opt_out = false
            and l.sem_atendimento = false`,
        [a.mensagem_id, texto],
      );
    } catch (erro) {
      // Só `message`: o erro cru de fetch pode carregar URL com chave.
      const msg = erro instanceof Error ? erro.message : String(erro);
      logErro("transcricao.falha", erro, { mensagemId: a.mensagem_id });
      await db.query(
        `update wakeclub.mensagens
            set transcricao_status = case
                  when transcricao_tentativas >= 3 then 'falhou'
                  else 'pendente' end,
                transcricao_erro = left($2::text, 500)
          where id = $1::uuid`,
        [a.mensagem_id, msg],
      );
    }
  }
  return audios.length;
}
