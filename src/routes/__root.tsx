import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Toaster } from "@/components/ui/sonner";
import { getSaudeNumero, type SaudeNumero } from "@/server/saude";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar para o inbox
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente ou volte ao inbox.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Wake Club — CRM" },
      {
        name: "description",
        content:
          "Painel de leitura do CRM da Wake Club: conversas, funil de leads, relatórios e o que a IA do WF-02 está decidindo.",
      },
      { property: "og:title", content: "Wake Club — CRM" },
      { property: "og:description", content: "Espelho somente-leitura do CRM da Wake Club." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  // A saúde do número vive no cabeçalho de todas as telas. O try/catch é
  // deliberado: se o banco cair, o painel ainda tem que conseguir renderizar
  // para que cada rota mostre o próprio erro, que explica melhor o problema.
  loader: async (): Promise<{ saude: SaudeNumero | null }> => {
    try {
      return { saude: await getSaudeNumero() };
    } catch {
      return { saude: null };
    }
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { saude } = Route.useLoaderData();

  return (
    <QueryClientProvider client={queryClient}>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur sm:gap-3 sm:px-4">
              <SidebarTrigger />
              <div className="hidden h-5 w-px bg-border sm:block" />
              <SaudeDoNumero saude={saude} />
            </header>
            <main className="min-h-0 flex-1">
              <Outlet />
            </main>
          </SidebarInset>
        </div>
        <Toaster />
      </SidebarProvider>
    </QueryClientProvider>
  );
}

/**
 * O estado real da Evolution, vindo de `v_saude_numero` (§13). A view já
 * resolve o alerta cruzando três sinais — aqui só se escolhe a cor.
 *
 * Não confundir "ok" com "tudo bem": `evolution muda` significa que o
 * heartbeat está velho, e nesse caso nada mais do painel é confiável, porque
 * o estado gravado pode ser de horas atrás.
 */
const ALERTA_ESTILO: Record<string, { cor: string; grave: boolean }> = {
  ok: { cor: "bg-primary", grave: false },
  "qr pendente": { cor: "bg-warning", grave: true },
  "entrega travada": { cor: "bg-warning", grave: true },
  "evolution muda": { cor: "bg-warning", grave: true },
  "sem heartbeat": { cor: "bg-destructive", grave: true },
  "evolution respondendo erro": { cor: "bg-destructive", grave: true },
  desconectado: { cor: "bg-destructive", grave: true },
};

function SaudeDoNumero({ saude }: { saude: SaudeNumero | null }) {
  if (!saude) {
    return (
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span className="inline-flex h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
        <span className="truncate text-muted-foreground">Saúde do número indisponível</span>
      </div>
    );
  }

  const estilo = ALERTA_ESTILO[saude.alerta] ?? {
    cor: "bg-muted-foreground",
    grave: false,
  };

  return (
    <>
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <span
          className={`inline-flex h-2 w-2 shrink-0 rounded-full ${estilo.cor} ${estilo.grave ? "" : "animate-pulse"}`}
        />
        <span className="hidden shrink-0 text-muted-foreground sm:inline">
          {saude.instancia} ·{" "}
        </span>
        <span
          className={`truncate font-medium ${estilo.grave ? "text-destructive" : "text-foreground"}`}
        >
          {saude.alerta === "ok" ? "conectada" : saude.alerta}
        </span>
      </div>

      <div className="ml-auto hidden shrink-0 text-xs text-muted-foreground md:block">
        24h ·{" "}
        <span className="font-medium text-foreground">
          {saude.enviadas24h} enviadas
          {saude.taxaEntrega24h !== null && ` · ${saude.taxaEntrega24h}% entregues`}
        </span>
      </div>
    </>
  );
}
