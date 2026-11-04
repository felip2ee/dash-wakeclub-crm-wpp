import {
  CalendarCheck,
  Coins,
  Filter,
  House,
  MessageCircle,
  Settings,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Sessao } from "@/server/auth";

// Itens da navegação por papel (spec da interface §3). As rotas antigas
// (/admin, /kanban, /wf02, /reports, /followups, /minha-fila) seguem no ar por URL.
export type ItemNavegacao = { titulo: string; url: string; icone: LucideIcon };

export const itensDesktopAdmin: ItemNavegacao[] = [
  { titulo: "Visão geral", url: "/visao-geral", icone: House },
  { titulo: "Pipeline", url: "/pipeline", icone: Filter },
  { titulo: "Conversas", url: "/", icone: MessageCircle },
  { titulo: "Follow-ups", url: "/aprovar", icone: CalendarCheck },
  { titulo: "Vendas e comissões", url: "/vendas", icone: Coins },
  { titulo: "Equipe", url: "/equipe", icone: Users },
  { titulo: "Configurações", url: "/configuracoes", icone: Settings },
];

export const abasCelularAdmin: ItemNavegacao[] = [
  { titulo: "Início", url: "/visao-geral", icone: House },
  { titulo: "Conversas", url: "/", icone: MessageCircle },
  { titulo: "Pipeline", url: "/pipeline", icone: Filter },
  { titulo: "Config.", url: "/configuracoes", icone: Settings },
];

// O atendente usa as mesmas 4 entradas no desktop e no celular.
export const abasCelularAtendente: ItemNavegacao[] = [
  { titulo: "Início", url: "/inicio", icone: House },
  { titulo: "Conversas", url: "/meus-leads", icone: MessageCircle },
  { titulo: "Follow-ups", url: "/aprovar", icone: CalendarCheck },
  { titulo: "Perfil", url: "/perfil", icone: User },
];

export function rotaInicial(papel: Sessao["papel"]): "/visao-geral" | "/inicio" {
  return papel === "admin" ? "/visao-geral" : "/inicio";
}

export const ROTULO_PAPEL: Record<Sessao["papel"], string> = {
  admin: "Admin",
  atendente: "Atendente",
};
