import { Link } from "@tanstack/react-router";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";

import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Sessao } from "@/server/auth";
import { ROTULO_PAPEL } from "./navegacao";
import { useSair } from "./useSair";

// Usuário logado no rodapé da barra lateral (referência 02), com o menu da conta.
export function MenuUsuario({ sessao }: { sessao: Sessao }) {
  const encerrar = useSair();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu da conta de ${sessao.nome}`}
        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <AvatarIniciais nome={sessao.nome} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{sessao.nome}</span>
          <span className="block truncate text-xs text-sidebar-foreground/60">
            {ROTULO_PAPEL[sessao.papel]}
          </span>
        </span>
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem asChild className="min-h-11">
          <Link to="/perfil">
            <User aria-hidden />
            Perfil
          </Link>
        </DropdownMenuItem>
        {sessao.papel === "admin" && (
          <DropdownMenuItem asChild className="min-h-11">
            <Link to="/configuracoes">
              <Settings aria-hidden />
              Configurações
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-11" onSelect={() => void encerrar()}>
          <LogOut aria-hidden />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
