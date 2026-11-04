import { Link } from "@tanstack/react-router";

import type { ItemNavegacao } from "./navegacao";

// Barra inferior do celular (referências 01 e 05): 4 abas, a ativa na cor primária.
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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {itens.map((item) => (
          <li key={item.url}>
            <Link
              to={item.url}
              activeOptions={{ exact: item.url === "/" }}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[status=active]:font-semibold data-[status=active]:text-primary"
            >
              <span className="relative">
                <item.icone aria-hidden className="h-6 w-6" />
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
