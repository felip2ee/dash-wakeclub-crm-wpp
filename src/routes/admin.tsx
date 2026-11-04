import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { BellRing, ShieldCheck, Smartphone, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonitorDaFila } from "@/features/admin/MonitorDaFila";
import { PesoEComissao } from "@/features/admin/PesoEComissao";
import { dataHora, plural } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  alterarAtendente,
  criarAtendente,
  getPainelAdmin,
  removerAparelho,
  testarNotificacaoDaAtendente,
  type AtendenteAdmin,
  type LabelDisponivelAdmin,
} from "@/server/admin";
import { exigirAdmin } from "@/server/auth";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  loader: () => getPainelAdmin(),
  head: () => ({ meta: [{ title: "Administração — Wake Club" }] }),
  component: AdminPage,
});

function AdminPage() {
  const { resumo, atendentes, labelsDisponiveis } = Route.useLoaderData();
  const router = useRouter();
  const [processando, setProcessando] = useState<string | null>(null);

  async function executar(chave: string, acao: () => Promise<unknown>, sucesso: string) {
    setProcessando(chave);
    try {
      await acao();
      toast.success(sucesso);
      await router.invalidate();
      return true;
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a ação.");
      return false;
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-3 py-5 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-primary">
            Visão da equipe
          </p>
          <h1 className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-primary" /> Administração
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            O painel mede leads atribuídos, sugestões e aberturas. Ele não atribui autoria às
            mensagens.
          </p>
        </div>
        <CadastroAtendente
          labels={labelsDisponiveis}
          bloqueado={processando !== null}
          executar={executar}
        />
      </header>

      <section aria-labelledby="agora">
        <TituloSecao id="agora" numero="1" titulo="Agora" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metrica titulo="Na fila agora" valor={resumo.filaAgora} />
          <Metrica titulo="Parados há 2h+" valor={resumo.parados2h} grave={resumo.parados2h > 0} />
          <Metrica titulo="Sem dona" valor={resumo.semDona} />
          <Metrica titulo="Sem atendimento" valor={resumo.semAtendimento} />
        </div>
      </section>

      <section aria-labelledby="ia">
        <TituloSecao id="ia" numero="2" titulo="A IA está acertando?" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricaExplicada
            titulo="Taxa de toque (7d)"
            valor={percentual(resumo.taxaToque7d)}
            texto="A vendedora dizendo com o dedo se a IA leu o lead direito. Baixa indica momento ou texto ruim."
          />
          <MetricaExplicada
            titulo="Tempo até o toque"
            valor={duracao(resumo.medianaMinAteToque)}
            texto="Se for de horas, o push não está funcionando ou está sendo ignorado."
          />
          <MetricaExplicada
            titulo="Toque sem eco (7d)"
            valor={String(resumo.toqueSemEco7d)}
            texto="Abriu e desistiu ao reler. É o sinal mais honesto de texto ruim."
          />
          <MetricaExplicada
            titulo="Barrados pelo Porteiro"
            valor={String(resumo.abortados7d)}
            texto="Muito alto significa paranoico; zero pode significar que não está olhando nada."
          />
        </div>
      </section>

      <section aria-labelledby="motor" className="space-y-3">
        <TituloSecao id="motor" numero="4" titulo="Motor" />
        <MonitorDaFila />
        <PesoEComissao atendentes={atendentes} />
      </section>

      <section aria-labelledby="equipe">
        <TituloSecao id="equipe" numero="3" titulo="Por atendente" />
        <div className="space-y-3">
          {atendentes.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma atendente cadastrada.
              </CardContent>
            </Card>
          ) : (
            atendentes.map((atendente) => (
              <AtendenteCard
                key={atendente.usuarioId}
                atendente={atendente}
                processando={processando}
                executar={executar}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function CadastroAtendente({
  labels,
  bloqueado,
  executar,
}: {
  labels: LabelDisponivelAdmin[];
  bloqueado: boolean;
  executar: (chave: string, acao: () => Promise<unknown>, sucesso: string) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [labelId, setLabelId] = useState("");
  const [peso, setPeso] = useState("1");
  const [comissaoPct, setComissaoPct] = useState("0");

  async function cadastrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const salvo = await executar(
      "criar-atendente",
      () =>
        criarAtendente({
          data: {
            nome,
            usuario,
            senha,
            labelId: labelId || undefined,
            peso: Number(peso),
            comissaoPct: Number(comissaoPct),
          },
        }),
      `${nome.trim()} foi cadastrada.`,
    );
    if (!salvo) return;
    setAberto(false);
    setNome("");
    setUsuario("");
    setSenha("");
    setLabelId("");
    setPeso("1");
    setComissaoPct("0");
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button disabled={bloqueado}>
          <UserPlus className="h-4 w-4" /> Nova atendente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={(evento) => void cadastrar(evento)} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Cadastrar atendente</DialogTitle>
            <DialogDescription>
              Cria o acesso e vincula a pessoa a uma label já existente no WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="atendente-nome">Nome</Label>
              <Input
                id="atendente-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                minLength={2}
                maxLength={120}
                required
                autoComplete="name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="atendente-usuario">Usuário</Label>
              <Input
                id="atendente-usuario"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value.toLowerCase())}
                minLength={3}
                maxLength={100}
                pattern="[a-z0-9._-]+"
                required
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                placeholder="ex.: ana"
              />
              <p className="text-xs text-muted-foreground">
                Letras sem acento, números, ponto, hífen ou sublinhado.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="atendente-senha">Senha inicial</Label>
              <Input
                id="atendente-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={8}
                maxLength={200}
                required
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                No mínimo 8 caracteres. A senha é armazenada somente como bcrypt.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Label do WhatsApp (opcional)</Label>
              <Select value={labelId} onValueChange={setLabelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem label" />
                </SelectTrigger>
                <SelectContent>
                  {labels.map((label) => (
                    <SelectItem key={label.labelId} value={label.labelId}>
                      {label.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Escolha a label pessoal da atendente, não uma etapa do funil.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="atendente-peso">Peso (0 a 10)</Label>
                <Input
                  id="atendente-peso"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="atendente-comissao">Comissão %</Label>
                <Input
                  id="atendente-comissao"
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={comissaoPct}
                  onChange={(e) => setComissaoPct(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={bloqueado}>
              Cadastrar atendente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TituloSecao({ id, numero, titulo }: { id: string; numero: string; titulo: string }) {
  return (
    <h2 id={id} className="mb-3 font-display text-lg font-semibold">
      <span className="mr-2 text-primary">{numero}.</span>
      {titulo}
    </h2>
  );
}

function Metrica({
  titulo,
  valor,
  grave = false,
}: {
  titulo: string;
  valor: number;
  grave?: boolean;
}) {
  return (
    <Card className={cn(grave && "border-destructive/40 bg-destructive/5")}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={cn("mt-1 font-display text-3xl font-semibold", grave && "text-destructive")}>
          {valor}
        </p>
      </CardContent>
    </Card>
  );
}

function MetricaExplicada({
  titulo,
  valor,
  texto,
}: {
  titulo: string;
  valor: string;
  texto: string;
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className="font-display text-3xl">{valor}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 text-xs leading-relaxed text-muted-foreground">
        {texto}
      </CardContent>
    </Card>
  );
}

function AtendenteCard({
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
        <div>
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
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
