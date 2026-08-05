import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  MessageSquareText,
  KanbanSquare,
  BarChart3,
  Bot,
  Waves,
  Eye,
  LogOut,
  ListTodo,
  ShieldCheck,
  Smartphone,
  UsersRound,
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
import { Button } from "@/components/ui/button";
import { sair, type Sessao } from "@/server/auth";

/** `demo` marca a tela que ainda roda em dado falso — ver /templates. */
const navAdmin = [
  { title: "Visão geral", url: "/admin", icon: ShieldCheck },
  { title: "Conversas", url: "/", icon: MessageSquareText },
  { title: "Todos os leads", url: "/kanban", icon: KanbanSquare },
  { title: "IA e followups", url: "/wf02", icon: Bot },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Instalar app", url: "/instalar", icon: Smartphone },
] as const;

export function AppSidebar({ sessao }: { sessao: Sessao | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const router = useRouter();
  const nav =
    sessao?.papel === "admin"
      ? navAdmin
      : [
          { title: "Followups", url: "/followups" as const, icon: ListTodo },
          { title: "Meus leads", url: "/meus-leads" as const, icon: UsersRound },
          { title: "Instalar app", url: "/instalar" as const, icon: Smartphone },
        ];

  async function encerrarSessao() {
    await sair();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

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
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        {sessao && (
          <div className="flex items-center gap-2 px-2 py-2">
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium text-sidebar-foreground">{sessao.nome}</p>
              <p className="truncate text-[10px] capitalize text-sidebar-foreground/55">
                {sessao.papel}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => void encerrarSessao()}
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2 px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <Eye className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
          <span className="truncate text-[11px] leading-tight text-sidebar-foreground/60">
            Somente leitura. A equipe responde pelo WhatsApp.
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
