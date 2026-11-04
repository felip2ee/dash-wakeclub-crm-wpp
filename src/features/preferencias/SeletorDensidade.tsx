import { SeletorPreferencia } from "./SeletorTema";

export function SeletorDensidade({ className }: { className?: string }) {
  return (
    <SeletorPreferencia
      campo="densidade"
      rotulo="Densidade da interface"
      className={className}
      opcoes={[
        { valor: "grande", texto: "Grande" },
        { valor: "medio", texto: "Médio" },
        { valor: "pequeno", texto: "Pequeno" },
      ]}
    />
  );
}
