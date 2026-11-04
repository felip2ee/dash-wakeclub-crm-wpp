import { useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { AlertCircle, LoaderCircle, LockKeyhole, Waves } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { rotaInicial } from "@/components/shell/navegacao";
import { entrar, getSessao } from "@/server/auth";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const sessao = await getSessao();
    if (sessao) throw redirect({ to: rotaInicial(sessao.papel) });
  },
  head: () => ({ meta: [{ title: "Entrar — Wake Club" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);

    const formulario = new FormData(evento.currentTarget);
    try {
      const resultado = await entrar({
        data: {
          usuario: String(formulario.get("usuario") ?? ""),
          senha: String(formulario.get("senha") ?? ""),
        },
      });
      if ("erro" in resultado) {
        setErro(resultado.erro);
        return;
      }

      await router.invalidate();
      await navigate({
        to: rotaInicial(resultado.sessao.papel),
      });
    } catch {
      setErro("Não foi possível entrar agora. Tente novamente em instantes.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(circle_at_top,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_42%)] px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/5 sm:p-8">
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Waves className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 font-display text-2xl font-semibold">Painel da equipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Entre para acessar seus atendimentos.
          </p>
        </div>

        <form className="space-y-4" onSubmit={(evento) => void enviar(evento)}>
          {erro && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="usuario">Usuário</Label>
            <Input
              id="usuario"
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <Button type="submit" className="h-11 w-full" disabled={enviando}>
            {enviando ? <LoaderCircle className="animate-spin" /> : <LockKeyhole />}
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Precisa redefinir sua senha? Fale com a administração da Wake Club.
        </p>
      </section>
    </main>
  );
}
