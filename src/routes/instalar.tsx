import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Check,
  CircleHelp,
  Download,
  LoaderCircle,
  MoreVertical,
  Share,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ativarPush } from "@/lib/push";
import { exigirSessao } from "@/server/auth";
import { testarMinhaNotificacao } from "@/server/push";

type EventoInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type EstadoPwa = {
  instalado: boolean;
  permissao: NotificationPermission | "indisponível";
  inscrito: boolean;
};

export const Route = createFileRoute("/instalar")({
  beforeLoad: async () => ({ sessao: await exigirSessao() }),
  head: () => ({ meta: [{ title: "Instalar app — Wake Club" }] }),
  component: InstalarPage,
});

function InstalarPage() {
  const [eventoInstalacao, setEventoInstalacao] = useState<EventoInstalacao | null>(null);
  const [ativando, setAtivando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [estado, setEstado] = useState<EstadoPwa>({
    instalado: false,
    permissao: "indisponível",
    inscrito: false,
  });

  const agente = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(agente);
  const android = /Android/.test(agente);

  useEffect(() => {
    const atualizar = async () => {
      const instalado = window.matchMedia("(display-mode: standalone)").matches;
      const permissao = "Notification" in window ? Notification.permission : "indisponível";
      let inscrito = false;

      if ("serviceWorker" in navigator) {
        const registro = await navigator.serviceWorker.getRegistration();
        inscrito = Boolean(await registro?.pushManager.getSubscription());
      }

      setEstado({ instalado, permissao, inscrito });
    };

    const capturar = (evento: Event) => {
      evento.preventDefault();
      setEventoInstalacao(evento as EventoInstalacao);
    };

    void atualizar();
    window.addEventListener("beforeinstallprompt", capturar);
    return () => window.removeEventListener("beforeinstallprompt", capturar);
  }, []);

  async function instalarAndroid() {
    if (!eventoInstalacao) return;
    await eventoInstalacao.prompt();
    const escolha = await eventoInstalacao.userChoice;
    if (escolha.outcome === "accepted") setEventoInstalacao(null);
  }

  async function ativarNotificacoes() {
    setAtivando(true);
    try {
      await ativarPush();
      setEstado((atual) => ({ ...atual, permissao: "granted", inscrito: true }));
      toast.success("Notificações ativadas neste aparelho.");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível ativar notificações.");
    } finally {
      setAtivando(false);
    }
  }

  async function testarNotificacao() {
    setTestando(true);
    try {
      const resultado = await testarMinhaNotificacao();
      if (resultado.enviados > 0) toast.success("Notificação de teste enviada.");
      else toast.error("Nenhum aparelho recebeu o teste.");
    } catch {
      toast.error("Não foi possível enviar a notificação de teste.");
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Instalar o app</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coloque a Wake Club na Tela de Início para abrir direto nos followups.
          </p>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Estado deste aparelho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <EstadoItem pronto={estado.instalado} texto="App aberto em modo instalado" />
          <EstadoItem
            pronto={estado.permissao === "granted"}
            texto={
              estado.permissao === "indisponível"
                ? "Notificações indisponíveis neste navegador"
                : `Permissão de notificação: ${rotuloPermissao(estado.permissao)}`
            }
          />
          <EstadoItem pronto={estado.inscrito} texto="Aparelho inscrito para receber push" />
          {!estado.inscrito ? (
            <Button
              type="button"
              className="h-11 w-full"
              disabled={ativando || (ios && !estado.instalado)}
              onClick={() => void ativarNotificacoes()}
            >
              {ativando ? <LoaderCircle className="animate-spin" /> : <Bell />}
              {ativando ? "Ativando…" : "Ativar notificações"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={testando}
              onClick={() => void testarNotificacao()}
            >
              {testando ? <LoaderCircle className="animate-spin" /> : <Bell />}
              {testando ? "Enviando…" : "Testar notificação"}
            </Button>
          )}
          {ios && !estado.instalado && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              No iPhone, instale primeiro e abra pelo ícone para liberar as notificações.
            </p>
          )}
        </CardContent>
      </Card>

      {(ios || !android) && <InstrucoesIos destaque={ios} />}
      {(android || !ios) && (
        <InstrucoesAndroid
          destaque={android}
          podeInstalar={Boolean(eventoInstalacao)}
          onInstalar={() => void instalarAndroid()}
        />
      )}
    </div>
  );
}

function EstadoItem({ pronto, texto }: { pronto: boolean; texto: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
      <span
        className={
          pronto
            ? "grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground"
            : "grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground"
        }
      >
        {pronto ? <Check className="h-4 w-4" /> : <CircleHelp className="h-4 w-4" />}
      </span>
      <span className="text-sm">{texto}</span>
    </div>
  );
}

function InstrucoesIos({ destaque }: { destaque: boolean }) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">iPhone ou iPad</CardTitle>
        {destaque && <Badge>Este aparelho</Badge>}
      </CardHeader>
      <CardContent>
        <ol className="space-y-4 text-sm">
          <Passo numero="1" icone={Share}>
            Abra esta página no <strong>Safari</strong>.
          </Passo>
          <Passo numero="2" icone={Share}>
            Toque no botão <strong>Compartilhar</strong>.
          </Passo>
          <Passo numero="3" icone={Download}>
            Escolha <strong>Adicionar à Tela de Início</strong>.
          </Passo>
          <Passo numero="4" icone={Bell}>
            Abra pelo novo ícone para depois permitir notificações.
          </Passo>
        </ol>
      </CardContent>
    </Card>
  );
}

function InstrucoesAndroid({
  destaque,
  podeInstalar,
  onInstalar,
}: {
  destaque: boolean;
  podeInstalar: boolean;
  onInstalar: () => void;
}) {
  return (
    <Card className="mt-4">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Android</CardTitle>
        {destaque && <Badge>Este aparelho</Badge>}
      </CardHeader>
      <CardContent>
        {podeInstalar && (
          <Button className="mb-5 h-11 w-full" onClick={onInstalar}>
            <Download /> Instalar Wake Club
          </Button>
        )}
        <ol className="space-y-4 text-sm">
          <Passo numero="1" icone={MoreVertical}>
            Abra o menu do Chrome no canto superior.
          </Passo>
          <Passo numero="2" icone={Download}>
            Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
          </Passo>
          <Passo numero="3" icone={Bell}>
            Abra pelo ícone instalado.
          </Passo>
        </ol>
      </CardContent>
    </Card>
  );
}

function Passo({
  numero,
  icone: Icone,
  children,
}: {
  numero: string;
  icone: typeof Share;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted">
        <Icone className="h-4 w-4" />
        <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
          {numero}
        </span>
      </div>
      <p className="pt-1.5 leading-relaxed text-muted-foreground">{children}</p>
    </li>
  );
}

function rotuloPermissao(permissao: NotificationPermission) {
  if (permissao === "granted") return "permitida";
  if (permissao === "denied") return "bloqueada";
  return "ainda não solicitada";
}
