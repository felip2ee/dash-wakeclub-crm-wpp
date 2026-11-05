/**
 * Origem da conversa (anúncio, link, busca) lida do `contextInfo` do WhatsApp.
 *
 * Existe para a visão comercial saber de onde o lead veio, sem guardar o payload cru.
 */
import { obj, str, type Obj } from "./normalizar";
import type { OrigemApp, OrigemCanal, OrigemLead } from "./tipos";

const CANAL: Record<string, OrigemCanal> = {
  ctwa_ad: "anuncio",
  click_to_chat_link: "link",
  phone_number_hyperlink: "link",
  message_short_link: "link",
  global_search_new_chat: "busca",
  group_member_list: "outro",
};

const APPS = new Set<string>(["instagram", "facebook", "whatsapp"]);

/** Um `contextInfo`; `null` quando não há marca de origem. */
export function origemDoContexto(ctx: Obj): OrigemLead | null {
  const ad = obj(ctx.externalAdReply);
  const fonte = str(ctx.entryPointConversionSource);
  const ehAnuncio = fonte === "ctwa_ad" || str(ad.sourceType) === "ad";
  const canal: OrigemCanal | undefined = ehAnuncio
    ? "anuncio"
    : fonte
      ? (CANAL[fonte] ?? "outro")
      : undefined;
  if (!canal) return null;
  const app = str(ctx.entryPointConversionApp).toLowerCase();
  return {
    canal,
    app: APPS.has(app) ? (app as OrigemApp) : null,
    anuncioId: str(ad.sourceId) || null,
    anuncioTitulo: str(ad.title) || null,
  };
}
