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

# Peças puras do passo do banco e do admin.
assert_eq 0003 "$(migracao_anterior 0004)" "migração anterior a 0004"
assert_eq 0009 "$(migracao_anterior 0010)" "migração anterior a 0010 (não é octal)"
LISTA="$(printf 'ana\tAna Souza\nbia\tBia\n')"
assert_eq "Ana Souza" "$(nome_admin "$LISTA" ana)" "nome do admin pelo usuário"
assert_eq "" "$(nome_admin "$LISTA" an)" "usuário parcial não casa"
COPY="$(printf 'SET x = 1;\nCOPY wakeclub.migracoes (nome, aplicada_em) FROM stdin;\n0002_motor.sql\t2026-11-04 10:00:00+00\n0001_base.sql\t2026-11-04 09:00:00+00\n\\.\n\nSELECT 1;\n')"
assert_eq "$(printf '0001_base.sql\n0002_motor.sql')" "$(printf '%s\n' "$COPY" | nomes_copy)" "nomes do COPY do dump, ordenados"
assert_eq "" "$(printf 'SET x = 1;\n' | nomes_copy)" "dump sem migracoes: vazio"
TOC="$(printf '%s\n' ';' '; Archive created at x' '6; 2615 16860 SCHEMA - wakeclub postgres' \
  '5; 2615 2200 SCHEMA - public postgres' '3711; 0 0 ACL - SCHEMA wakeclub postgres' \
  '3700; 0 0 COMMENT - SCHEMA public postgres' '230; 1259 16900 TABLE wakeclub leads postgres' \
  '3600; 0 16900 TABLE DATA wakeclub leads postgres' '231; 1259 17000 TABLE public wakeclub postgres' \
  '3712; 0 0 ACL wakeclub TABLE leads postgres')"
assert_eq "$(printf '%s\n' '6; 2615 16860 SCHEMA - wakeclub postgres' '3711; 0 0 ACL - SCHEMA wakeclub postgres' \
  '230; 1259 16900 TABLE wakeclub leads postgres' '3600; 0 16900 TABLE DATA wakeclub leads postgres' \
  '3712; 0 0 ACL wakeclub TABLE leads postgres')" "$(printf '%s\n' "$TOC" | toc_wakeclub)" \
  "lista do pg_restore só com o schema wakeclub (com SCHEMA e ACL dele)"

# Guard do main (o trecho real do fim do instalar.sh): roda quando executado,
# inclusive por /dev/fd como em `bash <(curl ...)`, e não quando carregado com `.`.
GUARD="$(tail -n 3 "$AQUI/instalar.sh" | sed 's/main "\$@"/echo main/')"
assert_eq main "$(bash <(printf '%s\n' "$GUARD"))" "bash <(...) roda main"
assert_eq "" "$(GUARD="$GUARD" bash -c '. <(printf "%s\n" "$GUARD")')" "carregado com . não roda main"

echo "todos os $N testes passaram"
