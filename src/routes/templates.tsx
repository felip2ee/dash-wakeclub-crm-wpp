import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { RespostaRapida } from "@/features/respostas-rapidas/filtro";
import { exigirAdmin } from "@/server/auth";
import {
  listarTodasRespostasRapidas,
  removerRespostaRapida,
  salvarRespostaRapida,
} from "@/server/respostas-rapidas";

export const Route = createFileRoute("/templates")({
  beforeLoad: async () => ({ sessao: await exigirAdmin() }),
  head: () => ({ meta: [{ title: "Respostas rápidas — Wake Club" }] }),
  component: RespostasRapidasPage,
});

const CHAVE = ["respostas-rapidas", "todas"];
const VAZIO = { id: undefined as string | undefined, atalho: "", texto: "", ativo: true };

function RespostasRapidasPage() {
  const cliente = useQueryClient();
  const [form, setForm] = useState(VAZIO);
  const lista = useQuery({ queryKey: CHAVE, queryFn: () => listarTodasRespostasRapidas() });

  const aoConcluir = () => cliente.invalidateQueries({ queryKey: ["respostas-rapidas"] });
  const salvar = useMutation({
    mutationFn: () => salvarRespostaRapida({ data: form }),
    onSuccess: () => {
      toast.success("Resposta salva.");
      setForm(VAZIO);
      return aoConcluir();
    },
    onError: (e) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: (id: string) => removerRespostaRapida({ data: { id } }),
    onSuccess: () => {
      toast.success("Resposta removida.");
      return aoConcluir();
    },
    onError: (e) => toast.error(e.message),
  });

  const editar = (r: RespostaRapida) => setForm({ ...r });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold">Respostas rápidas</h1>
        <p className="text-sm text-muted-foreground">
          A atendente digita <code>/atalho</code> no campo de envio para inserir o texto.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{form.id ? "Editar resposta" : "Nova resposta"}</CardTitle>
          <CardDescription>Atalho com 2 a 30 letras minúsculas, números ou hífen.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              salvar.mutate();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="atalho">Atalho</Label>
              <Input
                id="atalho"
                value={form.atalho}
                onChange={(e) => setForm({ ...form, atalho: e.target.value.toLowerCase() })}
                pattern="[a-z0-9\-]{2,30}"
                placeholder="preco"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="texto">Texto</Label>
              <Textarea
                id="texto"
                value={form.texto}
                onChange={(e) => setForm({ ...form, texto: e.target.value })}
                maxLength={2000}
                rows={4}
                required
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="ativo"
                checked={form.ativo}
                onCheckedChange={(ativo) => setForm({ ...form, ativo })}
              />
              <Label htmlFor="ativo">Ativa</Label>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </Button>
              {form.id && (
                <Button type="button" variant="ghost" onClick={() => setForm(VAZIO)}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {lista.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : lista.isError ? (
            <p className="p-4 text-sm text-destructive">{lista.error.message}</p>
          ) : lista.data.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma resposta cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Atalho</TableHead>
                  <TableHead>Texto</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.data.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="align-top font-mono">
                      /{r.atalho} {!r.ativo && <Badge variant="secondary">inativa</Badge>}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-pre-wrap align-top">
                      {r.texto}
                    </TableCell>
                    <TableCell className="flex justify-end gap-1 align-top">
                      <Button size="sm" variant="outline" onClick={() => editar(r)}>
                        Editar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remover /${r.atalho}`}
                        disabled={remover.isPending}
                        onClick={() => {
                          if (confirm(`Remover /${r.atalho}?`)) remover.mutate(r.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
