/**
 * Enter no Composer, como no WhatsApp: no desktop Enter envia e Shift+Enter quebra linha;
 * no toque (sem hover, ponteiro grosso) Enter quebra linha e o envio é só pelo botão.
 */
export const CONSULTA_TOQUE = "(hover: none) and (pointer: coarse)";

export function deveEnviarComEnter(
  evento: { key: string; shiftKey: boolean; isComposing: boolean },
  toqueGrosso: boolean,
): boolean {
  return evento.key === "Enter" && !evento.shiftKey && !evento.isComposing && !toqueGrosso;
}
