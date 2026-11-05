import { Link } from "@tanstack/react-router";

import type { ItemNavegacao } from "./navegacao";

// Barra inferior do celular (referências 01 e 05), flutuante e translúcida como a do
// WhatsApp iOS: o conteúdo rola por baixo (as telas reservam --barra-inferior embaixo).
// Sem transparência quando o sistema pede menos transparência.
export function BarraInferior({
  itens,
  contagens,
}: {
  itens: ItemNavegacao[];
  contagens: Record<string, number>;
}) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-3 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-30 rounded-full border border-border bg-card/70 p-1 shadow-lg shadow-black/10 backdrop-blur-xl backdrop-saturate-150 transparencia-reduzida:bg-card transparencia-reduzida:backdrop-blur-none md:hidden"
    >
      <ul className="grid grid-cols-4">
        {itens.map((item) => (
          <li key={item.url}>
            <Link
              to={item.url}
              activeOptions={{ exact: item.url === "/" }}
              className="group flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none data-[status=active]:bg-accent data-[status=active]:font-semibold data-[status=active]:text-accent-foreground"
            >
              <span className="relative">
                <item.icone
                  aria-hidden
                  className="h-6 w-6 group-data-[status=active]:text-primary"
                />
                {contagens[item.url] > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-semibold leading-5 text-primary-foreground tabular-nums">
                    {contagens[item.url]}
                  </span>
                )}
              </span>
              {item.titulo}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
