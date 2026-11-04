import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Info, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

import {
  PREFERENCIAS_PADRAO,
  aplicarNoDocumento,
  gravarPreferencias,
  lerPreferencias,
  type Preferencias,
} from "@/features/preferencias/preferencias";
import { Secao } from "./Secao";

const OPCOES: {
  valor: Preferencias["densidade"];
  titulo: string;
  texto: string;
  linhas: number;
}[] = [
  { valor: "grande", titulo: "Grande", texto: "Menos informações por tela", linhas: 2 },
  { valor: "medio", titulo: "Médio", texto: "Equilíbrio", linhas: 3 },
  { valor: "pequeno", titulo: "Pequeno", texto: "Mais informações por tela", linhas: 5 },
];

// Densidade como cartões com miniatura (referência 02); grava igual ao seletor do Perfil.
export function TamanhoInterface() {
  // Começa no padrão para casar com o HTML do servidor; o valor real vem do storage após montar.
  const [valor, setValor] = useState<string>(PREFERENCIAS_PADRAO.densidade);
  useEffect(() => setValor(lerPreferencias().densidade), []);

  function mudar(novo: string) {
    const p = { ...lerPreferencias(), densidade: novo as Preferencias["densidade"] };
    gravarPreferencias(p);
    aplicarNoDocumento(p);
    setValor(novo);
  }

  return (
    <Secao
      id="tamanho"
      icone={Monitor}
      titulo="Tamanho da interface"
      subtitulo="Define a densidade de informações em todo o painel (dashboard, listas, tabelas e cards)."
    >
      <RadioGroupPrimitive.Root
        aria-label="Tamanho da interface"
        value={valor}
        onValueChange={mudar}
        className="grid gap-3 sm:grid-cols-3"
      >
        {OPCOES.map((o) => (
          <RadioGroupPrimitive.Item
            key={o.valor}
            value={o.valor}
            className="group flex min-h-11 items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-transparent data-[state=checked]:bg-gradiente-primario data-[state=checked]:text-white motion-reduce:transition-none"
          >
            <span
              aria-hidden
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-current"
            >
              <span className="hidden h-2.5 w-2.5 rounded-full bg-current group-data-[state=checked]:block" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{o.titulo}</span>
              <span className="block text-sm">{o.texto}</span>
            </span>
            <span
              aria-hidden
              className="flex w-14 shrink-0 flex-col gap-1 rounded-md border border-current/30 p-1.5"
            >
              {Array.from({ length: o.linhas }, (_, i) => (
                <span key={i} className="h-1 rounded-full bg-current opacity-60" />
              ))}
            </span>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Info aria-hidden className="h-4 w-4 shrink-0" />O tamanho da interface se aplica a todo o
        CRM neste navegador (dashboard, listas, tabelas e cards).
      </p>
    </Secao>
  );
}
