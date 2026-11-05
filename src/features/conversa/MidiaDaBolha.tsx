import { Download, FileText, ImageOff, X } from "lucide-react";
import { useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TipoMidiaVisual } from "@/server/conversas";

import { nomeDoDocumento } from "./linha-do-tempo";

type Props = { mensagemId: string; daEquipe: boolean };

const autor = (daEquipe: boolean) => (daEquipe ? "pela equipe" : "pelo lead");

function Indisponivel() {
  return (
    <p className="flex min-h-11 items-center gap-1.5 text-sm italic opacity-75">
      <ImageOff aria-hidden className="h-4 w-4" /> Mídia indisponível
    </p>
  );
}

/** Player nativo do áudio; a transcrição fica embaixo, na bolha. */
export function AudioDaBolha({ mensagemId, daEquipe }: Props) {
  const [erro, setErro] = useState(false);
  if (erro) return <Indisponivel />;
  return (
    <audio
      controls
      preload="none"
      src={`/api/midia/${mensagemId}`}
      onError={() => setErro(true)}
      aria-label={`Áudio enviado ${autor(daEquipe)}`}
      className="mb-1 h-11 w-64 max-w-full"
    />
  );
}

/** Imagem, figurinha, vídeo ou documento dentro da bolha. */
export function MidiaDaBolha({
  tipo,
  texto,
  ...props
}: Props & { tipo: TipoMidiaVisual; texto: string | null }) {
  const [erro, setErro] = useState(false);
  if (erro) return <Indisponivel />;
  const src = `/api/midia/${props.mensagemId}`;
  if (tipo === "video") {
    return (
      <video
        controls
        preload="metadata"
        playsInline
        src={src}
        onError={() => setErro(true)}
        aria-label={`Vídeo enviado ${autor(props.daEquipe)}`}
        className="mb-1 max-h-72 w-72 max-w-full rounded-xl bg-black"
      />
    );
  }
  if (tipo === "documento") {
    const nome = nomeDoDocumento(texto) ?? "Documento";
    return (
      <a
        href={src}
        download
        aria-label={`Baixar ${nome}`}
        className={cn(
          "mb-1 flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          props.daEquipe ? "bg-white/15 hover:bg-white/25" : "bg-background/60 hover:bg-background",
        )}
      >
        <FileText aria-hidden className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{nome}</span>
        <Download aria-hidden className="h-4 w-4 shrink-0" />
      </a>
    );
  }
  return <ImagemDaBolha {...props} src={src} figurinha={tipo === "figurinha"} onErro={setErro} />;
}

function ImagemDaBolha({
  daEquipe,
  src,
  figurinha,
  onErro,
}: Omit<Props, "mensagemId"> & { src: string; figurinha: boolean; onErro: (e: true) => void }) {
  const alt = `Imagem enviada ${autor(daEquipe)}`;
  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Ampliar ${alt.toLowerCase()}`}
        className="mb-1 block min-h-11 min-w-11 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => onErro(true)}
          className={cn("max-w-full object-cover", figurinha ? "max-h-32" : "max-h-64 rounded-xl")}
        />
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="max-w-[min(96vw,64rem)] place-items-center border-0 bg-black/95 p-2 [&>button:last-child]:hidden"
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <img src={src} alt={alt} className="max-h-[85dvh] max-w-full object-contain" />
        <DialogClose
          aria-label="Fechar imagem"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X aria-hidden className="h-5 w-5" />
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
