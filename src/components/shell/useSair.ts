import { useNavigate, useRouter } from "@tanstack/react-router";

import { sair } from "@/server/auth";

// Usado pelo menu da conta e pela tela de perfil: revoga a sessão e volta ao login.
export function useSair() {
  const navigate = useNavigate();
  const router = useRouter();
  return async () => {
    await sair();
    await router.invalidate();
    await navigate({ to: "/login" });
  };
}
