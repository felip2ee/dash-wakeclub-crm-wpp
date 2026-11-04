import { useQuery } from "@tanstack/react-query";
import { Copy, Eye, EyeOff, Webhook } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { getWebhooks, type WebhookDestino } from "@/server/configuracoes";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";

const CHAVE_WEBHOOKS = ["webhooks"];

// Eventos que o motor lê; a Evolution só aceita uma URL por instância.
const EVENTOS_EVOLUTION = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
  "LOGOUT_INSTANCE",
];

const botao =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

async function copiar(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${rotulo} copiado.`);
  } catch {
    toast.error(`Não foi possível copiar ${rotulo.toLowerCase()}.`);
  }
}

function Campo({
  rotulo,
  valor,
  secreto = false,
}: {
  rotulo: string;
  valor: string;
  secreto?: boolean;
}) {
  const [visivel, setVisivel] = useState(!secreto);
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2.5 font-mono text-sm">
          {visivel ? valor : "•".repeat(16)}
        </code>
        {secreto && (
          <button
            type="button"
            className={botao}
            aria-label={
              visivel ? `Ocultar ${rotulo.toLowerCase()}` : `Mostrar ${rotulo.toLowerCase()}`
            }
            aria-pressed={visivel}
            onClick={() => setVisivel((v) => !v)}
          >
            {visivel ? (
              <EyeOff aria-hidden className="h-4 w-4" />
            ) : (
              <Eye aria-hidden className="h-4 w-4" />
            )}
          </button>
        )}
        <button
          type="button"
          className={botao}
          aria-label={`Copiar ${rotulo.toLowerCase()}`}
          onClick={() => void copiar(valor, rotulo)}
        >
          <Copy aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Destino({
  titulo,
  destino,
  children,
}: {
  titulo: string;
  destino: WebhookDestino;
  children?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="font-semibold">{titulo}</p>
      <Campo rotulo="URL" valor={destino.url} />
      {destino.segredo && destino.urlComToken ? (
        <>
          <Campo rotulo="Segredo (header x-webhook-secret)" valor={destino.segredo} secreto />
          <Campo
            rotulo="URL com token (se não der para usar header)"
            valor={destino.urlComToken}
            secreto
          />
        </>
      ) : (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          Segredo não configurado no servidor: sem ele o webhook responde 404.
        </p>
      )}
      {children}
    </div>
  );
}

// Endereços para colar na Evolution e no sistema de vendas. Só admin chega aqui.
export function Webhooks() {
  const webhooks = useQuery({ queryKey: CHAVE_WEBHOOKS, queryFn: () => getWebhooks() });

  return (
    <Secao
      id="webhooks"
      icone={Webhook}
      titulo="Webhooks"
      subtitulo="Copie para a Evolution e para o sistema de vendas. Prefira o segredo no header."
    >
      {webhooks.isError ? (
        <ErroAoCarregar
          texto="Não deu para ler os webhooks."
          tentar={() => void webhooks.refetch()}
        />
      ) : webhooks.isPending ? (
        <Carregando />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Destino titulo="Evolution (WhatsApp)" destino={webhooks.data.evolution}>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Eventos para ligar</p>
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {EVENTOS_EVOLUTION.map((e) => (
                  <li key={e} className="rounded-md bg-muted px-2 py-1 font-mono text-xs">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          </Destino>
          <Destino titulo="Sistema de vendas" destino={webhooks.data.vendas} />
        </div>
      )}
    </Secao>
  );
}
