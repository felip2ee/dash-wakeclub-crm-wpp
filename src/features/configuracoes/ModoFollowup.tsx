import { Gauge } from "lucide-react";

import { Ritmo } from "@/features/admin/Ritmo";
import { Secao } from "./Secao";

export function ModoFollowup() {
  return (
    <Secao
      id="modo-followup"
      icone={Gauge}
      titulo="Modo de follow-up"
      subtitulo="Defina o ritmo de follow-ups automáticos para todo o CRM."
    >
      <Ritmo />
    </Secao>
  );
}
