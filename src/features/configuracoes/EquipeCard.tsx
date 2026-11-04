import { BellRing, Smartphone, Trash2, TriangleAlert } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dataHora, plural } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  alterarAtendente,
  removerAparelho,
  testarNotificacaoDaAtendente,
  type AtendenteAdmin,
} from "@/server/admin";

// Cópia do AtendenteCard de /admin (que continua no ar sem mudança) com avatar de
// iniciais: métricas, ativar/desativar, push de teste e aparelhos inscritos.
export function EquipeCard({
  atendente,
  processando,
  executar,
}: {
  atendente: AtendenteAdmin;
  processando: string | null;
  executar: (chave: string, acao: () => Promise<unknown>, sucesso: string) => Promise<boolean>;
}) {
  const chaveAtivo = `ativo-${atendente.usuarioId}`;
  return (
    <Card className={cn(!atendente.ativo && "opacity-70")}>
      <CardHeader className="gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <AvatarIniciais nome={atendente.nome} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{atendente.nome}</CardTitle>
              <Badge variant={atendente.ativo ? "default" : "secondary"}>
                {atendente.ativo ? "ativa" : "inativa"}
              </Badge>
              {atendente.parados2h > 0 && (
                <Badge variant="destructive">
                  <TriangleAlert className="mr-1 h-3 w-3" />
                  {atendente.parados2h} há 2h+
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              @{atendente.usuario} · último acesso {dataHora(atendente.ultimoAcessoEm)}
            </CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            disabled={processando !== null || atendente.aparelhos.length === 0 || !atendente.ativo}
            onClick={() =>
              void executar(
                `push-${atendente.usuarioId}`,
                () => testarNotificacaoDaAtendente({ data: { usuarioId: atendente.usuarioId } }),
                `Teste enviado para ${atendente.nome}.`,
              )
            }
          >
            <BellRing className="h-4 w-4" />
            Testar push
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={atendente.ativo ? "destructive" : "default"}
                size="sm"
                className="min-h-11"
                disabled={processando !== null}
              >
                {atendente.ativo ? "Desativar" : "Ativar"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {atendente.ativo ? "Desativar" : "Ativar"} {atendente.nome}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {atendente.ativo
                    ? "Ela sai do rodízio e a sessão deixa de valer na próxima requisição. Os leads e o histórico não são alterados."
                    : "Ela volta ao rodízio se tiver uma label vinculada."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    void executar(
                      chaveAtivo,
                      () =>
                        alterarAtendente({
                          data: { usuarioId: atendente.usuarioId, ativo: !atendente.ativo },
                        }),
                      `${atendente.nome} foi ${atendente.ativo ? "desativada" : "ativada"}.`,
                    )
                  }
                >
                  {atendente.ativo ? "Desativar" : "Ativar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <MiniMetrica titulo="Na fila" valor={atendente.naFila} />
          <MiniMetrica titulo="Vencidos" valor={atendente.vencidos} />
          <MiniMetrica
            titulo="Parados 2h+"
            valor={atendente.parados2h}
            grave={atendente.parados2h > 0}
          />
          <MiniMetrica titulo="Leads ativos" valor={atendente.leadsAtivos} />
          <MiniMetrica titulo="Taxa de toque" valor={percentual(atendente.taxaToque7d)} />
          <MiniMetrica titulo="Tempo até toque" valor={duracao(atendente.medianaMinAteToque)} />
        </div>
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5" />
            {plural(atendente.aparelhos.length, "aparelho inscrito", "aparelhos inscritos")}
          </h3>
          {atendente.aparelhos.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Nenhum aparelho inscrito para push.
            </p>
          ) : (
            <ul className="space-y-2">
              {atendente.aparelhos.map((aparelho) => (
                <li key={aparelho.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {aparelho.apelido ?? "Aparelho sem nome"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      inscrito {dataHora(aparelho.criadoEm)}
                      {aparelho.usadoEm ? ` · último push ${dataHora(aparelho.usadoEm)}` : ""}
                      {aparelho.falhas > 0 ? ` · ${aparelho.falhas} falha(s)` : ""}
                    </p>
                    {aparelho.ultimoErro && (
                      <p className="mt-1 truncate text-[11px] text-destructive">
                        {aparelho.ultimoErro}
                      </p>
                    )}
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11"
                        disabled={processando !== null}
                        aria-label={`Remover ${aparelho.apelido ?? "aparelho"}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover este aparelho?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Ele deixará de receber notificações até ser inscrito novamente no painel.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            void executar(
                              `aparelho-${aparelho.id}`,
                              () => removerAparelho({ data: { aparelhoId: aparelho.id } }),
                              "Aparelho removido.",
                            )
                          }
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetrica({
  titulo,
  valor,
  grave = false,
}: {
  titulo: string;
  valor: string | number;
  grave?: boolean;
}) {
  return (
    <div className={cn("rounded-lg bg-muted/50 p-2.5", grave && "bg-destructive/10")}>
      <p className="text-[10px] text-muted-foreground">{titulo}</p>
      <p className={cn("mt-0.5 text-sm font-semibold", grave && "text-destructive")}>{valor}</p>
    </div>
  );
}

function percentual(valor: number | null) {
  return valor === null ? "—" : `${valor}%`;
}
function duracao(minutos: number | null) {
  if (minutos === null) return "—";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  return `${(minutos / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
}
