import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Search } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Carregando, ErroAoCarregar } from "@/features/configuracoes/Secao";
import { filtrarConversas } from "@/features/conversas-lista/filtro";
import { dataHoraCompleta, moeda, telefone } from "@/lib/formato";
import { getLeadsPainel, type LeadCard } from "@/server/leads";
import { listarVendasSemDono, type VendaLinha, vincularVenda } from "@/server/vendas";

const MAXIMO_RESULTADOS = 20;

// Vendas que o webhook não casou com nenhum lead (referência 02): o admin vincula à mão.
export function VendasSemDono() {
  const vendas = useQuery({
    queryKey: ["vendas", "sem-dono"],
    queryFn: () => listarVendasSemDono(),
  });

  if (vendas.isPending) return <Carregando />;
  if (vendas.isError)
    return (
      <ErroAoCarregar
        texto="Não deu para carregar as vendas sem dono."
        tentar={() => void vendas.refetch()}
      />
    );
  if (vendas.data.length === 0)
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhuma venda sem vínculo.
      </p>
    );

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b border-border">
            {["Data da venda", "Cliente", "Valor", "Produto", "Status"].map((c) => (
              <th key={c} scope="col" className="py-2 pr-3 font-medium">
                {c}
              </th>
            ))}
            <th scope="col" className="py-2">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {vendas.data.map((v) => (
            <tr key={v.id} className="border-b border-border last:border-0">
              <td className="py-2 pr-3 tabular-nums">{dataHoraCompleta(v.compradaEm)}</td>
              <td className="py-2 pr-3">
                {v.telefone ? telefone(v.telefone) : (v.cpf ?? "sem contato")}
              </td>
              <td className="py-2 pr-3 tabular-nums">{moeda(v.valor)}</td>
              <td className="py-2 pr-3">{v.produto ?? "—"}</td>
              <td className="py-2 pr-3">
                <Badge variant="outline" className="border-primary text-primary">
                  Sem vínculo
                </Badge>
              </td>
              <td className="py-2 text-right">
                <Vincular venda={v} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Vincular({ venda }: { venda: VendaLinha }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  // Vínculo não tem desfazer: o toque só escolhe; a confirmação é que vincula.
  const [escolhido, setEscolhido] = useState<LeadCard | null>(null);
  const leads = useQuery({
    queryKey: ["leads-painel"],
    queryFn: () => getLeadsPainel(),
    enabled: aberto,
  });
  const vincular = useMutation({
    mutationFn: (leadId: string) => vincularVenda({ data: { vendaId: venda.id, leadId } }),
    onSuccess: () => {
      toast.success("Venda vinculada ao lead.");
      setAberto(false);
    },
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao vincular."),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["vendas"] }),
        queryClient.invalidateQueries({ queryKey: ["visao-geral"] }),
      ]),
  });
  // A busca por nome ou telefone já existe na lista de conversas; os campos que ela
  // também olha (mensagem, follow-up) não existem no card do painel.
  const encontrados = filtrarConversas(
    (leads.data ?? []).map((l) => ({
      ...l,
      ultimaTexto: null,
      msgsLeadSemResposta: 0,
      followupAguardando: false,
    })),
    "todas",
    busca,
  ).slice(0, MAXIMO_RESULTADOS);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm" className="min-h-11 bg-gradiente-primario text-white">
          <Link2 aria-hidden /> Vincular a um lead
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular venda de {moeda(venda.valor)}</DialogTitle>
          <DialogDescription>
            {dataHoraCompleta(venda.compradaEm)}
            {venda.telefone && ` · ${telefone(venda.telefone)}`}. Vendedor, categoria e comissão
            passam a vir do lead escolhido.
          </DialogDescription>
        </DialogHeader>
        <label className="relative block">
          <span className="sr-only">Buscar lead por nome ou telefone</span>
          <Search
            aria-hidden
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="min-h-11 pl-9"
          />
        </label>
        {leads.isPending ? (
          <Carregando />
        ) : leads.isError ? (
          <ErroAoCarregar
            texto="Não deu para carregar os leads."
            tentar={() => void leads.refetch()}
          />
        ) : encontrados.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Nenhum lead encontrado.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {encontrados.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  disabled={vincular.isPending}
                  onClick={() => setEscolhido(l)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.nome ?? "Lead sem nome"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {telefone(l.telefone)} · {l.atendenteNome ?? "sem atendente"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{l.etiqueta}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <AlertDialog open={escolhido !== null} onOpenChange={(o) => !o && setEscolhido(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Vincular {moeda(venda.valor)} a {escolhido?.nome ?? "lead sem nome"} (vendedor{" "}
                {escolhido?.atendenteNome ?? "sem dono"})?
              </AlertDialogTitle>
              <AlertDialogDescription>
                O vínculo não pode ser desfeito pela tela. A venda passa a contar para esse
                vendedor, com a categoria e a comissão calculadas a partir deste lead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => escolhido && vincular.mutate(escolhido.id)}>
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
