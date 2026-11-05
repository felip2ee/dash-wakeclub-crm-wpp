#!/usr/bin/env bash
# shellcheck disable=SC2016,SC2012,SC1091
# Testes das funções de deploy/lib.sh. Bash puro; sai 1 no primeiro erro.
AQUI="$(cd "$(dirname "$0")" && pwd)"
. "$AQUI/lib.sh" || { echo "FALHOU: lib.sh ausente" >&2; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
N=0

assert_eq() { # ESPERADO OBTIDO NOME
  N=$((N + 1))
  if [ "$1" != "$2" ]; then
    printf 'FALHOU: %s\n  esperado: [%s]\n  obtido:   [%s]\n' "$3" "$1" "$2" >&2
    exit 1
  fi
  echo "ok $N - $3"
}

assert_falha() { # NOME COMANDO...
  local nome="$1"
  shift
  N=$((N + 1))
  if "$@" >/dev/null 2>&1; then
    echo "FALHOU: $nome (esperava código != 0)" >&2
    exit 1
  fi
  echo "ok $N - $nome"
}

# gerar_segredo
s1="$(gerar_segredo)"
s2="$(gerar_segredo)"
if [[ "$s1" =~ ^[0-9a-f]{64}$ ]]; then r=sim; else r=nao; fi
assert_eq sim "$r" "gerar_segredo tem 64 hex"
if [ "$s1" != "$s2" ]; then r=diferem; else r=iguais; fi
assert_eq diferem "$r" "gerar_segredo muda a cada chamada"

# garantir_credencial / ler_credencial
cred="$TMP/credenciais"
garantir_credencial "$cred" PG_SENHA primeiro
assert_eq primeiro "$(ler_credencial "$cred" PG_SENHA)" "garantir grava arquivo novo"
garantir_credencial "$cred" PG_SENHA segundo
assert_eq primeiro "$(ler_credencial "$cred" PG_SENHA)" "garantir mantém valor existente"
assert_eq "-rw-------" "$(ls -l "$cred" | cut -c1-10)" "arquivo com modo 600"
garantir_credencial "$cred" OUTRA 'a=b "c" $d'
assert_eq 'a=b "c" $d' "$(ler_credencial "$cred" OUTRA)" "valor cru com = e aspas"
assert_eq "" "$(ler_credencial "$cred" NADA)" "ler chave ausente é vazio"
assert_eq "" "$(ler_credencial "$TMP/naoexiste" X)" "ler arquivo ausente é vazio"
printf 'VAZIA=\n' >>"$cred"
garantir_credencial "$cred" VAZIA preenchida
assert_eq preenchida "$(ler_credencial "$cred" VAZIA)" "garantir substitui valor vazio"
assert_eq 1 "$(grep -c '^VAZIA=' "$cred")" "sem linha duplicada"

# valor_env_servico
assert_eq "a=b" "$(valor_env_servico $'POSTGRES_PASSWORD=a=b\nX=1' POSTGRES_PASSWORD)" "valor_env_servico divide no primeiro ="

# valor_orion: arquivos do SetupOrion (/root/dados_vps), no formato real.
printf '%s\n' '[ PORTAINER ]' 'Dominio do portainer: painel.exemplo.com' '' 'Usuario: dono' '' \
  'Senha: s3nh@:x y' '' 'Token: ptr_abc123' >"$TMP/dados_portainer"
printf '%s\n' '[ EVOLUTION API ]' '' 'Manager Evolution: https://evo.exemplo.com/manager' '' \
  'BaseUrl: https://x:443/y' '' 'Global API Key: chave-global' >"$TMP/dados_evolution"
printf '%s\r\n' '[ POSTGRES ]' '' 'Host: postgres' '' 'Port: 5432' '' 'Usuario: postgres' '' 'Senha: pg-crlf  ' \
  >"$TMP/dados_postgres"
printf '%s\n' '[DADOS DA VPS]' 'Guarde estes dados: Rede interna: falsa' 'Nome do Servidor: vps1' '' \
  'Rede interna: orion_net' '' 'Email para SSL: a@b.c' '' 'Link do Portainer: https://painel.exemplo.com' \
  'texto livre no fim' 'Token:' >"$TMP/dados_vps"
assert_eq painel.exemplo.com "$(valor_orion "$TMP/dados_portainer" "Dominio do portainer")" "orion: rótulo com espaços"
assert_eq 's3nh@:x y' "$(valor_orion "$TMP/dados_portainer" Senha)" "orion: valor com : e espaço no meio"
assert_eq ptr_abc123 "$(valor_orion "$TMP/dados_portainer" Token)" "orion: token"
assert_eq 'https://x:443/y' "$(valor_orion "$TMP/dados_evolution" BaseUrl)" "orion: URL com porta"
assert_eq chave-global "$(valor_orion "$TMP/dados_evolution" "Global API Key")" "orion: chave da Evolution"
assert_eq pg-crlf "$(valor_orion "$TMP/dados_postgres" Senha)" "orion: CRLF e espaço no fim saem"
assert_eq 5432 "$(valor_orion "$TMP/dados_postgres" Port)" "orion: porta"
assert_eq orion_net "$(valor_orion "$TMP/dados_vps" "Rede interna")" "orion: rótulo só no começo da linha"
assert_eq "" "$(valor_orion "$TMP/dados_vps" Token)" "orion: rótulo sem valor é vazio"
assert_eq "" "$(valor_orion "$TMP/dados_vps" Rede)" "orion: rótulo parcial não casa"
assert_eq "" "$(valor_orion "$TMP/dados_evolution" Senha)" "orion: rótulo ausente é vazio"
assert_eq "" "$(valor_orion "$TMP/nada" Senha)" "orion: arquivo ausente é vazio"
valor_orion "$TMP/nada" Senha
assert_eq 0 "$?" "orion: arquivo ausente retorna 0"

# certresolver_traefik
assert_eq letsencryptresolver "$(certresolver_traefik '--certificatesresolvers.letsencryptresolver.acme.email=x')" "resolver por flag"
assert_eq le "$(certresolver_traefik 'traefik.http.routers.a.tls.certresolver=le')" "resolver por label"
assert_eq "" "$(certresolver_traefik $'--api=true\nfoo=bar')" "resolver ausente é vazio"

# url_postgres
assert_eq 'postgres://postgres:p%40ss%3Aw%2Frd%231@postgres:5432/wakeclub' \
  "$(url_postgres postgres 'p@ss:w/rd#1' postgres 5432 wakeclub)" "url_postgres codifica a senha"
assert_eq 'postgres://u:Az09._~-@h:1/b' "$(url_postgres u 'Az09._~-' h 1 b)" "url_postgres preserva não reservados"

# render_stack
printf 'DOMINIO=crm.exemplo.com\nSENHA=a&b\\1\n' >"$TMP/env"
printf 'host: ${DOMINIO}\nx: ${DOMINIO} ${SENHA}\n' >"$TMP/modelo"
assert_eq $'host: crm.exemplo.com\nx: crm.exemplo.com a&b\\1' "$(render_stack "$TMP/modelo" "$TMP/env")" "render_stack troca variáveis"
printf 'a: ${FALTA}\n' >"$TMP/modelo2"
err="$(render_stack "$TMP/modelo2" "$TMP/env" 2>&1 >/dev/null)"
rc=$?
assert_eq 1 "$rc" "render_stack chave ausente retorna 1"
case "$err" in *FALTA*) r=sim ;; *) r=nao ;; esac
assert_eq sim "$r" "render_stack cita a chave ausente no stderr"

# rede_attachable
rede_attachable true
assert_eq 0 "$?" "rede_attachable true"
rede_attachable false
assert_eq 1 "$?" "rede_attachable false"

# esperar_ate
t0=$SECONDS
assert_falha "esperar_ate falha ao estourar" esperar_ate 2 1 false
dt=$((SECONDS - t0))
if [ "$dt" -le 3 ]; then r=ok; else r="lento($dt)"; fi
assert_eq ok "$r" "esperar_ate respeita o prazo"
esperar_ate 2 1 true
assert_eq 0 "$?" "esperar_ate sucesso"

# esperar_ate sob `set -e` (o instalador roda assim)
cont="$TMP/cont"
: >"$cont"
export CONT="$cont"
falha_duas() { echo x >>"$CONT"; [ "$(wc -l <"$CONT")" -ge 3 ]; }
saida="$(bash -ec ". '$AQUI/lib.sh'; $(declare -f falha_duas); esperar_ate 5 1 falha_duas; echo fim" 2>&1)"
assert_eq fim "$saida" "esperar_ate sob set -e tenta de novo e retorna 0"
saida="$(bash -ec ". '$AQUI/lib.sh'; esperar_ate 1 1 false || echo rc=\$?; echo vivo" 2>&1)"
assert_eq $'rc=1\nvivo' "$saida" "esperar_ate sob set -e não aborta antes do prazo"
assert_eq "✓ a" "$(ok a)" "ok com ✓"
assert_eq "✗ a" "$(falha a)" "falha com ✗"
assert_eq "! a" "$(aviso a)" "aviso com !"

echo "todos os $N testes passaram"
