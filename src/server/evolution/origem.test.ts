import { expect, test } from "bun:test";

import { origemDoContexto } from "./origem";
import type { OrigemLead } from "./tipos";

const sem = { app: null, anuncioId: null, anuncioTitulo: null };

const casos: [Record<string, unknown>, OrigemLead | null][] = [
  [
    {
      entryPointConversionSource: "ctwa_ad",
      entryPointConversionApp: "instagram",
      externalAdReply: { title: "T", sourceId: "1", sourceType: "ad" },
    },
    { canal: "anuncio", app: "instagram", anuncioId: "1", anuncioTitulo: "T" },
  ],
  [
    { externalAdReply: { sourceType: "ad", sourceId: "2" } },
    { canal: "anuncio", app: null, anuncioId: "2", anuncioTitulo: null },
  ],
  [
    { entryPointConversionSource: "click_to_chat_link", entryPointConversionApp: "" },
    { canal: "link", ...sem },
  ],
  [{ entryPointConversionSource: "phone_number_hyperlink" }, { canal: "link", ...sem }],
  [{ entryPointConversionSource: "message_short_link" }, { canal: "link", ...sem }],
  [
    { entryPointConversionSource: "global_search_new_chat", entryPointConversionApp: "WhatsApp" },
    { canal: "busca", app: "whatsapp", anuncioId: null, anuncioTitulo: null },
  ],
  [{ entryPointConversionSource: "group_member_list" }, { canal: "outro", ...sem }],
  [
    { entryPointConversionSource: "marca_desconhecida", entryPointConversionApp: "tiktok" },
    { canal: "outro", ...sem },
  ],
  [{ externalAdReply: { sourceType: "post", sourceId: "3" } }, null],
  [{ deviceListMetadataVersion: 2 }, null],
  [{}, null],
];

test.each(casos)("mapeia %j", (ctx, esperado) => expect(origemDoContexto(ctx)).toEqual(esperado));
