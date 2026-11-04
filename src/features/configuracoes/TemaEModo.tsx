import { Palette } from "lucide-react";

import { SeletorModo } from "@/features/preferencias/SeletorModo";
import { SeletorTema } from "@/features/preferencias/SeletorTema";
import { Secao } from "./Secao";

export function TemaEModo() {
  return (
    <Secao
      id="tema"
      icone={Palette}
      titulo="Tema e modo"
      subtitulo="Cores do CRM neste navegador. O layout não muda entre os temas."
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Tema</span>
          <SeletorTema />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">Modo</span>
          <SeletorModo />
        </div>
      </div>
    </Secao>
  );
}
