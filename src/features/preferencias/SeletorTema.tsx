import { useEffect, useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";

import { cn } from "@/lib/utils";
import {
  PREFERENCIAS_PADRAO,
  aplicarNoDocumento,
  gravarPreferencias,
  lerPreferencias,
  type Preferencias,
} from "./preferencias";

// Controle segmentado (role="radiogroup", setas do teclado pelo Radix) que grava
// e aplica um campo das preferências na hora. Base dos três seletores.
export function SeletorPreferencia<K extends keyof Preferencias>({
  campo,
  rotulo,
  opcoes,
  className,
}: {
  campo: K;
  rotulo: string;
  opcoes: { valor: Preferencias[K]; texto: string }[];
  className?: string;
}) {
  // Começa no padrão para casar com o HTML do servidor; o valor real vem do storage após montar.
  const [valor, setValor] = useState<string>(PREFERENCIAS_PADRAO[campo]);
  useEffect(() => setValor(lerPreferencias()[campo]), [campo]);

  function mudar(novo: string) {
    const p = { ...lerPreferencias(), [campo]: novo } as Preferencias;
    gravarPreferencias(p);
    aplicarNoDocumento(p);
    setValor(novo);
  }

  return (
    <RadioGroupPrimitive.Root
      aria-label={rotulo}
      value={valor}
      onValueChange={mudar}
      className={cn("inline-flex rounded-full border border-border bg-card p-1", className)}
    >
      {opcoes.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.valor}
          value={o.valor}
          className="min-h-11 min-w-11 cursor-pointer rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors data-[state=unchecked]:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-gradiente-primario data-[state=checked]:text-white motion-reduce:transition-none"
        >
          {o.texto}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export function SeletorTema({ className }: { className?: string }) {
  return (
    <SeletorPreferencia
      campo="tema"
      rotulo="Tema"
      className={className}
      opcoes={[
        { valor: "verde", texto: "Verde" },
        { valor: "rosa", texto: "Rosa" },
      ]}
    />
  );
}
