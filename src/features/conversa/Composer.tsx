/**
 * Campo de envio da conversa, no jeito do WhatsApp iOS: `＋` (foto ou vídeo, documento,
 * localização), campo que cresce até ~5 linhas (com `/` para respostas rápidas) e, à
 * direita, microfone com o campo vazio ou enviar com texto. Só é renderizado quando o
 * servidor diz que há adaptador (`envioDisponivel`).
 */
import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  FileText,
  Image as ImageIcon,
  MapPin,
  Mic,
  Plus,
  SendHorizontal,
  Square,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { filtrarPorAtalho } from "@/features/respostas-rapidas/filtro";
import { enviarMensagem } from "@/server/envio";
import { listarRespostasRapidas } from "@/server/respostas-rapidas";

import { iniciarGravacao, paraBase64 } from "./gravador";
import { CONSULTA_TOQUE, deveEnviarComEnter } from "./teclado";

const MAX_BYTES = 16 * 1024 * 1024;
const LINHAS_MAX = 5;
// Mesmos tipos que `MIME_DOCUMENTO` aceita no servidor.
const ACEITA_DOCUMENTO =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type EnvioApp = Parameters<typeof enviarMensagem>[0]["data"]["envio"];
type Gravacao = Awaited<ReturnType<typeof iniciarGravacao>>;

function tipoDoArquivo(mime: string): "imagem" | "video" | "documento" {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

/** Pede a posição (o navegador pergunta a permissão no toque); falha vira toast. */
function pedirLocalizacao(onPosicao: (c: GeolocationCoordinates) => void) {
  if (!("geolocation" in navigator)) {
    toast.error("Este aparelho não informa a localização.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => onPosicao(p.coords),
    (erro) =>
      toast.error(
        erro.code === erro.PERMISSION_DENIED
          ? "Permissão de localização negada. Libere nos ajustes do navegador."
          : "Não foi possível obter a localização.",
      ),
  );
}

/** `＋` do WhatsApp: um input por tipo para o seletor do aparelho já abrir no certo. */
function MenuAnexar({
  desabilitado,
  onArquivo,
  onLocalizacao,
}: {
  desabilitado: boolean;
  onArquivo: (input: HTMLInputElement) => void;
  onLocalizacao: () => void;
}) {
  const midia = useRef<HTMLInputElement>(null);
  const documento = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState(false);
  // O Safari só abre o seletor se o click() sair direto do toque. O preventDefault impede
  // o Radix de fechar e devolver o foco antes; o menu fecha logo depois do click().
  const escolher = (input: RefObject<HTMLInputElement | null>) => (e: Event) => {
    e.preventDefault();
    input.current?.click();
    setAberto(false);
  };
  return (
    <>
      <input
        ref={midia}
        type="file"
        hidden
        accept="image/*,video/*"
        onChange={(e) => onArquivo(e.currentTarget)}
      />
      <input
        ref={documento}
        type="file"
        hidden
        accept={ACEITA_DOCUMENTO}
        onChange={(e) => onArquivo(e.currentTarget)}
      />
      <DropdownMenu open={aberto} onOpenChange={setAberto}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Anexar"
            disabled={desabilitado}
            className="size-11 shrink-0 rounded-full [&_svg]:size-6"
          >
            <Plus />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem className="min-h-11" onSelect={escolher(midia)}>
              <ImageIcon aria-hidden />
              Foto ou vídeo
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={escolher(documento)}>
              <FileText aria-hidden />
              Documento
            </DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={onLocalizacao}>
              <MapPin aria-hidden />
              Localização
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** Direita do campo: microfone com o campo vazio, parar durante a gravação, enviar com texto. */
function BotaoDireito({
  modo,
  desabilitado,
  onGravar,
  onEnviar,
}: {
  modo: "gravar" | "gravando" | "enviar";
  desabilitado: boolean;
  onGravar: () => void;
  onEnviar: () => void;
}) {
  if (modo === "enviar") {
    return (
      <Button
        size="icon"
        aria-label="Enviar mensagem"
        disabled={desabilitado}
        className="size-11 shrink-0 rounded-full [&_svg]:size-5"
        onClick={onEnviar}
      >
        <SendHorizontal />
      </Button>
    );
  }
  const gravando = modo === "gravando";
  return (
    <Button
      variant={gravando ? "destructive" : "ghost"}
      size="icon"
      aria-label={gravando ? "Parar e enviar áudio" : "Gravar áudio"}
      disabled={desabilitado}
      className="size-11 shrink-0 rounded-full [&_svg]:size-6"
      onClick={onGravar}
    >
      {gravando ? <Square /> : <Mic />}
    </Button>
  );
}

export function Composer({ leadId, queryKey }: { leadId: string; queryKey: QueryKey }) {
  const cliente = useQueryClient();
  const [texto, setTexto] = useState("");
  const [gravacao, setGravacao] = useState<Gravacao | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

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

  // Cresce com o texto até ~5 linhas, depois rola por dentro; volta a 1 linha quando o
  // texto é enviado. O teto é calculado aqui porque iOS < 16.4 descarta o max-h com `lh`.
  // A borda (2px) entra porque o box-sizing é border-box.
  useLayoutEffect(() => {
    const el = campo.current;
    if (!el) return;
    const s = getComputedStyle(el);
    const maxima =
      parseFloat(s.lineHeight) * LINHAS_MAX +
      parseFloat(s.paddingTop) +
      parseFloat(s.paddingBottom) +
      2;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight + 2, maxima)}px`;
  }, [texto]);

  function enviarTexto() {
    const t = texto.trim();
    if (!t || envio.isPending) return;
    envio.mutate({ tipo: "texto", texto: t });
  }

  async function anexar(input: HTMLInputElement) {
    const f = input.files?.[0];
    try {
      if (!f || envio.isPending) return;
      if (f.size > MAX_BYTES) return setAviso("Arquivo acima de 16 MB.");
      envio.mutate({
        tipo: tipoDoArquivo(f.type),
        base64: await paraBase64(f),
        mime: f.type || "application/octet-stream",
        nomeArquivo: f.name,
      });
    } catch {
      setAviso("Não foi possível ler o arquivo.");
    } finally {
      input.value = "";
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
    pedirLocalizacao(({ latitude, longitude }) =>
      envio.mutate({ tipo: "localizacao", latitude, longitude }),
    );
  }

  const temTexto = texto.trim().length > 0;

  return (
    // Área segura do iPhone embaixo: a conversa no celular vai até a borda da tela.
    <div className="border-t border-border bg-card/70 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-4">
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
        <div className="flex items-end gap-1">
          <MenuAnexar
            desabilitado={envio.isPending}
            onArquivo={(input) => void anexar(input)}
            onLocalizacao={enviarLocalizacao}
          />
          <Textarea
            ref={campo}
            value={texto}
            rows={1}
            className="max-h-[calc(5lh+20px)] min-h-11 flex-1 resize-none overflow-y-auto rounded-[22px] bg-background px-4 py-[9px] leading-normal"
            placeholder="Digite / para atalhos"
            aria-label="Mensagem"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              const { key, shiftKey } = e;
              const tecla = { key, shiftKey, isComposing: e.nativeEvent.isComposing };
              if (deveEnviarComEnter(tecla, window.matchMedia(CONSULTA_TOQUE).matches)) {
                e.preventDefault();
                enviarTexto();
              }
            }}
          />
          <BotaoDireito
            modo={gravacao ? "gravando" : temTexto ? "enviar" : "gravar"}
            desabilitado={envio.isPending}
            onGravar={() => void alternarGravacao()}
            onEnviar={enviarTexto}
          />
        </div>
      </div>
    </div>
  );
}
