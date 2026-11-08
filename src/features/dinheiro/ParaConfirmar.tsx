import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, ImageOff, Pencil, ReceiptText, X } from "lucide-react";
import { useState } from "react";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Carregando, ErroAoCarregar, Secao } from "@/features/configuracoes/Secao";
import { dataHoraCompleta, moeda, plural, telefone } from "@/lib/formato";
import {
  confirmarComprovante,
  getParaConfirmar,
  type Pergunta,
  type Registrada,
  recusarComprovante,
  resolverRepetida,
  type VendaResumo,
} from "@/server/vendas-pix";

const CHAVE = ["vendas", "para-confirmar"];
const HORA_MS = 3600_000;

/** Brasília é UTC−3 fixo desde 2019 (mesma conta do motor): ISO ↔ `datetime-local`. */
const paraCampo = (iso: string | null) =>
  iso ? new Date(Date.parse(iso) - 3 * HORA_MS).toISOString().slice(0, 16) : "";
const doCampo = (v: string) => new Date(`${v}:00-03:00`).toISOString();

/** "Agora" no formato do `datetime-local` (Brasília), para o `max` do campo. */
const agoraCampo = () => paraCampo(new Date().toISOString());

const nomeLead = (x: { leadNome: string | null; leadTelefone: string }) =>
  x.leadNome?.trim() || telefone(x.leadTelefone);

function useAcao<T>(fn: (dados: T) => Promise<unknown>, sucesso: string, aoTerminar?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(sucesso);
      aoTerminar?.();
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao salvar."),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendas"] }),
        queryClient.invalidateQueries({ queryKey: ["visao-geral"] }),
      ]),
  });
}

// Comprovantes de Pix que o motor não registrou sozinho (spec vendas Pix §4): o admin
// confirma, corrige ou recusa. Embaixo, o que entrou sozinho nos últimos 7 dias.
export function ParaConfirmar() {
  const dados = useQuery({ queryKey: CHAVE, queryFn: () => getParaConfirmar() });
  const total = dados.data?.perguntas.length;

  return (
    <Secao
      id="para-confirmar"
      icone={ReceiptText}
      titulo="Vendas para confirmar"
      subtitulo="Comprovantes de Pix do WhatsApp que precisam da sua resposta."
      acao={
        total !== undefined && (
          <Badge variant={total > 0 ? "default" : "outline"}>
            <span aria-hidden>{total}</span>
            <span className="sr-only">{plural(total, "pergunta aberta", "perguntas abertas")}</span>
          </Badge>
        )
      }
    >
      {dados.isPending ? (
        <Carregando />
      ) : dados.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar as vendas para confirmar."
          tentar={() => void dados.refetch()}
        />
      ) : (
        <div className="space-y-4">
          {dados.data.perguntas.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nenhum comprovante esperando resposta.
            </p>
          ) : (
            <ul className="space-y-3">
              {dados.data.perguntas.map((p) => (
                <li key={p.id}>
                  {p.venda ? <ItemRepetida p={p} direta={p.venda} /> : <ItemPergunta p={p} />}
                </li>
              ))}
            </ul>
          )}
          <Registradas lista={dados.data.registradasRecentes} />
        </div>
      )}
    </Secao>
  );
}

function Miniatura({ mensagemId, tipo }: { mensagemId: string | null; tipo: string | null }) {
  const [falhou, setFalhou] = useState(false);
  const [aberta, setAberta] = useState(false);
  const caixa =
    "flex h-24 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-center text-xs text-muted-foreground";
  if (!mensagemId || falhou || (tipo !== "imagem" && tipo !== "documento"))
    return (
      <div className={caixa}>
        <span className="flex flex-col items-center gap-1 p-1">
          <ImageOff aria-hidden className="h-4 w-4" />
          comprovante indisponível
        </span>
      </div>
    );
  const url = `/api/midia/${mensagemId}`;
  if (tipo === "documento")
    return (
      <a
        href={url}
        download
        className={`${caixa} flex-col gap-1 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      >
        <FileText aria-hidden className="h-6 w-6" />
        Abrir PDF
      </a>
    );
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src={url}
          alt="Comprovante enviado pelo lead (abrir grande)"
          loading="lazy"
          onError={() => setFalhou(true)}
          className="h-full w-full object-cover"
        />
      </button>
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Comprovante</DialogTitle>
            <DialogDescription>Imagem enviada pelo lead no WhatsApp.</DialogDescription>
          </DialogHeader>
          <img
            src={url}
            alt="Comprovante enviado pelo lead"
            className="max-h-[70vh] w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function Cabecalho({ p }: { p: Pergunta | Registrada }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{nomeLead(p)}</p>
      <p className="text-xs text-muted-foreground">
        {telefone(p.leadTelefone)} · {p.donoNome ?? "sem dono"}
      </p>
    </div>
  );
}

function Leitura({ p }: { p: Pergunta }) {
  const l = p.leitura;
  const linhas: [string, string | null | undefined][] = [
    ["Valor", p.valor === null ? null : moeda(p.valor)],
    ["Pago em", p.pagoEm ? dataHoraCompleta(p.pagoEm) : null],
    ["Pagador", l?.pagador],
    ["Recebedor", l?.recebedor],
    ["Chave/CNPJ lidos", [l?.chaveRecebedor, l?.cnpjRecebedor].filter(Boolean).join(" · ") || null],
    ["E2E", l?.e2e],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
      {linhas.map(([rotulo, valor]) => (
        <div key={rotulo} className="contents">
          <dt className="text-muted-foreground">{rotulo}</dt>
          <dd className="min-w-0 break-words">{valor || "não lido"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ItemPergunta({ p }: { p: Pergunta }) {
  const [confirmando, setConfirmando] = useState(false);
  const confirmar = useAcao(
    () => confirmarComprovante({ data: { id: p.id } }),
    "Venda registrada.",
  );
  const podeComoEsta = p.valor !== null && p.horasSugeridas !== null;

  return (
    <article className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex gap-3">
        <Miniatura mensagemId={p.mensagemId} tipo={p.midiaTipo} />
        <div className="min-w-0 flex-1 space-y-2">
          <Cabecalho p={p} />
          <Leitura p={p} />
        </div>
      </div>
      <p className="text-sm">
        <span className="font-medium">
          Horas sugeridas: {p.horasSugeridas === null ? "não deduzidas" : `${p.horasSugeridas} h`}
        </span>
        {p.leitura?.trechoHoras && (
          <span className="block text-muted-foreground">“{p.leitura.trechoHoras}”</span>
        )}
      </p>
      {p.motivo && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          <span className="font-medium">Por que perguntar: </span>
          {p.motivo}
        </p>
      )}
      {p.vendaSuspeita && <LinhaVenda rotulo="Venda do app parecida" v={p.vendaSuspeita} />}
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={!podeComoEsta || confirmar.isPending}
          onClick={() => setConfirmando(true)}
        >
          <Check aria-hidden /> Confirmar
        </Button>
        <Corrigir p={p} />
        <NaoEVenda id={p.id} rotulo={nomeLead(p)} />
      </div>
      {!podeComoEsta && (
        <p className="text-xs text-muted-foreground">
          Falta valor ou horas: use Corrigir e confirmar.
        </p>
      )}
      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Registrar {p.valor === null ? "" : moeda(p.valor)} ·{" "}
              {plural(p.horasSugeridas ?? 0, "hora", "horas")} para {nomeLead(p)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A venda entra como Direta para {p.donoNome ?? "nenhum vendedor (lead sem dono)"}, com
              comissão, etapa e saldo de horas como uma venda paga.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmar.mutate(undefined)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

type Campo = "valor" | "horas" | "data";
const ERRO_ID = "corrigir-erro";

function Corrigir({ p }: { p: Pergunta }) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [horas, setHoras] = useState("");
  const [data, setData] = useState("");
  const [erro, setErro] = useState<{ campo: Campo; texto: string } | null>(null);
  const salvar = useAcao(
    (d: { valor: number; horas: number; pagoEm: string }) =>
      confirmarComprovante({ data: { id: p.id, ...d } }),
    "Venda registrada com a correção.",
    () => setAberto(false),
  );

  const ligacao = (campo: Campo) =>
    erro?.campo === campo ? { "aria-invalid": true, "aria-describedby": ERRO_ID } : {};

  function abrir() {
    setValor(p.valor === null ? "" : String(p.valor).replace(".", ","));
    setHoras(p.horasSugeridas === null ? "" : String(p.horasSugeridas));
    setData(paraCampo(p.pagoEm ?? p.criadoEm));
    setErro(null);
    setAberto(true);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = /^\d+([.,]\d{1,2})?$/.test(valor.trim()) ? Number(valor.trim().replace(",", ".")) : 0;
    const h = Number(horas);
    if (!(v > 0))
      return setErro({ campo: "valor", texto: "Informe um valor em reais maior que zero." });
    if (!Number.isInteger(h) || h < 1 || h > 100)
      return setErro({ campo: "horas", texto: "Horas inteiras de 1 a 100." });
    if (!data) return setErro({ campo: "data", texto: "Informe a data do pagamento." });
    if (data > agoraCampo())
      return setErro({ campo: "data", texto: "A data do pagamento não pode estar no futuro." });
    setErro(null);
    salvar.mutate({ valor: v, horas: h, pagoEm: doCampo(data) });
  }

  return (
    <>
      <Button variant="outline" className="min-h-11" onClick={abrir}>
        <Pencil aria-hidden /> Corrigir e confirmar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Corrigir e confirmar</DialogTitle>
            <DialogDescription>
              {nomeLead(p)} · a venda entra com estes dados, como Direta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={enviar} className="space-y-3" noValidate>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Valor (R$)</span>
              <Input
                className="h-11"
                {...ligacao("valor")}
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Horas</span>
              <Input
                className="h-11"
                {...ligacao("horas")}
                inputMode="numeric"
                value={horas}
                onChange={(e) => setHoras(e.target.value)}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Data do pagamento (Brasília)</span>
              <Input
                className="h-11"
                {...ligacao("data")}
                type="datetime-local"
                max={agoraCampo()}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </label>
            {erro && (
              <p id={ERRO_ID} role="alert" className="text-sm text-destructive">
                {erro.texto}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" className="min-h-11" disabled={salvar.isPending}>
                Confirmar venda
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NaoEVenda({ id, rotulo }: { id: string; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const recusar = useAcao(
    (m: string) => recusarComprovante({ data: { id, motivo: m } }),
    "Marcado como não é venda.",
    () => setAberto(false),
  );
  const m = motivo.trim();

  return (
    <>
      <Button
        variant="outline"
        className="min-h-11"
        onClick={() => {
          setMotivo("");
          setAberto(true);
        }}
      >
        <X aria-hidden /> Não é venda
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Não é venda · {rotulo}</DialogTitle>
            <DialogDescription>
              Se a venda já foi registrada, ela é estornada e as horas saem do saldo do lead.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (m) recusar.mutate(m);
            }}
            className="space-y-3"
          >
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">Motivo</span>
              <Textarea
                value={motivo}
                maxLength={300}
                onChange={(e) => setMotivo(e.target.value)}
                required
              />
            </label>
            <DialogFooter>
              <Button
                type="submit"
                variant="destructive"
                className="min-h-11"
                disabled={!m || recusar.isPending}
              >
                Não é venda
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinhaVenda({ rotulo, v }: { rotulo: string; v: VendaResumo }) {
  return (
    <p className="text-sm">
      <span className="font-medium">{rotulo}: </span>
      {v.origem === "direta" ? "Direta" : "App"} · {moeda(v.valor)}
      {v.horas !== null && ` · ${v.horas} h`} · {dataHoraCompleta(v.compradaEm)}
      {v.status === "estornada" && " · estornada"}
    </p>
  );
}

const OPCOES_REPETIDA = [
  {
    desfazer: "direta",
    rotulo: "Desfazer a direta",
    efeito: "estorna a venda Pix e tira as horas do saldo",
  },
  { desfazer: "app", rotulo: "Desfazer a do app", efeito: "estorna a venda do app" },
  { desfazer: "nenhuma", rotulo: "Manter as duas", efeito: "as duas vendas continuam valendo" },
] as const;

/** Por que a opção não vale: a venda alvo já está estornada ou não existe mais. */
function motivoBloqueio(
  desfazer: "direta" | "app" | "nenhuma",
  direta: VendaResumo,
  app: VendaResumo | null,
): string | null {
  if (desfazer === "direta" && direta.status === "estornada")
    return "a venda direta já foi estornada";
  if (desfazer === "app" && (!app || app.status === "estornada"))
    return app ? "a venda do app já foi estornada" : "não há venda do app";
  return null;
}

function ItemRepetida({ p, direta }: { p: Pergunta; direta: VendaResumo }) {
  const [escolha, setEscolha] = useState<(typeof OPCOES_REPETIDA)[number] | null>(null);
  const resolver = useAcao(
    (desfazer: "direta" | "app" | "nenhuma") => resolverRepetida({ data: { id: p.id, desfazer } }),
    "Venda repetida resolvida.",
  );

  return (
    <article className="space-y-3 rounded-lg border border-border p-3">
      <Cabecalho p={p} />
      <p className="rounded-md bg-muted px-3 py-2 text-sm">
        <span className="font-medium">Possível venda repetida: </span>a mesma compra pode ter
        entrado pelo Pix e pelo app.
      </p>
      <div className="space-y-1">
        <LinhaVenda rotulo="Venda direta" v={direta} />
        {p.vendaSuspeita && <LinhaVenda rotulo="Venda do app" v={p.vendaSuspeita} />}
      </div>
      <div className="flex flex-wrap gap-2">
        {OPCOES_REPETIDA.map((o) => {
          const bloqueio = motivoBloqueio(o.desfazer, direta, p.vendaSuspeita);
          return (
            <div key={o.desfazer} className="flex flex-col gap-1">
              <Button
                variant={o.desfazer === "nenhuma" ? "outline" : "default"}
                className="min-h-11"
                disabled={resolver.isPending || bloqueio !== null}
                aria-describedby={bloqueio ? `bloqueio-${p.id}-${o.desfazer}` : undefined}
                onClick={() => setEscolha(o)}
              >
                {o.rotulo}
              </Button>
              {bloqueio && (
                <span
                  id={`bloqueio-${p.id}-${o.desfazer}`}
                  className="text-xs text-muted-foreground"
                >
                  Indisponível: {bloqueio}.
                </span>
              )}
            </div>
          );
        })}
      </div>
      <AlertDialog open={escolha !== null} onOpenChange={(o) => !o && setEscolha(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{escolha?.rotulo}?</AlertDialogTitle>
            <AlertDialogDescription>
              {nomeLead(p)}: {escolha?.efeito}. Não dá para desfazer pela tela.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => escolha && resolver.mutate(escolha.desfazer)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

function Registradas({ lista }: { lista: Registrada[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="font-display text-base font-semibold">
        Registradas automaticamente · últimos 7 dias
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {lista.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <Miniatura mensagemId={r.mensagemId} tipo={r.midiaTipo} />
            <div className="min-w-0 flex-1 space-y-1">
              <Cabecalho p={r} />
              <p className="text-sm tabular-nums">
                {moeda(r.valor)}
                {r.horas !== null && ` · ${r.horas} h`} · pago {dataHoraCompleta(r.pagoEm)}
              </p>
            </div>
            <NaoEVenda id={r.id} rotulo={nomeLead(r)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
