import { describe, expect, test } from "bun:test";

import { corDoAvatar, iniciais } from "@/components/ui/avatar-iniciais";
import {
  PREFERENCIAS_PADRAO,
  SCRIPT_INLINE,
  aplicarNoDocumento,
  gravarPreferencias,
  lerPreferencias,
  type Preferencias,
} from "./preferencias";

function storage(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => void dados.set(k, v),
  };
}

function documento() {
  const classes = new Set<string>();
  const documentElement = {
    dataset: {} as Record<string, string>,
    classList: {
      toggle: (c: string, forcar: boolean) => (forcar ? classes.add(c) : classes.delete(c), forcar),
    },
  };
  return { doc: { documentElement } as unknown as Document, html: documentElement, classes };
}

const sistema = (escuro: boolean) => () => ({ matches: escuro }) as MediaQueryList;

describe("lerPreferencias", () => {
  test("storage vazio devolve o padrão", () => {
    expect(lerPreferencias(storage())).toEqual(PREFERENCIAS_PADRAO);
  });
  test("JSON inválido devolve o padrão", () => {
    expect(lerPreferencias(storage({ "wakecrm.preferencias": "{quebrado" }))).toEqual(
      PREFERENCIAS_PADRAO,
    );
  });
  test("valor desconhecido cai no padrão só naquele campo", () => {
    const s = storage({
      "wakecrm.preferencias": JSON.stringify({ tema: "rosa", modo: "azul", densidade: "grande" }),
    });
    expect(lerPreferencias(s)).toEqual({ tema: "rosa", modo: "sistema", densidade: "grande" });
  });
  test("storage que lança devolve o padrão", () => {
    const quebrado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(lerPreferencias(quebrado)).toEqual(PREFERENCIAS_PADRAO);
  });
  test("lê o que gravarPreferencias gravou", () => {
    const s = storage();
    const p: Preferencias = { tema: "rosa", modo: "escuro", densidade: "pequeno" };
    gravarPreferencias(p, s);
    expect(lerPreferencias(s)).toEqual(p);
  });
});

describe("aplicarNoDocumento", () => {
  test("define data-tema, data-densidade e .dark no modo escuro", () => {
    const { doc, html, classes } = documento();
    aplicarNoDocumento({ tema: "rosa", modo: "escuro", densidade: "grande" }, doc, sistema(false));
    expect(html.dataset).toEqual({ tema: "rosa", densidade: "grande" });
    expect(classes.has("dark")).toBe(true);
  });
  test("modo claro tira .dark mesmo com sistema escuro", () => {
    const { doc, classes } = documento();
    classes.add("dark");
    aplicarNoDocumento({ ...PREFERENCIAS_PADRAO, modo: "claro" }, doc, sistema(true));
    expect(classes.has("dark")).toBe(false);
  });
  test("modo sistema segue matchMedia", () => {
    const escuro = documento();
    aplicarNoDocumento(PREFERENCIAS_PADRAO, escuro.doc, sistema(true));
    expect(escuro.classes.has("dark")).toBe(true);
    const claro = documento();
    aplicarNoDocumento(PREFERENCIAS_PADRAO, claro.doc, sistema(false));
    expect(claro.classes.has("dark")).toBe(false);
  });
});

describe("SCRIPT_INLINE", () => {
  const rodar = (s: ReturnType<typeof storage>, escuro: boolean) => {
    const d = documento();
    new Function("localStorage", "document", "matchMedia", SCRIPT_INLINE)(
      s,
      d.doc,
      sistema(escuro),
    );
    return d;
  };
  test("aplica o que está gravado", () => {
    const s = storage();
    gravarPreferencias({ tema: "rosa", modo: "escuro", densidade: "pequeno" }, s);
    const { html, classes } = rodar(s, false);
    expect(html.dataset).toEqual({ tema: "rosa", densidade: "pequeno" });
    expect(classes.has("dark")).toBe(true);
  });
  test("sem nada gravado usa o padrão e o sistema", () => {
    const { html, classes } = rodar(storage({ "wakecrm.preferencias": "{quebrado" }), true);
    expect(html.dataset).toEqual({ tema: "verde", densidade: "medio" });
    expect(classes.has("dark")).toBe(true);
  });
});

describe("corDoAvatar", () => {
  test("é estável para o mesmo nome", () => {
    expect(corDoAvatar("Tâmara")).toBe(corDoAvatar("Tâmara"));
    expect(corDoAvatar("Tâmara")).toBe(corDoAvatar("  tâmara "));
  });
  test("nomes diferentes podem ter cores diferentes", () => {
    const cores = new Set(["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio"].map(corDoAvatar));
    expect(cores.size).toBeGreaterThan(1);
  });
});

describe("iniciais", () => {
  test("primeiro e último nome", () => {
    expect(iniciais("Tâmara Silva")).toBe("TS");
    expect(iniciais("  ana  ")).toBe("A");
    expect(iniciais("")).toBe("?");
  });
});
