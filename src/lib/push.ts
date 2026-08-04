import { getChavePublicaPush, salvarInscricao } from "@/server/push";

export function apelidoDoAparelho(userAgent: string) {
  if (/iPhone/.test(userAgent)) return "iPhone · Safari";
  if (/iPad/.test(userAgent)) return "iPad · Safari";
  if (/Android/.test(userAgent)) return "Android · Chrome";
  if (/Macintosh/.test(userAgent)) return "Mac · navegador";
  if (/Windows/.test(userAgent)) return "Windows · navegador";
  return "Navegador";
}

/** Deve ser chamada diretamente por um clique: o iOS rejeita pedidos fora do gesto. */
export async function ativarPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Este navegador não oferece suporte a notificações Web Push.");
  }

  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") {
    throw new Error("A permissão de notificações não foi concedida.");
  }

  const chavePublica = await getChavePublicaPush();
  const registro = await navigator.serviceWorker.ready;
  const existente = await registro.pushManager.getSubscription();
  const inscricao =
    existente ??
    (await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlParaUint8Array(chavePublica),
    }));

  const json = inscricao.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("O navegador devolveu uma inscrição incompleta.");
  }

  await salvarInscricao({
    data: {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      apelido: apelidoDoAparelho(navigator.userAgent),
    },
  });

  return inscricao;
}

function base64UrlParaUint8Array(valor: string) {
  const preenchimento = "=".repeat((4 - (valor.length % 4)) % 4);
  const base64 = (valor + preenchimento).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = window.atob(base64);
  return Uint8Array.from(bruto, (caractere) => caractere.charCodeAt(0));
}
