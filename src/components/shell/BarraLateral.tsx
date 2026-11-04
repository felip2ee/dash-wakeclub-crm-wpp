import { Link } from "@tanstack/react-router";
import { Waves } from "lucide-react";

import type { Sessao } from "@/server/auth";
import { MenuUsuario } from "./MenuUsuario";
import { ROTULO_PAPEL, type ItemNavegacao } from "./navegacao";

// Barra lateral do desktop (referência 02): logo, itens e usuário no rodapé.
export function BarraLateral({
  sessao,
  itens,
  contagens,
}: {
  sessao: Sessao;
  itens: ItemNavegacao[];
  contagens: Record<string, number>;
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradiente-primario text-white">
          <Waves aria-hidden className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold leading-tight">Wake Club</p>
          <p className="truncate text-xs text-sidebar-foreground/60">
            {ROTULO_PAPEL[sessao.papel]}
          </p>
        </div>
      </div>
      <div className="mx-5 h-px bg-sidebar-border" />

      <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {itens.map((item) => (
            <li key={item.url}>
              <Link
                to={item.url}
                activeOptions={{ exact: item.url === "/" }}
                className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[status=active]:bg-gradiente-primario data-[status=active]:font-semibold data-[status=active]:text-white motion-reduce:transition-none"
              >
                <item.icone aria-hidden className="h-5 w-5 shrink-0" />
                <span className="flex-1 truncate">{item.titulo}</span>
                {contagens[item.url] > 0 && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground tabular-nums">
                    {contagens[item.url]}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-5 h-px bg-sidebar-border" />
      <div className="p-3">
        <MenuUsuario sessao={sessao} />
      </div>
    </aside>
  );
}
