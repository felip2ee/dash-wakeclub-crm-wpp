import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { criarAtendente, type LabelDisponivelAdmin } from "@/server/admin";
import { CHAVE_PAINEL_ADMIN, validarPesoComissao } from "./peso";

// Cópia do cadastro de /admin (que continua no ar sem mudança), com a mutação dentro
// do componente para servir a /configuracoes e /equipe.
export function CadastroUsuario({ labels }: { labels: LabelDisponivelAdmin[] }) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [labelId, setLabelId] = useState("");
  const [peso, setPeso] = useState("1");
  const [comissaoPct, setComissaoPct] = useState("0");

  const criar = useMutation({
    mutationFn: (valores: { peso: number; comissaoPct: number }) =>
      criarAtendente({
        data: {
          nome,
          usuario,
          senha,
          labelId: labelId || undefined,
          ...valores,
        },
      }),
    onSuccess: () => {
      toast.success(`${nome.trim()} foi cadastrada.`);
      setAberto(false);
      setNome("");
      setUsuario("");
      setSenha("");
      setLabelId("");
      setPeso("1");
      setComissaoPct("0");
    },
    onError: (erro) =>
      toast.error(erro instanceof Error ? erro.message : "Não foi possível concluir a ação."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_PAINEL_ADMIN }),
  });

  function cadastrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const valores = validarPesoComissao(peso, comissaoPct);
    if (!valores.ok) {
      toast.error(valores.erro);
      return;
    }
    criar.mutate({ peso: valores.peso, comissaoPct: valores.comissaoPct });
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button className="min-h-11 bg-gradiente-primario text-white">
          <Plus aria-hidden className="h-4 w-4" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={cadastrar} className="space-y-5">
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
            <Button type="submit" disabled={criar.isPending}>
              Cadastrar atendente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
