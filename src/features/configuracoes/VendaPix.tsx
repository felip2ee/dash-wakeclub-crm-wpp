import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { moeda } from "@/lib/formato";
import type { ConfigPix } from "@/server/motor/comprovantes";
import { definirConfigPix, getConfigPix } from "@/server/vendas-pix";
import { Carregando, ErroAoCarregar, Secao } from "./Secao";

export const CHAVE_CONFIG_PIX = ["configuracoes", "venda-pix"];

const PACOTES = [1, 2, 4] as const;
type Campos = { chave: string; cnpj: string; 1: string; 2: string; 4: string };

const precoTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/** "720,50" ou "720.50" para número; vazio = sem preço; `NaN` = inválido. */
function lerPreco(s: string): number | null {
  const t = s.trim().replace(/\s/g, "");
  if (!t) return null;
  return /^\d+([.,]\d{1,2})?$/.test(t) ? Number(t.replace(",", ".")) : Number.NaN;
}

/** Sem chave/CNPJ ou com algum preço vazio, o motor manda todo comprovante para o admin. */
export function configPixCompleta(c: ConfigPix): boolean {
  return (c.chave !== null || c.cnpj !== null) && PACOTES.every((h) => c.precos[h] !== null);
}

export function resumoConfigPix(c: ConfigPix): string {
  if (!configPixCompleta(c)) return "Incompleta: tudo vira pergunta";
  return PACOTES.map((h) => `${h} h ${moeda(c.precos[h] ?? 0)}`).join(" · ");
}

export function VendaPix() {
  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: CHAVE_CONFIG_PIX, queryFn: () => getConfigPix() });
  const [campos, setCampos] = useState<Campos | null>(null);

  useEffect(() => {
    const d = config.data;
    if (d)
      setCampos({
        chave: d.chave ?? "",
        cnpj: d.cnpj ?? "",
        1: precoTexto(d.precos[1]),
        2: precoTexto(d.precos[2]),
        4: precoTexto(d.precos[4]),
      });
  }, [config.data]);

  const salvar = useMutation({
    mutationFn: (valor: ConfigPix) => definirConfigPix({ data: valor }),
    onSuccess: () => toast.success("Venda direta por Pix salva."),
    onError: (erro) => toast.error(erro instanceof Error ? erro.message : "Falha ao salvar."),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_CONFIG_PIX }),
  });

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!campos) return;
    const precos = { 1: lerPreco(campos[1]), 2: lerPreco(campos[2]), 4: lerPreco(campos[4]) };
    if (PACOTES.some((h) => Number.isNaN(precos[h]) || (precos[h] ?? 1) <= 0)) {
      toast.error("Cada preço precisa ser um valor em reais maior que zero, ou ficar vazio.");
      return;
    }
    if (campos.chave.trim().length > 140 || campos.cnpj.trim().length > 140) {
      toast.error("Chave e CNPJ têm no máximo 140 caracteres.");
      return;
    }
    salvar.mutate({ chave: campos.chave.trim() || null, cnpj: campos.cnpj.trim() || null, precos });
  }

  const campo = (chave: keyof Campos, rotulo: string, extra: React.ComponentProps<"input">) => (
    <label className="space-y-1 text-sm">
      <span className="text-muted-foreground">{rotulo}</span>
      <Input
        className="h-11"
        value={campos?.[chave] ?? ""}
        onChange={(e) => setCampos((c) => c && { ...c, [chave]: e.target.value })}
        {...extra}
      />
    </label>
  );

  return (
    <Secao
      id="venda-pix"
      icone={QrCode}
      titulo="Venda direta por Pix"
      subtitulo="Chave, CNPJ e preço dos pacotes para registrar sozinho o comprovante que confere."
    >
      {config.isError ? (
        <ErroAoCarregar
          texto="Não deu para carregar a venda por Pix."
          tentar={() => void config.refetch()}
        />
      ) : !config.data || !campos ? (
        <Carregando className="h-40" />
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          {!configPixCompleta(config.data) && (
            <p role="status" className="rounded-lg border border-dashed p-3 text-sm">
              Sem chave/CNPJ e preços, todo comprovante vira pergunta.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("chave", "Chave Pix da Wake", { autoComplete: "off", maxLength: 140 })}
            {campo("cnpj", "CNPJ da Wake", { autoComplete: "off", maxLength: 140 })}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {PACOTES.map((h) => (
              <div key={h}>{campo(h, `Preço de ${h} h (R$)`, { inputMode: "decimal" })}</div>
            ))}
          </div>
          <Button type="submit" className="min-h-11" disabled={salvar.isPending}>
            Salvar
          </Button>
        </form>
      )}
    </Secao>
  );
}
