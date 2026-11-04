import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Coins, Users } from "lucide-react";
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
import { AvatarIniciais } from "@/components/ui/avatar-iniciais";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { alterarAtendente, getPainelAdmin, type AtendenteAdmin } from "@/server/admin";
import { alterarPesoComissao } from "@/server/admin-motor";
import { CadastroUsuario } from "./CadastroUsuario";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";
import { CHAVE_PAINEL_ADMIN, totalPesoAtivo, validarPesoComissao } from "./peso";

export function usePainelAdmin() {
  return useQuery({ queryKey: CHAVE_PAINEL_ADMIN, queryFn: () => getPainelAdmin() });
}

// Tabela editável da referência 02. A função é só exibição: o papel não muda pelo painel.
export function Usuarios() {
  const painel = usePainelAdmin();

  return (
    <Secao
      id="usuarios"
      icone={Users}
      titulo="Usuários"
      subtitulo="Gerencie o acesso, a função, a distribuição e as comissões."
      acao={painel.data && <CadastroUsuario labels={painel.data.labelsDisponiveis} />}
    >
      {painel.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar os usuários."
          tentar={() => void painel.refetch()}
        />
      ) : !painel.data ? (
        <Carregando className="h-48" />
      ) : painel.data.atendentes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma atendente cadastrada.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Peso de distribuição</TableHead>
              <TableHead>Comissão (%)</TableHead>
              <TableHead>
                <span className="sr-only">Salvar</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {painel.data.atendentes.map((a) => (
              <LinhaUsuario key={a.usuarioId} atendente={a} />
            ))}
          </TableBody>
        </Table>
      )}
    </Secao>
  );
}

function LinhaUsuario({ atendente: a }: { atendente: AtendenteAdmin }) {
  const queryClient = useQueryClient();
  const [peso, setPeso] = useState(String(a.peso));
  const [pct, setPct] = useState(String(a.comissaoPct));
  const [confirmarDesativar, setConfirmarDesativar] = useState(false);
  const alterado = peso !== String(a.peso) || pct !== String(a.comissaoPct);
  const valores = validarPesoComissao(peso, pct);
  const atualizar = () => queryClient.invalidateQueries({ queryKey: CHAVE_PAINEL_ADMIN });
  const falhou = (erro: Error) =>
    toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a ação.");

  const salvar = useMutation({
    mutationFn: (v: { peso: number; comissaoPct: number }) =>
      alterarPesoComissao({ data: { usuarioId: a.usuarioId, ...v } }),
    onSuccess: () => toast.success(`Peso e comissão de ${a.nome} salvos.`),
    onError: falhou,
    onSettled: atualizar,
  });
  const ativar = useMutation({
    mutationFn: (ativo: boolean) => alterarAtendente({ data: { usuarioId: a.usuarioId, ativo } }),
    onSuccess: (_, ativo) => toast.success(`${a.nome} foi ${ativo ? "ativada" : "desativada"}.`),
    onError: falhou,
    onSettled: atualizar,
  });

  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-2">
          <AvatarIniciais nome={a.nome} tamanho="sm" />
          <span className="font-medium">{a.nome}</span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">Atendente</TableCell>
      <TableCell>
        <label className="flex min-h-11 items-center gap-2">
          <Switch
            checked={a.ativo}
            disabled={ativar.isPending}
            aria-label={`${a.nome} ativa`}
            // Desativar tira do rodízio e devolve os leads: pede confirmação, como em /admin.
            onCheckedChange={(ativo) => (ativo ? ativar.mutate(true) : setConfirmarDesativar(true))}
          />
          <span aria-hidden>{a.ativo ? "Sim" : "Não"}</span>
        </label>
        <AlertDialog open={confirmarDesativar} onOpenChange={setConfirmarDesativar}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desativar {a.nome}?</AlertDialogTitle>
              <AlertDialogDescription>
                Ela sai do rodízio e a sessão deixa de valer na próxima requisição. Os leads dela
                voltam para a distribuição; o histórico não é alterado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => ativar.mutate(false)}>Desativar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={10}
          step={1}
          aria-label={`Peso de distribuição de ${a.nome}`}
          className="h-11 w-20"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number"
          min={0}
          max={100}
          step={0.01}
          aria-label={`Comissão (%) de ${a.nome}`}
          className="h-11 w-24"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Button
          size="icon"
          variant="outline"
          className="h-11 w-11"
          disabled={!alterado || !valores.ok || salvar.isPending}
          title={valores.ok ? undefined : valores.erro}
          aria-label={`Salvar peso e comissão de ${a.nome}`}
          onClick={() =>
            valores.ok
              ? salvar.mutate({ peso: valores.peso, comissaoPct: valores.comissaoPct })
              : toast.error(valores.erro)
          }
        >
          <Check aria-hidden className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function DistribuicaoLeads() {
  const painel = usePainelAdmin();

  return (
    <Secao
      id="distribuicao"
      icone={Coins}
      titulo="Distribuição de leads"
      subtitulo="Peso de distribuição entre os atendentes para novos leads."
    >
      {painel.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar os pesos."
          tentar={() => void painel.refetch()}
        />
      ) : !painel.data ? (
        <Carregando />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border border-border px-4 py-2">
            <p className="text-sm text-muted-foreground">Total de peso ativo</p>
            <p className="font-display text-2xl font-bold tabular-nums">
              {totalPesoAtivo(painel.data.atendentes)}
            </p>
          </div>
          <p className="min-w-40 flex-1 text-sm text-muted-foreground">
            Usado no rateio proporcional de novos leads entre os atendentes ativos. Peso 0 pausa a
            atendente.
          </p>
        </div>
      )}
    </Secao>
  );
}
