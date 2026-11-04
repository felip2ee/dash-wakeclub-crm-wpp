import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// O CRM não tem fotos: o avatar é sempre as iniciais, com cor fixa por nome.
export function corDoAvatar(nome: string): string {
  let h = 0;
  for (const c of nome.trim().toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `oklch(0.5 0.13 ${h % 360})`;
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = (p: string) => Array.from(p)[0];
  const ultima = partes.length > 1 ? primeira(partes[partes.length - 1]) : "";
  return (primeira(partes[0]) + ultima).toUpperCase();
}

const TAMANHOS = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

export function AvatarIniciais({
  nome,
  tamanho = "md",
  className,
}: {
  nome: string;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  return (
    <Avatar role="img" aria-label={nome} className={cn(TAMANHOS[tamanho], className)}>
      <AvatarFallback
        aria-hidden
        className="font-semibold text-white"
        style={{ backgroundColor: corDoAvatar(nome) }}
      >
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}
