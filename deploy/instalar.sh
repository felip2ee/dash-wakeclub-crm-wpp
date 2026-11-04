#!/usr/bin/env bash
# Instalador de produção do WakeCRM (Docker Swarm no padrão Orion). Existe para o dono
# publicar o CRM colando um comando só, como root, no servidor:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/felip2ee/dash-wakeclub-crm-wpp/main/deploy/instalar.sh)
#
# Detecta Postgres, Traefik, Evolution e Portainer, pergunta só o que não descobre,
# mostra um resumo e pede uma confirmação antes de mexer em qualquer coisa.
# Contrato: docs/superpowers/specs/2026-11-04-wakecrm-instalador-design.md.
#
# Variáveis para execução sem perguntas (teste ponta a ponta):
#   WAKECRM_DOMINIO, WAKECRM_INSTANCIA  respostas das perguntas
#   WAKECRM_SIM=1                       aceita sugestões e confirma sozinho
#   WAKECRM_REF                         ref do GitHub de onde baixar lib.sh (padrão main)
#   WAKECRM_DIR                         pasta das credenciais e backups (padrão /root/wakecrm)
#   WAKECRM_IMAGEM                      imagem do app (padrão a do GHCR; teste usa uma local)
#   WAKECRM_ADMIN_USUARIO, WAKECRM_ADMIN_SENHA, WAKECRM_ADMIN_NOME
#                                       admin do CRM com WAKECRM_SIM=1 (sem eles: pula se já
#                                       houver admin, para se não houver)
#   WAKECRM_FALHAR_MIGRACAO=NNNN        só teste: aplica até a anterior e falha (exercita a volta)
set -euo pipefail

IMAGEM="${WAKECRM_IMAGEM:-ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest}"
DIR_WAKECRM="${WAKECRM_DIR:-/root/wakecrm}"
CREDENCIAIS="$DIR_WAKECRM/credenciais.env"
DIR_BACKUPS="$DIR_WAKECRM/backups"
SERVICO_APP="wakecrm_wakecrm"
SIM="${WAKECRM_SIM:-}"

# Tudo que é temporário (inclusive arquivos com segredo) mora aqui e sai no fim.
TMP="$(mktemp -d)"
chmod 700 "$TMP"
MIGRANDO=""

# Saída (normal, erro ou sinal): interrompido no meio da migração, tenta a volta
# automática antes de apagar TMP. Os traps são desfeitos e os sinais ignorados
# (inclusive pelos filhos) para não reentrar nem cortar a restauração.
ao_sair() {
  local rc=$?
  trap - EXIT
  trap '' INT TERM HUP
  set +e
  if [ -n "$MIGRANDO" ]; then
    MIGRANDO=""
    falha "Instalação interrompida durante a migração."
    if restaurar "$BACKUP"; then religar_app; fi
    echo "Backup: $BACKUP"
  fi
  rm -rf "$TMP"
  exit "$rc"
}
trap ao_sair EXIT
trap 'exit 130' INT TERM HUP

# ---------------------------------------------------------------------------
# Carregar lib.sh: do repositório quando houver, senão da mesma ref no GitHub.
# ---------------------------------------------------------------------------
DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
if [ -n "$DIR_SCRIPT" ] && [ -f "$DIR_SCRIPT/lib.sh" ] && [ -f "$DIR_SCRIPT/wakecrm-stack.yml" ]; then
  DIR_DEPLOY="$DIR_SCRIPT"
else
  # Rodando por `bash <(curl ...)`: BASH_SOURCE aponta para /dev/fd.
  DIR_DEPLOY="$TMP/deploy"
  mkdir -p "$DIR_DEPLOY"
  BASE_RAW="https://raw.githubusercontent.com/felip2ee/dash-wakeclub-crm-wpp/${WAKECRM_REF:-main}/deploy"
  for f in lib.sh wakecrm-stack.yml; do
    if ! curl -fsSL "$BASE_RAW/$f" -o "$DIR_DEPLOY/$f"; then
      echo "✗ Não consegui baixar $BASE_RAW/$f" >&2
      exit 1
    fi
  done
fi
# shellcheck disable=SC2034 # usado pela publicação (Task 7)
MODELO_STACK="$DIR_DEPLOY/wakecrm-stack.yml"
# shellcheck source=deploy/lib.sh
. "$DIR_DEPLOY/lib.sh"

# ---------------------------------------------------------------------------
# Entrada do usuário. O script chega por pipe/fd, então lê do terminal (/dev/tty).
# Com WAKECRM_SIM=1 nunca lê: usa a sugestão ou para com erro se não houver.
# ---------------------------------------------------------------------------
morrer() {
  falha "$1"
  exit 1
}

# Os locais têm prefixo por função: printf -v com nome dinâmico acertaria o local
# de outra função com o mesmo nome (escopo dinâmico do bash).

# ler_linha VAR [-s]: lê uma linha do terminal para VAR (-s não ecoa). Prefere o
# terminal; sem ele, lê do stdin. Fim da entrada para o instalador (sem laço infinito).
ler_linha() {
  local __l_v=""
  if [ -t 0 ] || ! { : </dev/tty; } 2>/dev/null; then
    IFS= read -r ${2:+"$2"} __l_v || [ -n "$__l_v" ] || morrer "Entrada terminou antes da resposta."
  else
    IFS= read -r ${2:+"$2"} __l_v </dev/tty || [ -n "$__l_v" ] || morrer "Entrada terminou antes da resposta."
  fi
  if [ "${2:-}" = "-s" ]; then echo >&2; fi
  printf -v "$1" '%s' "$__l_v"
}

# perguntar VAR TEXTO [SUGESTAO] [-s]: resposta vazia vira a sugestão.
perguntar() {
  local __p_var="$1" __p_texto="$2" __p_sug="${3:-}" __p_resp=""
  if [ -n "$SIM" ]; then
    printf -v "$__p_var" '%s' "$__p_sug"
    return 0
  fi
  if [ -n "$__p_sug" ] && [ "${4:-}" != "-s" ]; then
    printf '%s [%s]: ' "$__p_texto" "$__p_sug" >&2
  else
    printf '%s: ' "$__p_texto" >&2
  fi
  ler_linha __p_resp "${4:-}"
  printf -v "$__p_var" '%s' "${__p_resp:-$__p_sug}"
}

# escolher VAR TITULO PADRAO OPCAO...: menu numerado; PADRAO (se for opção) é a sugestão.
escolher() {
  local __e_var="$1" __e_titulo="$2" __e_padrao="$3" __e_i=1 __e_n=1 __e_resp __e_o
  shift 3
  for __e_o in "$@"; do
    if [ "$__e_o" = "$__e_padrao" ]; then __e_n="$__e_i"; fi
    __e_i=$((__e_i + 1))
  done
  if [ -z "$SIM" ]; then
    echo "$__e_titulo" >&2
    __e_i=1
    for __e_o in "$@"; do
      printf '  %s) %s\n' "$__e_i" "$__e_o" >&2
      __e_i=$((__e_i + 1))
    done
    while :; do
      perguntar __e_resp "Número" "$__e_n"
      if [[ "$__e_resp" =~ ^[0-9]+$ ]] && [ "$__e_resp" -ge 1 ] && [ "$__e_resp" -le $# ]; then
        __e_n="$__e_resp"
        break
      fi
      aviso "Digite um número de 1 a $#." >&2
    done
  fi
  printf -v "$__e_var" '%s' "${@:$__e_n:1}"
}

# ---------------------------------------------------------------------------
# Docker: leitura do Swarm. Nada aqui muda estado.
# ---------------------------------------------------------------------------

# imagem_base IMAGEM: sem digest e sem prefixo docker.io/library/.
imagem_base() {
  local i="${1%%@*}"
  i="${i#docker.io/}"
  i="${i#library/}"
  printf '%s\n' "$i"
}

# major_postgres IMAGEM: postgres:14.5 -> 14; pgvector/pgvector:pg16 -> 16; vazio se não der.
major_postgres() {
  local img tag
  img="$(imagem_base "$1")"
  case "${img##*/}" in *:*) tag="${img##*:}" ;; *) tag="" ;; esac
  if [[ "$tag" =~ pg([0-9]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$tag" =~ ^([0-9]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  fi
}

# servicos_por PADRAO_IMAGEM PADRAO_NOME: nomes de serviço, primeiro por imagem
# (regex estendida sobre a imagem base), só depois por nome.
servicos_por() {
  local nome img achados=""
  while read -r nome img; do
    [ -n "$nome" ] || continue
    if imagem_base "$img" | grep -Eq "$1"; then achados="$achados$nome"$'\n'; fi
  done <<<"$SERVICOS"
  if [ -z "$achados" ]; then
    while read -r nome img; do
      [ -n "$nome" ] || continue
      if printf '%s\n' "$nome" | grep -Eiq "$2"; then achados="$achados$nome"$'\n'; fi
    done <<<"$SERVICOS"
  fi
  printf '%s' "$achados"
}

servico_existe() { docker service inspect "$1" >/dev/null 2>&1; }

# env_servico SERVICO: linhas CHAVE=valor do serviço. Só para variável, nunca imprimir.
env_servico() {
  docker service inspect --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' "$1"
}

imagem_servico() {
  docker service inspect --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' "$1"
}

# redes_servico SERVICO: nomes das redes, uma por linha.
redes_servico() {
  local id
  for id in $(docker service inspect --format '{{range .Spec.TaskTemplate.Networks}}{{.Target}} {{end}}' "$1"); do
    docker network inspect --format '{{.Name}}' "$id"
  done
}

# detectar_servico VAR ROTULO PADRAO_IMAGEM PADRAO_NOME SALVO OBRIGATORIO
# Um candidato: usa. Vários: menu (o salvo vem marcado). Nenhum: pergunta o nome.
# OBRIGATORIO vazio permite pular (VAR fica vazio).
detectar_servico() {
  local __d_var="$1" __d_rotulo="$2" __d_salvo="$5" __d_obrig="$6" __d_lista __d_nome
  local -a __d_cand=()
  __d_lista="$(servicos_por "$3" "$4")"
  while IFS= read -r __d_nome; do [ -n "$__d_nome" ] && __d_cand+=("$__d_nome"); done <<<"$__d_lista"
  if [ "${#__d_cand[@]}" -eq 1 ]; then
    __d_nome="${__d_cand[0]}"
  elif [ "${#__d_cand[@]}" -gt 1 ]; then
    escolher __d_nome "Encontrei mais de um serviço de $__d_rotulo:" "$__d_salvo" "${__d_cand[@]}"
  else
    aviso "Não encontrei o serviço de $__d_rotulo."
    while :; do
      if [ -n "$__d_obrig" ]; then
        perguntar __d_nome "Nome do serviço de $__d_rotulo (docker service ls)" "$__d_salvo"
        if [ -z "$__d_nome" ]; then
          [ -z "$SIM" ] || morrer "Serviço de $__d_rotulo não encontrado."
          continue
        fi
      else
        perguntar __d_nome "Nome do serviço de $__d_rotulo (Enter pula)" "$__d_salvo"
        [ -n "$__d_nome" ] || break
      fi
      servico_existe "$__d_nome" && break
      aviso "Serviço \"$__d_nome\" não existe."
      [ -z "$SIM" ] || morrer "Serviço de $__d_rotulo não encontrado."
    done
  fi
  if [ -n "$__d_nome" ]; then ok "$__d_rotulo: $__d_nome"; fi
  printf -v "$__d_var" '%s' "$__d_nome"
}

# ---------------------------------------------------------------------------
# Credenciais
# ---------------------------------------------------------------------------

# definir_credencial ARQUIVO CHAVE VALOR: grava ou troca (valores decididos/detectados).
# Segredos usam garantir_credencial da lib, que nunca troca.
definir_credencial() {
  local atual
  atual="$(ler_credencial "$1" "$2")"
  # Vazio nunca apaga um valor salvo (ex.: chave da Evolution sumiu do serviço).
  if [ -z "$3" ] && [ -n "$atual" ]; then return 0; fi
  if [ -f "$1" ] && grep -q "^$2=" "$1"; then
    [ "$atual" = "$3" ] && return 0
    (
      umask 077
      grep -v "^$2=" "$1" >"$1.tmp.$$" || true
      mv "$1.tmp.$$" "$1"
    )
  fi
  # Grava mesmo vazio: render_stack exige a chave presente.
  garantir_credencial "$1" "$2" "$3"
}

# arquivo_env CHAVE...: arquivo temporário 600 com CHAVE=valor das variáveis de shell.
# Segredos chegam aos contêineres por --env-file, nunca por argumento (ps).
arquivo_env() {
  local arq chave
  arq="$(mktemp "$TMP/env.XXXXXX")"
  chmod 600 "$arq"
  for chave in "$@"; do printf '%s=%s\n' "$chave" "${!chave}" >>"$arq"; done
  printf '%s\n' "$arq"
}

# rodar_no_app ENVFILE CMD...: contêiner temporário da imagem do app na REDE.
rodar_no_app() {
  local env="$1"
  shift
  docker run --rm --network "$REDE" --env-file "$env" "$IMAGEM" "$@"
}

# rodar_no_pg ENVFILE CMD...: contêiner temporário postgres:PG_MAJOR (mesma versão do
# servidor, para pg_dump/pg_restore) na REDE, com DIR_BACKUPS em /backups.
rodar_no_pg() {
  local env="$1"
  shift
  (umask 077 && mkdir -p "$DIR_BACKUPS")
  docker run --rm --network "$REDE" --env-file "$env" -v "$DIR_BACKUPS:/backups" \
    "postgres:${PG_MAJOR}" "$@"
}

# env_pg [BANCO]: arquivo de ambiente libpq do superusuário (padrão: banco wakeclub).
env_pg() {
  # shellcheck disable=SC2034 # lidas por nome em arquivo_env
  local PGHOST="$PG_HOST" PGUSER="$PG_USUARIO" PGPASSWORD="$PG_SENHA" PGDATABASE="${1:-wakeclub}" \
    PGOPTIONS="-c client_min_messages=warning"
  arquivo_env PGHOST PGUSER PGPASSWORD PGDATABASE PGOPTIONS
}

# sql_pg SQL: uma consulta no banco wakeclub, saída crua (-At); erro => código != 0.
sql_pg() {
  rodar_no_pg "$(env_pg)" psql -X -q -v ON_ERROR_STOP=1 -At -c "$1"
}

# checar_banco: o banco wakeclub precisa existir; o instalador não cria o banco do CRM.
checar_banco() {
  local existe
  existe="$(rodar_no_pg "$(env_pg postgres)" psql -X -At -c "select 1 from pg_database where datname = 'wakeclub'")" ||
    morrer "Não consegui conectar ao Postgres em $PG_HOST com o usuário $PG_USUARIO. Nada foi alterado."
  [ "$existe" = 1 ] ||
    morrer "O banco wakeclub não existe em $PG_SERVICO. O instalador não cria o banco do CRM: crie-o (ou restaure um dump) e rode de novo. Nada foi alterado."
}

# migracoes_no_banco: nomes em wakeclub.migracoes, ordem C; vazio se a tabela não existe.
migracoes_no_banco() {
  local existe
  existe="$(sql_pg "select to_regclass('wakeclub.migracoes') is not null")" || return 1
  [ "$existe" = t ] || return 0
  sql_pg "select nome from wakeclub.migracoes" | LC_ALL=C sort
}

# nomes_copy: lê a saída de `pg_restore -a -t migracoes -f -` e imprime a 1ª coluna
# das linhas de dados do COPY, ordem C.
nomes_copy() {
  sed -n '/^COPY /,/^\\\.$/p' | sed '1d;$d' | cut -f1 | LC_ALL=C sort
}

# toc_wakeclub: filtra a saída de `pg_restore -l` para o schema wakeclub, com a própria
# entrada SCHEMA e o ACL dele (que `pg_restore -n wakeclub` deixaria de fora).
toc_wakeclub() {
  grep -E '^[0-9]+; [0-9]+ [0-9]+ [A-Z ]+ (- (SCHEMA )?)?wakeclub '
}

# migracao_anterior NNNN: número da migração anterior, com 4 dígitos (0004 -> 0003).
migracao_anterior() {
  printf '%04d\n' $((10#$1 - 1))
}

# parar_app: escala o CRM para 0 antes do backup, para nada gravar entre o dump e uma
# eventual restauração. Guarda REPLICAS_ANTES (vazio se o serviço não existe).
parar_app() {
  REPLICAS_ANTES=""
  servico_existe "$SERVICO_APP" || return 0
  REPLICAS_ANTES="$(docker service inspect --format '{{.Spec.Mode.Replicated.Replicas}}' "$SERVICO_APP")"
  docker service scale "$SERVICO_APP=0" >/dev/null ||
    morrer "Não consegui escalar $SERVICO_APP para 0. Nada foi alterado no banco."
  ok "$SERVICO_APP parado (estava com $REPLICAS_ANTES réplica(s))"
}

# religar_app: volta o CRM às réplicas de antes (quando o banco ficou como estava).
religar_app() {
  [ -n "${REPLICAS_ANTES:-}" ] || return 0
  if docker service scale "$SERVICO_APP=$REPLICAS_ANTES" >/dev/null; then
    ok "$SERVICO_APP de volta com $REPLICAS_ANTES réplica(s)"
  else
    aviso "Não consegui religar o CRM: docker service scale $SERVICO_APP=$REPLICAS_ANTES"
  fi
}

# fazer_backup: pg_dump -Fc do banco wakeclub em DIR_BACKUPS, conferido com
# pg_restore --list. Sucesso grava o caminho em BACKUP; falha => código 1.
fazer_backup() {
  local nome lista
  nome="wakeclub-$(date +%Y%m%d-%H%M%S).dump"
  # shellcheck disable=SC2016 # $1 expande dentro do contêiner
  if ! rodar_no_pg "$(env_pg)" sh -c 'umask 077 && pg_dump -Fc -f "$1"' sh "/backups/$nome"; then
    falha "pg_dump falhou."
    return 1
  fi
  chmod 600 "$DIR_BACKUPS/$nome"
  lista="$(rodar_no_pg "$(env_pg)" pg_restore --list "/backups/$nome")" || lista=""
  if [ -z "$lista" ]; then
    falha "O backup $DIR_BACKUPS/$nome não passou no pg_restore --list."
    return 1
  fi
  BACKUP="$DIR_BACKUPS/$nome"
  ok "backup: $BACKUP"
}

# Roda dentro do contêiner postgres (sh -c, $1 = lista, $2 = dump): gera o SQL do schema
# wakeclub e aplica o drop e a recriação numa transação só (psql -1). Qualquer falha
# deixa o banco como estava antes da tentativa.
# shellcheck disable=SC2016 # expande dentro do contêiner
SCRIPT_RESTAURAR='pg_restore -L "$1" -f /tmp/r.sql "$2" && { echo "drop schema if exists wakeclub cascade;"; cat /tmp/r.sql; } | psql -X -q -1 -v ON_ERROR_STOP=1 -o /dev/null -d wakeclub'

# comando_restaurar DUMP LISTA: comando manual equivalente (pede a senha do superusuário).
comando_restaurar() {
  printf '%s\n' "docker run --rm -it --network $REDE -v $DIR_BACKUPS:/backups -e PGHOST=$PG_HOST -e PGUSER=$PG_USUARIO postgres:$PG_MAJOR sh -c '$SCRIPT_RESTAURAR' sh /backups/${2##*/} /backups/${1##*/}"
}

# restaurar BACKUP: recria o schema wakeclub a partir do dump (donos e grants do dump),
# atômico, e confere que wakeclub.migracoes tem os mesmos nomes do backup.
restaurar() {
  local dump="/backups/${1##*/}" lista="$1.lista" esperado obtido
  aviso "Restaurando o banco a partir de $1..."
  if esperado="$(rodar_no_pg "$(env_pg)" pg_restore -a -n wakeclub -t migracoes -f - "$dump" | nomes_copy)" &&
    rodar_no_pg "$(env_pg)" pg_restore -l "$dump" | toc_wakeclub >"$lista" &&
    rodar_no_pg "$(env_pg)" sh -c "$SCRIPT_RESTAURAR" sh "/backups/${lista##*/}" "$dump" &&
    obtido="$(migracoes_no_banco)" && [ "$obtido" = "$esperado" ]; then
    ok "banco restaurado"
  else
    # A lista fica para o comando manual abaixo.
    falha "A restauração falhou. O dump continua em $1. Para restaurar à mão (pede a senha do $PG_USUARIO):"
    echo "  $(comando_restaurar "$1" "$lista")"
    return 1
  fi
  rm -f "$lista"
}

# aplicar_banco: migrar.mjs (pendentes e a role wakecrm_motor) e painel-db.mjs apply
# (roles painel_ro/painel_rw e views). Idempotente; falha => código != 0.
aplicar_banco() {
  local env
  env="$(arquivo_env ADMIN_DATABASE_URL WAKECRM_MOTOR_PASSWORD PAINEL_RO_PASSWORD PAINEL_RW_PASSWORD \
    DATABASE_URL DATABASE_URL_RW)"
  if [ -n "${WAKECRM_FALHAR_MIGRACAO:-}" ]; then
    # Só teste: para no meio do caminho para exercitar a volta automática.
    rodar_no_app "$env" bun scripts/migrar.mjs --ate "$(migracao_anterior "$WAKECRM_FALHAR_MIGRACAO")" || return 1
    falha "falha simulada antes da migração $WAKECRM_FALHAR_MIGRACAO (WAKECRM_FALHAR_MIGRACAO)"
    return 1
  fi
  rodar_no_app "$env" bun scripts/migrar.mjs || return 1
  rodar_no_app "$env" bun scripts/painel-db.mjs apply
}

# pula_resposta RESP: Enter, n ou N recusam (0); qualquer outra coisa segue (1).
pula_resposta() {
  case "$1" in "" | n | N) return 0 ;; *) return 1 ;; esac
}

# nome_admin LISTA USUARIO: nome do admin USUARIO na saída de `admin-crm.mjs listar`.
nome_admin() {
  printf '%s\n' "$1" | awk -F '\t' -v u="$2" '$1 == u { print $2; exit }'
}

# definir_admin: cria ou atualiza ADMIN_USUARIO com ADMIN_NOME/ADMIN_SENHA (por env-file).
definir_admin() {
  local env r
  env="$(arquivo_env ADMIN_DATABASE_URL ADMIN_NOME ADMIN_USUARIO ADMIN_SENHA)"
  r="$(rodar_no_app "$env" bun scripts/admin-crm.mjs definir)" || {
    rm -f "$env"
    return 1
  }
  rm -f "$env"
  ok "admin $ADMIN_USUARIO $r"
}

# checar_par_vapid PUBLICA PRIVADA: o par é uma unidade; metade salva para o instalador.
checar_par_vapid() {
  if [ -n "$1" ] && [ -z "$2" ]; then
    morrer "$CREDENCIAIS tem VITE_VAPID_PUBLIC_KEY mas não VAPID_PRIVATE_KEY. Apague as duas linhas para gerar um par novo."
  elif [ -z "$1" ] && [ -n "$2" ]; then
    morrer "$CREDENCIAIS tem VAPID_PRIVATE_KEY mas não VITE_VAPID_PUBLIC_KEY. Apague as duas linhas para gerar um par novo."
  fi
}

mascarar() {
  if [ -z "$1" ]; then echo "(vazio)"; else echo "•••••••• (${#1} caracteres)"; fi
}

# ---------------------------------------------------------------------------
# Passos
# ---------------------------------------------------------------------------

precondicoes() {
  passo 1 "Pré-condições"
  [ "$(id -u)" -eq 0 ] || morrer "Rode como root (sudo -i)."
  command -v docker >/dev/null 2>&1 || morrer "Docker não encontrado."
  command -v openssl >/dev/null 2>&1 || morrer "openssl não encontrado."
  local swarm
  swarm="$(docker info --format '{{.Swarm.LocalNodeState}} {{.Swarm.ControlAvailable}}' 2>/dev/null)" ||
    morrer "docker info falhou: o Docker está rodando?"
  [ "$swarm" = "active true" ] || morrer "Este servidor não é manager de um Docker Swarm ativo ($swarm)."
  ok "root, Docker e Swarm (manager)"
}

detectar() {
  passo 2 "Detectando o servidor"
  SERVICOS="$(docker service ls --format '{{.Name}} {{.Image}}')"

  # Postgres
  detectar_servico PG_SERVICO "Postgres" '^(postgres(:|$)|pgvector/)' 'postgres|pgvector' \
    "$(ler_credencial "$CREDENCIAIS" PG_SERVICO)" sim
  PG_HOST="$PG_SERVICO"
  local env_pg img_pg
  env_pg="$(env_servico "$PG_SERVICO")"
  PG_USUARIO="$(valor_env_servico "$env_pg" POSTGRES_USER)"
  PG_USUARIO="${PG_USUARIO:-postgres}"
  PG_SENHA="$(valor_env_servico "$env_pg" POSTGRES_PASSWORD)"
  PG_SENHA_ORIGEM="lida do serviço"
  if [ -z "$PG_SENHA" ]; then
    PG_SENHA_ORIGEM="digitada"
    aviso "POSTGRES_PASSWORD não está nas variáveis do serviço $PG_SERVICO."
    [ -z "$SIM" ] || morrer "Senha do Postgres não encontrada."
    perguntar PG_SENHA "Senha do usuário $PG_USUARIO do Postgres" "" -s
    [ -n "$PG_SENHA" ] || morrer "Senha do Postgres é obrigatória."
  fi
  img_pg="$(imagem_servico "$PG_SERVICO")"
  PG_MAJOR="$(major_postgres "$img_pg")"
  while ! [[ "$PG_MAJOR" =~ ^[0-9]+$ ]]; do
    [ -z "$SIM" ] || morrer "Não consegui ler a versão do Postgres da imagem $(imagem_base "$img_pg")."
    perguntar PG_MAJOR "Versão principal do Postgres (imagem $(imagem_base "$img_pg"), ex.: 14)" ""
  done
  ok "Postgres $PG_MAJOR, host $PG_HOST, usuário $PG_USUARIO, senha $PG_SENHA_ORIGEM"

  # Traefik e certresolver
  detectar_servico TRAEFIK_SERVICO "Traefik" '^traefik(:|$)' 'traefik' "" sim
  local texto_traefik
  texto_traefik="$(docker service inspect --format \
    '{{range .Spec.TaskTemplate.ContainerSpec.Command}}{{println .}}{{end}}{{range .Spec.TaskTemplate.ContainerSpec.Args}}{{println .}}{{end}}{{range $k, $v := .Spec.Labels}}{{$k}}={{$v}}{{println}}{{end}}' \
    "$TRAEFIK_SERVICO")"
  CERTRESOLVER="$(certresolver_traefik "$texto_traefik")"
  if [ -z "$CERTRESOLVER" ]; then
    # Orion põe o resolver nas labels de cada serviço publicado.
    # shellcheck disable=SC2046 # um argumento por serviço
    texto_traefik="$(docker service inspect --format '{{range $k, $v := .Spec.Labels}}{{$k}}={{$v}}{{println}}{{end}}' \
      $(docker service ls -q))"
    CERTRESOLVER="$(certresolver_traefik "$texto_traefik")"
  fi
  if [ -z "$CERTRESOLVER" ]; then
    aviso "Não achei o certresolver do Traefik."
    perguntar CERTRESOLVER "Nome do certresolver do Traefik" "$(ler_credencial "$CREDENCIAIS" CERTRESOLVER)"
    [ -n "$CERTRESOLVER" ] || morrer "Certresolver é obrigatório (HTTPS)."
  fi
  ok "certresolver: $CERTRESOLVER"

  # Rede overlay compartilhada entre Postgres e Traefik
  local redes_pg redes_tr r
  local -a comuns=()
  redes_pg="$(redes_servico "$PG_SERVICO")"
  redes_tr="$(redes_servico "$TRAEFIK_SERVICO")"
  while IFS= read -r r; do
    [ -n "$r" ] && printf '%s\n' "$redes_tr" | grep -qxF "$r" && comuns+=("$r")
  done <<<"$redes_pg"
  if [ "${#comuns[@]}" -eq 0 ]; then
    morrer "Postgres ($PG_SERVICO) e Traefik ($TRAEFIK_SERVICO) não compartilham nenhuma rede."
  elif [ "${#comuns[@]}" -eq 1 ]; then
    REDE="${comuns[0]}"
  else
    escolher REDE "Postgres e Traefik compartilham mais de uma rede:" \
      "$(ler_credencial "$CREDENCIAIS" REDE)" "${comuns[@]}"
  fi
  rede_attachable "$(docker network inspect --format '{{.Attachable}}' "$REDE")" ||
    morrer "A rede $REDE não é attachable: contêineres temporários (migração e backup) não entram nela. Nada foi alterado."
  ok "rede: $REDE (attachable)"

  # Evolution API 2.3.7 (não Evolution Go)
  detectar_servico EVO_SERVICO "Evolution API" '^(atendai/evolution-api|evoapicloud/evolution-api)' \
    'evolution[_-]?api' "" ""
  if [ -n "$EVO_SERVICO" ]; then
    local env_evo porta
    env_evo="$(env_servico "$EVO_SERVICO")"
    porta="$(valor_env_servico "$env_evo" SERVER_PORT)"
    EVOLUTION_URL="http://$EVO_SERVICO:${porta:-8080}"
    EVOLUTION_API_KEY="$(valor_env_servico "$env_evo" AUTHENTICATION_API_KEY)"
    if [ -z "$EVOLUTION_API_KEY" ]; then
      aviso "AUTHENTICATION_API_KEY não está nas variáveis de $EVO_SERVICO."
      EVOLUTION_API_KEY="$(ler_credencial "$CREDENCIAIS" EVOLUTION_API_KEY)"
      if [ -n "$EVOLUTION_API_KEY" ]; then
        ok "chave da Evolution reaproveitada de $CREDENCIAIS"
      elif [ -n "$SIM" ]; then
        aviso "Chave da Evolution fica vazia (o adaptador que a usa vem depois)."
      else
        perguntar EVOLUTION_API_KEY "Chave da API da Evolution (AUTHENTICATION_API_KEY, Enter deixa vazia)" "" -s
      fi
    fi
    redes_servico "$EVO_SERVICO" | grep -qxF "$REDE" ||
      aviso "A Evolution não está na rede $REDE: $EVOLUTION_URL pode não ser alcançável pelo CRM."
  else
    EVOLUTION_URL="$(ler_credencial "$CREDENCIAIS" EVOLUTION_URL)"
    EVOLUTION_API_KEY="$(ler_credencial "$CREDENCIAIS" EVOLUTION_API_KEY)"
    aviso "Sem Evolution: EVOLUTION_URL e EVOLUTION_API_KEY ficam como estavam (hoje o app não as lê)."
  fi

  # Portainer (a publicação pela API pergunta a credencial depois, Task 7)
  detectar_servico PORTAINER_SERVICO "Portainer" '^portainer/portainer' 'portainer' "" ""
  [ -n "$PORTAINER_SERVICO" ] || aviso "Sem Portainer: a stack sai por docker stack deploy."
}

perguntas() {
  passo 3 "Perguntas"
  local sug
  sug="${WAKECRM_DOMINIO:-$(ler_credencial "$CREDENCIAIS" DOMINIO)}"
  while :; do
    if [ -n "${WAKECRM_DOMINIO:-}" ]; then DOMINIO="$WAKECRM_DOMINIO"; else
      perguntar DOMINIO "Domínio do CRM, sem http (ex.: crm.seudominio.com.br)" "$sug"
    fi
    DOMINIO="$(printf '%s' "$DOMINIO" | tr '[:upper:]' '[:lower:]')"
    [[ "$DOMINIO" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] && break
    aviso "Domínio inválido: \"$DOMINIO\". Só o nome, sem http:// nem barra."
    if [ -n "$SIM" ] || [ -n "${WAKECRM_DOMINIO:-}" ]; then morrer "Domínio inválido."; fi
  done
  ok "domínio: $DOMINIO"

  sug="$(ler_credencial "$CREDENCIAIS" EVOLUTION_INSTANCIA)"
  while :; do
    if [ -n "${WAKECRM_INSTANCIA:-}" ]; then EVOLUTION_INSTANCIA="$WAKECRM_INSTANCIA"; else
      perguntar EVOLUTION_INSTANCIA "Nome da instância da Evolution" "${sug:-wakeclub}"
    fi
    [[ "$EVOLUTION_INSTANCIA" =~ ^[A-Za-z0-9_.-]+$ ]] && break
    aviso "Instância inválida: use letras, números, ponto, hífen ou sublinhado."
    if [ -n "$SIM" ] || [ -n "${WAKECRM_INSTANCIA:-}" ]; then morrer "Instância inválida."; fi
  done
  ok "instância: $EVOLUTION_INSTANCIA"
}

SEGREDOS="WEBHOOK_EVOLUTION_SECRET WEBHOOK_VENDAS_SECRET PAINEL_RO_PASSWORD PAINEL_RW_PASSWORD WAKECRM_MOTOR_PASSWORD PUSH_DISPATCH_SECRET"
DECIDIDOS="DOMINIO EVOLUTION_INSTANCIA EVOLUTION_URL EVOLUTION_API_KEY REDE CERTRESOLVER PG_SERVICO"

# Lê o que já existe em credenciais.env e gera o que falta, só em memória: o arquivo
# é gravado depois da confirmação (gravar_credenciais), para "N" não deixar rastro.
# shellcheck disable=SC2034 # lidas por nome (${!chave}) e pelas Tasks 6 e 7
gerar() {
  passo 4 "Segredos"
  local chave valor novos=0
  for chave in $SEGREDOS; do
    valor="$(ler_credencial "$CREDENCIAIS" "$chave")"
    if [ -z "$valor" ]; then
      valor="$(gerar_segredo)"
      novos=$((novos + 1))
    fi
    printf -v "$chave" '%s' "$valor"
  done

  echo "Baixando a imagem $IMAGEM..."
  docker pull -q "$IMAGEM" >/dev/null || morrer "Não consegui baixar $IMAGEM."

  VITE_VAPID_PUBLIC_KEY="$(ler_credencial "$CREDENCIAIS" VITE_VAPID_PUBLIC_KEY)"
  VAPID_PRIVATE_KEY="$(ler_credencial "$CREDENCIAIS" VAPID_PRIVATE_KEY)"
  checar_par_vapid "$VITE_VAPID_PUBLIC_KEY" "$VAPID_PRIVATE_KEY"
  if [ -z "$VITE_VAPID_PUBLIC_KEY" ]; then
    # web-push é dependência de produção do app: gera offline, dentro da imagem.
    local par
    par="$(docker run --rm --network none "$IMAGEM" bun -e \
      'const k=require("web-push").generateVAPIDKeys();console.log(k.publicKey);console.log(k.privateKey)')" ||
      morrer "Não consegui gerar as chaves VAPID."
    VITE_VAPID_PUBLIC_KEY="$(printf '%s\n' "$par" | sed -n 1p)"
    VAPID_PRIVATE_KEY="$(printf '%s\n' "$par" | sed -n 2p)"
    [ -n "$VITE_VAPID_PUBLIC_KEY" ] && [ -n "$VAPID_PRIVATE_KEY" ] || morrer "Chaves VAPID vazias."
    novos=$((novos + 2))
  fi

  # URLs derivadas (não gravadas). A do superusuário só vive no contêiner de migração.
  DATABASE_URL="$(url_postgres painel_ro "$PAINEL_RO_PASSWORD" "$PG_HOST" 5432 wakeclub)"
  DATABASE_URL_RW="$(url_postgres painel_rw "$PAINEL_RW_PASSWORD" "$PG_HOST" 5432 wakeclub)"
  DATABASE_URL_MOTOR="$(url_postgres wakecrm_motor "$WAKECRM_MOTOR_PASSWORD" "$PG_HOST" 5432 wakeclub)"
  ADMIN_DATABASE_URL="$(url_postgres "$PG_USUARIO" "$PG_SENHA" "$PG_HOST" 5432 wakeclub)"

  if [ "$novos" -gt 0 ]; then ok "$novos segredo(s) novo(s); os existentes ficam como estão"; else
    ok "todos os segredos reaproveitados de $CREDENCIAIS"
  fi
}

# Migrações pendentes, só leitura. Saída vazia = nada pendente; erro = para.
listar_pendentes() {
  local env n
  checar_banco
  env="$(arquivo_env ADMIN_DATABASE_URL)"
  PENDENTES="$(rodar_no_app "$env" bun scripts/migrar.mjs --pendentes)" ||
    morrer "Não consegui listar as migrações pendentes (o banco wakeclub existe em $PG_SERVICO?). Nada foi alterado."
  rm -f "$env"
  # Pré-checagem do runbook: nenhum follow-up no meio de um envio antes de migrar.
  [ -n "$PENDENTES" ] || return 0
  n="$(sql_pg "select to_regclass('wakeclub.followups') is not null")" ||
    morrer "Não consegui consultar o banco wakeclub. Nada foi alterado."
  [ "$n" = t ] || return 0
  n="$(sql_pg "select count(*) from wakeclub.followups where status = 'enviando'")" ||
    morrer "Não consegui consultar wakeclub.followups. Nada foi alterado."
  [ "$n" = 0 ] ||
    morrer "Há $n follow-up(s) com status 'enviando'. Espere o envio terminar (ou resolva à mão) e rode de novo. Nada foi alterado."
}

confirmar() {
  passo 5 "Resumo"
  listar_pendentes
  local chave
  cat <<EOF

  Postgres        $PG_SERVICO (Postgres $PG_MAJOR, usuário $PG_USUARIO, senha $PG_SENHA_ORIGEM)
  Traefik         $TRAEFIK_SERVICO, certresolver $CERTRESOLVER
  Rede            $REDE
  Evolution       ${EVO_SERVICO:-não encontrada} ${EVOLUTION_URL:+($EVOLUTION_URL)}
  Chave Evolution $(mascarar "$EVOLUTION_API_KEY")
  Portainer       ${PORTAINER_SERVICO:-não encontrado}
  Domínio         https://$DOMINIO
  Instância       $EVOLUTION_INSTANCIA
  Credenciais     $CREDENCIAIS
EOF
  for chave in $SEGREDOS VITE_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY; do
    printf '  %-26s %s\n' "$chave" "$(mascarar "${!chave}")"
  done
  echo
  if [ -n "$PENDENTES" ]; then
    echo "  Migrações pendentes:"
    printf '%s\n' "$PENDENTES" | sed 's/^/    - /'
    echo "  Backup: sim, antes de migrar (volta automática se algo falhar)."
    printf '%s\n' "$PENDENTES" | grep -q '^0003_' &&
      aviso "A 0003 é o corte destrutivo da virada (follow-ups antigos do n8n saem)."
  else
    echo "  Migrações pendentes: nenhuma. Backup: não (nada muda no schema)."
  fi
  aviso "As senhas das roles painel_ro e painel_rw serão redefinidas para as de $CREDENCIAIS."
  echo

  local resp
  if [ -n "$SIM" ]; then resp=s; else perguntar resp "Continuar? [s/N]" ""; fi
  case "$resp" in
    s | S | sim | Sim | SIM) ;;
    *)
      echo "Cancelado. Nada foi alterado."
      exit 0
      ;;
  esac
}

gravar_credenciais() {
  local chave
  (umask 077 && mkdir -p "$DIR_WAKECRM")
  chmod 700 "$DIR_WAKECRM"
  for chave in $SEGREDOS VITE_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY; do
    garantir_credencial "$CREDENCIAIS" "$chave" "${!chave}"
  done
  for chave in $DECIDIDOS; do
    definir_credencial "$CREDENCIAIS" "$chave" "${!chave}"
  done
  chmod 600 "$CREDENCIAIS"
  ok "credenciais em $CREDENCIAIS"
}

# Banco: com migração pendente, para o CRM, faz backup, migra e, se algo falhar,
# restaura. Sem pendente, só reaplica roles e views (nada destrutivo, sem backup).
banco() {
  passo 6 "Banco"
  BACKUP=""
  REPLICAS_ANTES=""
  if [ -n "$PENDENTES" ]; then
    parar_app
    if ! fazer_backup; then
      religar_app
      morrer "Sem backup não migro. O banco não foi alterado."
    fi
  fi
  # Com backup, uma interrupção daqui até o fim de aplicar_banco restaura (ao_sair).
  [ -z "$BACKUP" ] || MIGRANDO=1
  if aplicar_banco; then
    MIGRANDO=""
    ok "banco migrado, roles e views aplicadas"
    return 0
  fi
  MIGRANDO=""
  [ -n "$BACKUP" ] || morrer "Falhou ao aplicar roles e views. Nenhuma migração rodou; nada a restaurar."
  if restaurar "$BACKUP"; then
    religar_app
    morrer "A migração falhou (mensagem acima); banco restaurado do backup $BACKUP."
  fi
  morrer "A migração falhou e a restauração também. O CRM fica parado; restaure com o comando acima."
}

# Admin do CRM: cria o primeiro, ou oferece redefinir a senha de um existente.
# A senha só vai por env-file ao contêiner, nunca por argumento nem para a tela.
admin() {
  passo 7 "Admin do CRM"
  local env lista novo="" s2
  env="$(arquivo_env ADMIN_DATABASE_URL)"
  lista="$(rodar_no_app "$env" bun scripts/admin-crm.mjs listar)" || morrer "Não consegui listar os admins do CRM."
  rm -f "$env"
  [ -n "$lista" ] || novo=1

  if [ -n "$SIM" ]; then
    if [ -z "${WAKECRM_ADMIN_USUARIO:-}" ] || [ -z "${WAKECRM_ADMIN_SENHA:-}" ]; then
      [ -z "$novo" ] || morrer "Não há admin no CRM: defina WAKECRM_ADMIN_USUARIO e WAKECRM_ADMIN_SENHA."
      aviso "Admins existentes mantidos (sem WAKECRM_ADMIN_USUARIO)."
      return 0
    fi
    ADMIN_USUARIO="$WAKECRM_ADMIN_USUARIO"
    ADMIN_SENHA="$WAKECRM_ADMIN_SENHA"
    ADMIN_NOME="${WAKECRM_ADMIN_NOME:-$(nome_admin "$lista" "$ADMIN_USUARIO")}"
    ADMIN_NOME="${ADMIN_NOME:-$ADMIN_USUARIO}"
    definir_admin || morrer "Não consegui definir o admin $ADMIN_USUARIO."
    ADMIN_SENHA=""
    return 0
  fi

  if [ -z "$novo" ]; then
    echo "Admins ativos:"
    printf '%s\n' "$lista" | awk -F '\t' '{ printf "  %s (%s)\n", $1, $2 }'
    while :; do
      perguntar ADMIN_USUARIO "Redefinir a senha de algum? [usuário/Enter pula]" ""
      if pula_resposta "$ADMIN_USUARIO"; then return 0; fi
      ADMIN_NOME="$(nome_admin "$lista" "$ADMIN_USUARIO")"
      [ -n "$ADMIN_NOME" ] && break
      aviso "\"$ADMIN_USUARIO\" não está na lista."
    done
  else
    aviso "Não há admin no CRM; vamos criar o primeiro."
  fi
  while :; do
    if [ -n "$novo" ]; then
      perguntar ADMIN_NOME "Nome do admin" "${ADMIN_NOME:-}"
      perguntar ADMIN_USUARIO "Usuário (3+ caracteres, minúsculas, sem espaços)" "${ADMIN_USUARIO:-}"
    fi
    perguntar ADMIN_SENHA "Senha de $ADMIN_USUARIO (8+ caracteres)" "" -s
    perguntar s2 "Repita a senha" "" -s
    if [ "$ADMIN_SENHA" != "$s2" ]; then
      aviso "As senhas não conferem."
      continue
    fi
    definir_admin && break
    aviso "Tente de novo."
  done
  ADMIN_SENHA=""
}

main() {
  precondicoes
  detectar
  perguntas
  gerar
  confirmar
  gravar_credenciais
  banco
  admin
  # Task 7 religa o CRM (REPLICAS_ANTES) e mostra BACKUP no resumo.
  # Task 7: publicar a stack, conferir /login e o webhook, resumo final.
}

# Permite `. instalar.sh` em teste sem rodar nada.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
