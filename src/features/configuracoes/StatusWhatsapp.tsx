import { useQuery } from "@tanstack/react-query";
import { Activity, MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { getSaudeNumero } from "@/server/saude";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";

export const CHAVE_SAUDE = ["saude-numero"];

export function useSaudeNumero() {
  return useQuery({
    queryKey: CHAVE_SAUDE,
    queryFn: () => getSaudeNumero(),
    refetchInterval: 60_000,
  });
}

// Status do número pela `v_saude_numero`: a view já decide o alerta; aqui só o texto.
export function StatusWhatsapp() {
  const saude = useSaudeNumero();
  const ok = saude.data?.alerta === "ok";

  return (
    <Secao
      id="whatsapp"
      icone={Activity}
      titulo="Status operacional"
      subtitulo="Conexão e operação dos canais."
    >
      {saude.isError ? (
        <ErroAoCarregar texto="Não deu para ler o status." tentar={() => void saude.refetch()} />
      ) : saude.isPending ? (
        <Carregando className="h-16" />
      ) : !saude.data ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Sem dados de conexão ainda: o monitor do número nunca rodou.
        </p>
      ) : (
        <div
          className={cn(
            "rounded-lg border p-3",
            ok ? "border-sucesso-whatsapp/50" : "border-destructive/50",
          )}
        >
          <p className="flex items-center gap-2 font-semibold">
            <MessageCircle aria-hidden className="h-5 w-5" />
            WhatsApp
          </p>
          <p className="mt-1 flex items-center gap-2 font-medium">
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                ok ? "bg-sucesso-whatsapp" : "bg-destructive",
              )}
            />
            {ok ? "Conectado" : `Atenção: ${saude.data.alerta}`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Instância: {saude.data.instancia} · 24h: {saude.data.enviadas24h} enviadas
            {saude.data.taxaEntrega24h !== null && ` · ${saude.data.taxaEntrega24h}% entregues`}
          </p>
        </div>
      )}
    </Secao>
  );
}
