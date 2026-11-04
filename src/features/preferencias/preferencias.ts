// Preferências de aparência (tema, modo, densidade) deste navegador. Ficam no
// localStorage e vão para o <html> como data-tema, data-densidade e a classe
// `dark`, que src/styles.css lê. SCRIPT_INLINE faz o mesmo antes da hidratação
// para a página não piscar no tema errado.

export type Preferencias = {
  tema: "verde" | "rosa";
  modo: "sistema" | "claro" | "escuro";
  densidade: "grande" | "medio" | "pequeno";
};

export const PREFERENCIAS_PADRAO: Preferencias = {
  tema: "verde",
  modo: "sistema",
  densidade: "medio",
};

const CHAVE = "wakecrm.preferencias";
const OPCOES = {
  tema: ["verde", "rosa"],
  modo: ["sistema", "claro", "escuro"],
  densidade: ["grande", "medio", "pequeno"],
} as const;

function escolher<K extends keyof Preferencias>(bruto: unknown, campo: K): Preferencias[K] {
  const valor = (bruto as Record<string, unknown> | null)?.[campo];
  return (OPCOES[campo] as readonly unknown[]).includes(valor)
    ? (valor as Preferencias[K])
    : PREFERENCIAS_PADRAO[campo];
}

export function lerPreferencias(storage?: Pick<Storage, "getItem">): Preferencias {
  let bruto: unknown = null;
  try {
    // localStorage pode não existir (SSR) ou lançar (Safari privado).
    bruto = JSON.parse((storage ?? localStorage).getItem(CHAVE) ?? "null");
  } catch {
    // dado corrompido ou storage bloqueado: vale o padrão
  }
  return {
    tema: escolher(bruto, "tema"),
    modo: escolher(bruto, "modo"),
    densidade: escolher(bruto, "densidade"),
  };
}

export function gravarPreferencias(p: Preferencias, storage?: Pick<Storage, "setItem">): void {
  try {
    (storage ?? localStorage).setItem(CHAVE, JSON.stringify(p));
  } catch {
    // shortcut: com storage bloqueado a escolha vale só até recarregar; sem alternativa no navegador.
  }
}

export function aplicarNoDocumento(
  p: Preferencias,
  doc: Document = document,
  matchMedia: (q: string) => Pick<MediaQueryList, "matches"> = (q) => window.matchMedia(q),
): void {
  const html = doc.documentElement;
  html.dataset.tema = p.tema;
  html.dataset.densidade = p.densidade;
  const escuro =
    p.modo === "escuro" ||
    (p.modo === "sistema" && matchMedia("(prefers-color-scheme: dark)").matches);
  html.classList.toggle("dark", escuro);
}

// Versão mínima de lerPreferencias + aplicarNoDocumento em JS puro, rodada no
// <head> antes do CSS pintar. Os testes executam esta string para não divergir.
export const SCRIPT_INLINE = `(function(){var p={};try{p=JSON.parse(localStorage.getItem(${JSON.stringify(CHAVE)}))||{}}catch(e){}try{var h=document.documentElement;h.dataset.tema=p.tema==="rosa"?"rosa":"verde";h.dataset.densidade=p.densidade==="grande"||p.densidade==="pequeno"?p.densidade:"medio";var m=p.modo==="claro"||p.modo==="escuro"?p.modo:"sistema";h.classList.toggle("dark",m==="escuro"||(m==="sistema"&&matchMedia("(prefers-color-scheme: dark)").matches))}catch(e){}})()`;
