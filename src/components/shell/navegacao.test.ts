import { describe, expect, test } from "bun:test";

import {
  abasCelularAdmin,
  abasCelularAtendente,
  conversaAberta,
  leadSemConversa,
  itensDesktopAdmin,
  rotaInicial,
} from "./navegacao";

const urls = (itens: { url: string }[]) => itens.map((i) => i.url);
const titulos = (itens: { titulo: string }[]) => itens.map((i) => i.titulo);

describe("navegação por papel", () => {
  test("barra lateral do admin segue a referência 02", () => {
    expect(titulos(itensDesktopAdmin)).toEqual([
      "Visão geral",
      "Pipeline",
      "Conversas",
      "Follow-ups",
      "Revisão das decisões",
      "Fila de envio",
      "Vendas e comissões",
      "Equipe",
      "Configurações",
    ]);
    expect(urls(itensDesktopAdmin)).toEqual([
      "/visao-geral",
      "/pipeline",
      "/",
      "/aprovar",
      "/revisar-decisoes",
      "/fila-envio",
      "/vendas",
      "/equipe",
      "/configuracoes",
    ]);
  });

  test("celular do admin tem 4 abas", () => {
    expect(titulos(abasCelularAdmin)).toEqual(["Início", "Conversas", "Pipeline", "Config."]);
    expect(urls(abasCelularAdmin)).toEqual(["/visao-geral", "/", "/pipeline", "/configuracoes"]);
  });

  test("celular do atendente tem 4 abas", () => {
    expect(titulos(abasCelularAtendente)).toEqual(["Início", "Conversas", "Follow-ups", "Perfil"]);
    expect(urls(abasCelularAtendente)).toEqual(["/inicio", "/meus-leads", "/aprovar", "/perfil"]);
  });

  test("rotas antigas saem da navegação", () => {
    const todas = [...itensDesktopAdmin, ...abasCelularAdmin, ...abasCelularAtendente].map(
      (i) => i.url,
    );
    for (const antiga of ["/admin", "/kanban", "/wf02", "/reports", "/followups", "/minha-fila"]) {
      expect(todas).not.toContain(antiga);
    }
  });

  test("todo item tem ícone", () => {
    for (const item of [...itensDesktopAdmin, ...abasCelularAdmin, ...abasCelularAtendente]) {
      expect(item.icone).toBeDefined();
    }
  });
});

describe("rotaInicial", () => {
  test("admin vai para a visão geral, atendente para o início", () => {
    expect(rotaInicial("admin")).toBe("/visao-geral");
    expect(rotaInicial("atendente")).toBe("/inicio");
  });
});

describe("conversaAberta", () => {
  test("só com ?lead= nas listas de conversa", () => {
    expect(conversaAberta("/", { lead: "a" })).toBe(true);
    expect(conversaAberta("/meus-leads", { lead: "a" })).toBe(true);
    expect(conversaAberta("/", {})).toBe(false);
    expect(conversaAberta("/meus-leads", { lead: undefined })).toBe(false);
    expect(conversaAberta("/aprovar", { lead: "a" })).toBe(false);
  });
});

describe("leadSemConversa", () => {
  test("só limpa a URL quando há ?lead= e nenhuma conversa bate", () => {
    expect(leadSemConversa("a", false)).toBe(true);
    expect(leadSemConversa("a", true)).toBe(false);
    expect(leadSemConversa(undefined, false)).toBe(false);
  });
});
