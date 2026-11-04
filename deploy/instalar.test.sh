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

# pula_resposta: Enter, n e N pulam a redefinição de senha; um usuário segue.
for r in "" n N; do
  assert_eq 0 "$(pula_resposta "$r"; echo $?)" "resposta [$r] pula"
done
assert_eq 1 "$(pula_resposta dono; echo $?)" "usuário não pula"
assert_eq 1 "$(pula_resposta no; echo $?)" "\"no\" é tratado como usuário"

# comando_restaurar: o manual usa o mesmo script atômico, com lista e dump nessa ordem.
# shellcheck disable=SC2034 # lidas dentro de comando_restaurar
REDE=r1 DIR_BACKUPS=/root/wakecrm/backups PG_HOST=pg PG_USUARIO=postgres PG_MAJOR=14
CMD="$(comando_restaurar /root/wakecrm/backups/w.dump /root/wakecrm/backups/w.dump.lista)"
case "$CMD" in
  *"-e PGHOST=pg -e PGUSER=postgres postgres:14 sh -c '$SCRIPT_RESTAURAR' sh /backups/w.dump.lista /backups/w.dump") r=ok ;;
  *) r="$CMD" ;;
esac
assert_eq ok "$r" "comando manual de restauração"
case "$SCRIPT_RESTAURAR" in *"drop schema"*"psql -X -q -1 -v ON_ERROR_STOP=1"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "drop e restauração na mesma transação (psql -1)"
case "$CMD" in *PGPASSWORD* | *teste*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "comando manual sem senha"

# Guard do main (o trecho real do fim do instalar.sh): roda quando executado,
# inclusive por /dev/fd como em `bash <(curl ...)`, e não quando carregado com `.`.
GUARD="$(tail -n 3 "$AQUI/instalar.sh" | sed 's/main "\$@"/echo main/')"
assert_eq main "$(bash <(printf '%s\n' "$GUARD"))" "bash <(...) roda main"
assert_eq "" "$(GUARD="$GUARD" bash -c '. <(printf "%s\n" "$GUARD")')" "carregado com . não roda main"

echo "todos os $N testes passaram"
