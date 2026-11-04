/**
 * Regras determinísticas da entrada, portadas do WF-01
 * (docs/n8n-legado/wf-01-ingestor-evolution.json): telefone em E.164 com o 9º dígito
 * brasileiro e opt-out por regex (endurecida contra falso positivo de prefixo). Não
 * dependem do formato do Evolution Go.
 */

// Cada pedido termina em fim de palavra (o \b do JS não entende acento): "Parece ótimo"
// e "Sairia por quanto?" não são opt-out. `descadastr` é prefixo. "Não quero mais" só
// vale sozinho ou seguido de receber/mensagem ("não quero mais esperar" é outra coisa).
const OPT_OUT =
  /^(?:(?:pare|parar|para de (?:mandar|enviar)|sair|stop|remover?(?: meu)?|me tira|n[aã]o me (?:mand|envi)(?:em?|a)|nunca mais me)(?=$|[\s.!?,;])|descadastr|n[aã]o quero mais(?=\s*(?:$|[.!?,;]|receber|mensag)))/i;

export function paraE164(entrada: string): string | null {
  let d = String(entrada || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && d.length === 12) {
    const ddd = d.slice(2, 4);
    const local = d.slice(4);
    if (/^[6-9]/.test(local)) d = "55" + ddd + "9" + local;
  }
  if (d.length < 8 || d.length > 15) return null;
  if (d[0] === "0") return null;
  return "+" + d;
}

export function ehOptOut(texto: string): boolean {
  const limpo = texto.trim();
  return limpo.length <= 60 && OPT_OUT.test(limpo);
}
