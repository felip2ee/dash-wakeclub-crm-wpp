import { Link } from "@tanstack/react-router";
import { ChevronRight, LogOut, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { useSair } from "@/components/shell/useSair";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

export type SecaoCelular = {
  id: string;
  titulo: string;
  icone: LucideIcon;
  resumo: ReactNode;
  conteudo: ReactNode;
};

// Celular (referência 05, quarta tela): lista de cartões; cada um abre a seção numa folha.
// Perfil e Sair ficam no topo porque o admin não tem Perfil na barra inferior.
export function ListaCelular({ nome, secoes }: { nome: string; secoes: SecaoCelular[] }) {
  const encerrar = useSair();
  const [aberta, setAberta] = useState<string | null>(null);
  const atual = secoes.find((s) => s.id === aberta);

  // Link com âncora (ex.: /configuracoes#fila da Visão geral) abre a seção direto,
  // ao montar e quando só o hash muda com a tela já aberta.
  useEffect(() => {
    const abrirPeloHash = () => {
      const alvo = window.location.hash.slice(1);
      if (alvo && window.matchMedia("(max-width: 767px)").matches) setAberta(alvo);
    };
    abrirPeloHash();
    window.addEventListener("hashchange", abrirPeloHash);
    return () => window.removeEventListener("hashchange", abrirPeloHash);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Link
          to="/perfil"
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border border-border bg-card px-3 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AvatarIniciais nome={nome} tamanho="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{nome}</span>
            <span className="block text-sm text-muted-foreground">Perfil</span>
          </span>
          <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" />
        </Link>
        <button
          type="button"
          onClick={() => void encerrar()}
          className="flex min-h-14 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut aria-hidden className="h-4 w-4" />
          Sair
        </button>
      </div>

      <ul className="space-y-3">
        {secoes.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setAberta(s.id)}
              className="flex min-h-16 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <s.icone aria-hidden className="h-6 w-6 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{s.titulo}</span>
                <span className="block truncate text-sm text-muted-foreground">{s.resumo}</span>
              </span>
              <ChevronRight aria-hidden className="h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={atual !== undefined} onOpenChange={(aberto) => !aberto && setAberta(null)}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-4 pt-12 motion-reduce:animate-none sm:max-w-full"
        >
          {/* O título visível é o do próprio cartão; estes são para o leitor de tela. */}
          <SheetTitle className="sr-only">{atual?.titulo}</SheetTitle>
          <SheetDescription className="sr-only">Seção de configurações</SheetDescription>
          {atual?.conteudo}
        </SheetContent>
      </Sheet>
    </div>
  );
}
