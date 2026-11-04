/**
 * Campo de envio da conversa: texto (com `/` para respostas rápidas), anexo, áudio e
 * localização. Só é renderizado quando o servidor diz que há adaptador (`envioDisponivel`).
 */
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { MapPin, Mic, Paperclip, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { filtrarPorAtalho } from "@/features/respostas-rapidas/filtro";
import { enviarMensagem } from "@/server/envio";
import { listarRespostasRapidas } from "@/server/respostas-rapidas";

import { iniciarGravacao, paraBase64 } from "./gravador";

const MAX_BYTES = 16 * 1024 * 1024;

type EnvioApp = Parameters<typeof enviarMensagem>[0]["data"]["envio"];
type Gravacao = Awaited<ReturnType<typeof iniciarGravacao>>;

function tipoDoArquivo(mime: string): "imagem" | "video" | "documento" {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

export function Composer({ leadId, queryKey }: { leadId: string; queryKey: QueryKey }) {
  const cliente = useQueryClient();
  const [texto, setTexto] = useState("");
  const [gravacao, setGravacao] = useState<Gravacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  const { data: respostas = [] } = useQuery({
    queryKey: ["respostas-rapidas"],
    queryFn: () => listarRespostasRapidas(),
    enabled: texto.startsWith("/"),
  });
  const sugestoes = filtrarPorAtalho(respostas, texto);

  const envio = useMutation({
    mutationFn: (e: EnvioApp) => enviarMensagem({ data: { leadId, envio: e } }),
    onSuccess: (_r, e) => {
      setAviso(null);
      if (e.tipo === "texto") setTexto("");
      void cliente.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => setAviso(e.message),
  });

  const gravacaoAtual = useRef<Gravacao | null>(null);
  gravacaoAtual.current = gravacao;
  // Solta o microfone se a conversa fechar durante a gravação.
  useEffect(() => () => gravacaoAtual.current?.cancelar(), []);

  function enviarTexto() {
    const t = texto.trim();
    if (!t || envio.isPending) return;
    envio.mutate({ tipo: "texto", texto: t });
  }

  async function anexar(f: File | undefined) {
    if (!f || envio.isPending) return;
    if (f.size > MAX_BYTES) return setAviso("Arquivo acima de 16 MB.");
    try {
      envio.mutate({
        tipo: tipoDoArquivo(f.type),
        base64: await paraBase64(f),
        mime: f.type || "application/octet-stream",
        nomeArquivo: f.name,
      });
    } catch {
      setAviso("Não foi possível ler o arquivo.");
    } finally {
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  async function alternarGravacao() {
    if (envio.isPending) return;
    try {
      if (gravacao) {
        const g = gravacao;
        setGravacao(null);
        envio.mutate({ tipo: "audio", ...(await g.parar()) });
      } else {
        setGravacao(await iniciarGravacao());
      }
    } catch (e) {
      setAviso(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Permissão do microfone negada."
          : "Não foi possível usar o microfone.",
      );
    }
  }

  function enviarLocalizacao() {
    if (envio.isPending) return;
    navigator.geolocation.getCurrentPosition(
      (p) =>
        envio.mutate({
          tipo: "localizacao",
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        }),
      () => setAviso("Não foi possível obter a localização."),
    );
  }

  return (
    <div className="border-t border-border bg-card/70 px-3 py-2.5 backdrop-blur sm:px-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {sugestoes.length > 0 && (
          <ul className="max-h-40 overflow-auto rounded-md border bg-popover text-sm shadow-sm">
            {sugestoes.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full gap-2 px-3 py-2 text-left hover:bg-accent"
                  onClick={() => setTexto(r.texto)}
                >
                  <span className="font-medium">/{r.atalho}</span>
                  <span className="truncate text-muted-foreground">{r.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {aviso && (
          <p role="alert" className="text-xs text-destructive">
            {aviso}
          </p>
        )}
        <div className="flex items-end gap-1.5">
          <input
            ref={arquivo}
            type="file"
            hidden
            accept="image/*,video/*,.pdf,.doc,.docx"
            onChange={(e) => void anexar(e.target.files?.[0])}
          />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Anexar arquivo"
            disabled={envio.isPending}
            onClick={() => arquivo.current?.click()}
          >
            <Paperclip />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Enviar localização"
            disabled={envio.isPending}
            onClick={enviarLocalizacao}
          >
            <MapPin />
          </Button>
          <Button
            variant={gravacao ? "destructive" : "ghost"}
            size="icon"
            aria-label={gravacao ? "Parar e enviar áudio" : "Gravar áudio"}
            disabled={envio.isPending}
            onClick={() => void alternarGravacao()}
          >
            {gravacao ? <Square /> : <Mic />}
          </Button>
          <Textarea
            value={texto}
            rows={1}
            className="max-h-32 min-h-9 flex-1 resize-none"
            placeholder="Mensagem (/ para respostas rápidas)"
            aria-label="Mensagem"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarTexto();
              }
            }}
          />
          <Button
            size="icon"
            aria-label="Enviar mensagem"
            disabled={!texto.trim() || envio.isPending}
            onClick={enviarTexto}
          >
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}
