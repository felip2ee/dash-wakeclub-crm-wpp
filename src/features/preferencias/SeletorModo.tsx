import { SeletorPreferencia } from "./SeletorTema";

export function SeletorModo({ className }: { className?: string }) {
  return (
    <SeletorPreferencia
      campo="modo"
      rotulo="Modo de cor"
      className={className}
      opcoes={[
        { valor: "sistema", texto: "Sistema" },
        { valor: "claro", texto: "Claro" },
        { valor: "escuro", texto: "Escuro" },
      ]}
    />
  );
}
