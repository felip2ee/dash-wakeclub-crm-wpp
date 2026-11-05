#!/usr/bin/env bash
# shellcheck disable=SC2016
# Funções do instalador de produção do WakeCRM. Existe para ficarem testáveis
# (deploy/lib.test.sh) e reutilizáveis por deploy/instalar.sh. Só funções: sem
# `set -e` aqui, os erros viram código de retorno. Compatível com bash 3.2+.

# 64 caracteres hex (32 bytes aleatórios).
gerar_segredo() { openssl rand -hex 32; }

# ler_credencial ARQUIVO CHAVE: valor cru após o primeiro `=`; vazio se ausente.
ler_credencial() {
  [ -f "$1" ] || return 0
  grep -m1 "^$2=" "$1" | cut -d= -f2- || true
}

# garantir_credencial ARQUIVO CHAVE VALOR_NOVO: grava só se não houver valor.
garantir_credencial() {
  local arq="$1" chave="$2" novo="$3" tmp
  [ -n "$(ler_credencial "$arq" "$chave")" ] && return 0
  (
    umask 077
    tmp="$arq.tmp.$$"
    if [ -f "$arq" ]; then grep -v "^$chave=" "$arq" >"$tmp" || true; else : >"$tmp"; fi
    printf '%s=%s\n' "$chave" "$novo" >>"$tmp"
    mv "$tmp" "$arq"
  )
}

# valor_env_servico TEXTO CHAVE: TEXTO é uma linha CHAVE=valor por linha.
valor_env_servico() {
  printf '%s\n' "$1" | grep -m1 "^$2=" | cut -d= -f2- || true
}

# valor_orion ARQUIVO ROTULO: valor depois de `ROTULO:` numa linha que começa pelo rótulo
# (arquivos do SetupOrion em /root/dados_vps), sem espaços nas pontas nem CR; vazio se não
# houver. Só o primeiro `:` depois do rótulo separa (URLs têm `:`). Sempre retorna 0.
valor_orion() {
  [ -f "$1" ] || return 0
  ROTULO_ORION="$2:" awk '
    { sub(/\r$/, "") }
    index($0, ENVIRON["ROTULO_ORION"]) == 1 {
      v = substr($0, length(ENVIRON["ROTULO_ORION"]) + 1)
      sub(/^[ \t]+/, "", v)
      sub(/[ \t]+$/, "", v)
      print v
      exit
    }' "$1" 2>/dev/null || true
}

# certresolver_traefik TEXTO: nome do resolver em flag ou label; vazio se não houver.
certresolver_traefik() {
  local nome
  nome="$(printf '%s\n' "$1" | sed -n 's/.*certificatesresolvers\.\([^.=]*\)\..*/\1/p' | head -n1)"
  [ -n "$nome" ] || nome="$(printf '%s\n' "$1" | sed -n 's/.*tls\.certresolver=\([^ ]*\).*/\1/p' | head -n1)"
  printf '%s\n' "$nome"
}

# _pct TEXTO: percent-encoding byte a byte (só não reservados passam).
_pct() {
  local saida="" h d
  for h in $(printf '%s' "$1" | od -An -v -tx1); do
    d=$((16#$h))
    if { [ "$d" -ge 48 ] && [ "$d" -le 57 ]; } || { [ "$d" -ge 65 ] && [ "$d" -le 90 ]; } ||
      { [ "$d" -ge 97 ] && [ "$d" -le 122 ]; } || [ "$d" -eq 45 ] || [ "$d" -eq 46 ] ||
      [ "$d" -eq 95 ] || [ "$d" -eq 126 ]; then
      saida="$saida$(printf "%b" "\\x$h")"
    else
      saida="$saida%$(printf '%s' "$h" | tr 'a-f' 'A-F')"
    fi
  done
  printf '%s' "$saida"
}

# url_postgres USUARIO SENHA HOST PORTA BANCO: usuário e senha com percent-encoding.
url_postgres() {
  printf 'postgres://%s:%s@%s:%s/%s\n' "$(_pct "$1")" "$(_pct "$2")" "$3" "$4" "$5"
}

# render_stack MODELO ARQUIVO_ENV: troca cada ${CHAVE}; chave ausente => código 1.
render_stack() {
  local texto chave val padrao antes
  texto="$(cat "$1")"
  for chave in $(grep -o '\${[A-Za-z_][A-Za-z0-9_]*}' "$1" | sort -u | tr -d '${}'); do
    if ! grep -q "^$chave=" "$2"; then
      echo "render_stack: chave ausente em $2: $chave" >&2
      return 1
    fi
    val="$(ler_credencial "$2" "$chave")"
    padrao="\${$chave}"
    # Laço manual: `${//}` trataria `&` e `\` do valor como especiais.
    antes=""
    while [ "${texto#*"$padrao"}" != "$texto" ]; do
      antes="$antes${texto%%"$padrao"*}$val"
      texto="${texto#*"$padrao"}"
    done
    texto="$antes$texto"
  done
  printf '%s\n' "$texto"
}

# rede_attachable TEXTO: 0 se for `true`.
rede_attachable() { [ "$1" = "true" ]; }

# esperar_ate SEGUNDOS INTERVALO COMANDO...: repete até sucesso ou estourar o prazo.
esperar_ate() {
  local limite=$((SECONDS + $1)) intervalo="$2" rc
  shift 2
  while :; do
    if "$@"; then return 0; else rc=$?; fi
    [ "$SECONDS" -ge "$limite" ] && return "$rc"
    sleep "$intervalo"
  done
}

# Saída padronizada; cores só em TTY (paleta de scripts/painel-db.mjs).
_cor() { # CODIGO TEXTO
  if [ -t 1 ]; then printf '\033[%sm%s\033[0m\n' "$1" "$2"; else printf '%s\n' "$2"; fi
}
passo() { _cor 1 "[$1] $2"; }
ok() { _cor 32 "✓ $1"; }
falha() { _cor 31 "✗ $1"; }
aviso() { _cor 33 "! $1"; }
