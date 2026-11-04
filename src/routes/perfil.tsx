import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight, LogOut, Smartphone } from "lucide-react";
import type { ReactNode } from "react";

import { ROTULO_PAPEL } from "@/components/shell/navegacao";
import { useSair } from "@/components/shell/useSair";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import { SeletorDensidade } from "@/features/preferencias/SeletorDensidade";
import { SeletorModo } from "@/features/preferencias/SeletorModo";
import { SeletorTema } from "@/features/preferencias/SeletorTema";
import { exigirSessao } from "@/server/auth";

export const Route = createFileRoute("/perfil")({
  beforeLoad: async () => ({ sessao: await exigirSessao() }),
  head: () => ({ meta: [{ title: "Perfil — Wake Club" }] }),
  component: PerfilPage,
});

function PerfilPage() {
  const { sessao } = Route.useRouteContext();
  const encerrar = useSair();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <h1 className="font-display text-3xl font-bold">Perfil</h1>

      <section className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
        <AvatarIniciais nome={sessao.nome} tamanho="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold">{sessao.nome}</p>
          <p className="truncate text-sm text-muted-foreground">
            {sessao.usuario} · {ROTULO_PAPEL[sessao.papel]}
          </p>
        </div>
      </section>

      <section
        aria-labelledby="aparencia"
        className="space-y-4 rounded-xl border border-border bg-card p-4"
      >
        <div>
          <h2 id="aparencia" className="font-semibold">
            Aparência
          </h2>
          <p className="text-sm text-muted-foreground">Se aplica a todo o CRM neste navegador.</p>
        </div>
        <Preferencia rotulo="Tema">
          <SeletorTema />
        </Preferencia>
        <Preferencia rotulo="Modo">
          <SeletorModo />
        </Preferencia>
        <Preferencia rotulo="Tamanho da interface">
          <SeletorDensidade />
        </Preferencia>
      </section>

      <Link
        to="/instalar"
        className="flex min-h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Smartphone aria-hidden className="h-5 w-5 text-primary" />
        <span className="flex-1 font-medium">Instalar app e notificações</span>
        <ChevronRight aria-hidden className="h-5 w-5 text-muted-foreground" />
      </Link>

      <Button
        type="button"
        variant="outline"
        className="h-12 w-full"
        onClick={() => void encerrar()}
      >
        <LogOut aria-hidden />
        Sair
      </Button>
    </div>
  );
}

function Preferencia({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{rotulo}</span>
      {children}
    </div>
  );
}
