import { Link, useRouterState } from "@tanstack/react-router";
import {
  MessageSquareText,
  KanbanSquare,
  BarChart3,
  Megaphone,
  Bot,
  Waves,
  Eye,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

/** `demo` marca a tela que ainda roda em dado falso — ver /templates. */
const nav = [
  { title: "Conversas", url: "/", icon: MessageSquareText },
  { title: "Kanban de leads", url: "/kanban", icon: KanbanSquare },
  { title: "Motor de IA (WF-02)", url: "/wf02", icon: Bot },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Disparos", url: "/templates", icon: Megaphone, demo: true },
] as const;

export function AppSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2.5 px-2 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
            <Waves className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-display text-[15px] font-semibold leading-tight text-sidebar-foreground">
              Wake Club
            </span>
            <span className="text-[11px] text-sidebar-foreground/60">
              CRM · espelho do WhatsApp
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => {
                const active = pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {"demo" in item && item.demo && (
                          <Badge
                            variant="outline"
                            className="h-5 rounded-full border-sidebar-border px-1.5 text-[10px] font-normal text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden"
                          >
                            demo
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Sem usuário logado: o painel ainda não tem autenticação — vai ficar
          atrás do Traefik. Mostrar um nome fixo aqui seria mentira na tela. */}
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <Eye className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
          <span className="truncate text-[11px] leading-tight text-sidebar-foreground/60">
            Somente leitura. A equipe responde pelo WhatsApp.
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
