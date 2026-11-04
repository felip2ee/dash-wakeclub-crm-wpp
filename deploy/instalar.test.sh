#!/usr/bin/env bash
# shellcheck disable=SC1091
# Testes de funções de deploy/instalar.sh sem Docker: o script é carregado com `.`,
# e o guard do fim impede que `main` rode. Sai 1 no primeiro erro.
AQUI="$(cd "$(dirname "$0")" && pwd)"
. "$AQUI/instalar.sh" || { echo "FALHOU: instalar.sh não carregou" >&2; exit 1; }
set +e
N=0

assert_eq() { # ESPERADO OBTIDO NOME
  N=$((N + 1))
  if [ "$1" != "$2" ]; then
    printf 'FALHOU: %s\n  esperado: [%s]\n  obtido:   [%s]\n' "$3" "$1" "$2" >&2
    exit 1
  fi
  echo "ok $N - $3"
}

# definir_credencial: troca valor, mas vazio nunca apaga o salvo.
F="$TMP/c.env"
definir_credencial "$F" EVOLUTION_API_KEY chave-velha
definir_credencial "$F" EVOLUTION_API_KEY ""
assert_eq chave-velha "$(ler_credencial "$F" EVOLUTION_API_KEY)" "vazio não apaga valor salvo"
definir_credencial "$F" EVOLUTION_API_KEY 'nova&\x'
assert_eq 'nova&\x' "$(ler_credencial "$F" EVOLUTION_API_KEY)" "valor novo troca o salvo"
assert_eq 1 "$(grep -c '^EVOLUTION_API_KEY=' "$F")" "uma linha só por chave"
definir_credencial "$F" DOMINIO ""
assert_eq "DOMINIO=" "$(grep '^DOMINIO=' "$F")" "vazio sem valor salvo grava a chave vazia"

# checar_par_vapid: par inteiro ou nada; metade para com ✗.
# shellcheck disable=SC2034 # lida dentro de checar_par_vapid
CREDENCIAIS="$F"
saida="$( (checar_par_vapid pub "") 2>&1)"
assert_eq 1 "$( (checar_par_vapid pub "") >/dev/null 2>&1; echo $?)" "só a pública salva: sai 1"
case "$saida" in *"✗"*"não VAPID_PRIVATE_KEY"*"Apague as duas"*) r=ok ;; *) r="$saida" ;; esac
assert_eq ok "$r" "mensagem diz qual chave falta"
assert_eq 1 "$( (checar_par_vapid "" priv) >/dev/null 2>&1; echo $?)" "só a privada salva: sai 1"
assert_eq 0 "$( (checar_par_vapid "" "") >/dev/null 2>&1; echo $?)" "nenhuma salva: segue (gera)"
assert_eq 0 "$( (checar_par_vapid pub priv) >/dev/null 2>&1; echo $?)" "par completo: segue"

# Guard do main (o trecho real do fim do instalar.sh): roda quando executado,
# inclusive por /dev/fd como em `bash <(curl ...)`, e não quando carregado com `.`.
GUARD="$(tail -n 3 "$AQUI/instalar.sh" | sed 's/main "\$@"/echo main/')"
assert_eq main "$(bash <(printf '%s\n' "$GUARD"))" "bash <(...) roda main"
assert_eq "" "$(GUARD="$GUARD" bash -c '. <(printf "%s\n" "$GUARD")')" "carregado com . não roda main"

echo "todos os $N testes passaram"
