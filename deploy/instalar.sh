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
#   WAKECRM_PORTAINER_USUARIO, WAKECRM_PORTAINER_SENHA
#                                       credencial do Portainer com WAKECRM_SIM=1 (sem ela: docker stack deploy);
#                                       não vale quando o Orion deixou dados_portainer
#   WAKECRM_MOTOR_ATIVO                 com WAKECRM_SIM=1: 1 liga o motor, vazio desliga; sem ela, fica
#   WAKECRM_ORION_DIR                   pasta dos dados do SetupOrion (padrão /root/dados_vps)
#   WAKECRM_FALHAR_MIGRACAO=NNNN        só teste: aplica até a anterior e falha (exercita a volta)
#   WAKECRM_PERMITIR_NAO_ROOT=1         só teste: roda sem root (Swarm local no Mac)
#   WAKECRM_CURL_INSECURE=1             só teste: aceita o certificado padrão do Traefik (curl -k)
set -euo pipefail

IMAGEM="${WAKECRM_IMAGEM:-ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest}"
DIR_WAKECRM="${WAKECRM_DIR:-/root/wakecrm}"
CREDENCIAIS="$DIR_WAKECRM/credenciais.env"
DIR_BACKUPS="$DIR_WAKECRM/backups"
SERVICO_APP="wakecrm_wakecrm"
SIM="${WAKECRM_SIM:-}"
# Arquivos de texto que o SetupOrion grava com o que instalou (só dados_vps, dados_postgres,
# dados_evolution e dados_portainer; nunca dados_evolution_go).
ORION_DIR="${WAKECRM_ORION_DIR:-/root/dados_vps}"
ORION_USADOS=""
PORTAINER_DOMINIO=""
PORTAINER_TOKEN=""
PORTAINER_USUARIO=""
PORTAINER_SENHA=""

# Tudo que é temporário (inclusive arquivos com segredo) mora aqui e sai no fim.
TMP="$(mktemp -d)"
chmod 700 "$TMP"
MIGRANDO=""
# 1 depois de um banco migrado com o CRM escalado a 0, até a stack sair publicada.
CRM_PARADO=""
ATUALIZADO_ANTES=""
ESTADO_UPDATE=""

# aviso_crm_parado: saída com erro entre a migração e a publicação deixa o CRM em 0.
# Não religa sozinho: a imagem antiga pode não bater com o schema novo.
aviso_crm_parado() {
  falha "O CRM está parado (0 réplicas): $SERVICO_APP foi escalado para 0 antes de migrar."
  echo "  O banco já está migrado. Para sair daqui:"
  echo "  - rode o instalador de novo (publica a imagem nova), ou"
  echo "  - docker service scale $SERVICO_APP=$REPLICAS_ANTES (volta a imagem antiga, que pode não funcionar com o schema novo)."
}

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
  if [ "$rc" != 0 ] && [ -n "$CRM_PARADO" ]; then aviso_crm_parado; fi
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

# padrao_postgres HOST_ORION SALVO CANDIDATO...: sugestão do menu de Postgres. Vence o salvo,
# se for candidato (escolha confirmada antes não muda pela dica do Orion, como a REDE); depois
# o serviço do Host do Orion (nome igual, HOST_HOST ou terminado em _HOST, nessa ordem, por
# comparação literal); senão o primeiro. Sem candidatos: o salvo, senão o Host do Orion.
padrao_postgres() {
  local h="$1" s="$2" c
  shift 2
  if [ $# -eq 0 ]; then
    printf '%s\n' "${s:-$h}"
    return 0
  fi
  if [ -n "$s" ]; then
    for c in "$@"; do if [ "$c" = "$s" ]; then printf '%s\n' "$c"; return 0; fi; done
  fi
  if [ -n "$h" ]; then
    for c in "$@"; do if [ "$c" = "$h" ]; then printf '%s\n' "$c"; return 0; fi; done
    for c in "$@"; do if [ "$c" = "${h}_$h" ]; then printf '%s\n' "$c"; return 0; fi; done
    for c in "$@"; do case "$c" in *"_$h") printf '%s\n' "$c"; return 0 ;; esac; done
  fi
  printf '%s\n' "$1"
}

servico_existe() { docker service inspect "$1" >/dev/null 2>&1; }

# entrypoint_https TEXTO: nome do entrypoint do Traefik na porta 443
# (--entrypoints.NOME.address=:443, em argumento ou label); vazio se não houver.
entrypoint_https() {
  printf '%s\n' "$1" | grep -Eio 'entrypoints\.[a-z0-9_-]+\.address=[^ ]*:443([^0-9]|$)' | head -n1 |
    sed -E 's/^[^.]*\.([^.]+)\..*/\1/' || true
}

# valor_seguro_stack VALOR: 1 se tiver ", \ ou quebra de linha (quebraria o valor entre
# aspas duplas no arquivo da stack, e isso só apareceria depois da migração).
valor_seguro_stack() {
  case "$1" in *'"'* | *\\* | *$'\n'* | *$'\r'*) return 1 ;; esac
}

# exigir_valor_seguro VAR ROTULO [-s]: pede de novo enquanto o valor não servir na stack;
# com WAKECRM_SIM para (antes da confirmação, nada foi alterado).
exigir_valor_seguro() {
  while ! valor_seguro_stack "${!1}"; do
    aviso "$2 tem \", \\ ou quebra de linha e quebraria o arquivo da stack."
    [ -z "$SIM" ] || morrer "$2 inválido para a stack. Nada foi alterado."
    perguntar "$1" "$2 (sem \" nem \\; Enter deixa vazio)" "" "${3:-}"
  done
}

# url_evolution_ok URL: 1 se terminar em /manager (o painel da Evolution, não a base da API).
url_evolution_ok() {
  case "$1" in */manager | */manager/) return 1 ;; esac
}

# exigir_url_evolution: EVOLUTION_URL que sirva na stack e seja a base da API; com WAKECRM_SIM para.
exigir_url_evolution() {
  while :; do
    exigir_valor_seguro EVOLUTION_URL "URL interna da Evolution"
    url_evolution_ok "$EVOLUTION_URL" && return 0
    aviso "EVOLUTION_URL ($EVOLUTION_URL) termina em /manager: esse é o painel da Evolution, não a base da API. Use a base, ex.: http://evolution_evolution_api:8080."
    [ -z "$SIM" ] || morrer "EVOLUTION_URL aponta para o painel (/manager). Nada foi alterado."
    perguntar EVOLUTION_URL "URL interna da Evolution (base da API, sem /manager)" ""
  done
}

# Chaves que o dono pode ter mudado no Portainer (stack no ar). ENV_VIVO tem o Env do serviço
# do CRM (vazio sem serviço): só para variável, nunca imprimir.
CHAVES_PRESERVADAS="EVOLUTION_URL EVOLUTION_API_KEY OPENAI_API_KEY OPENAI_MODELO_TRANSCRICAO"
ENV_VIVO=""

# adotar_da_stack CHAVE: CHAVE vazia aqui (nada salvo nem detectado) recebe o valor da stack no ar.
adotar_da_stack() {
  local __a_v
  __a_v="$(valor_env_servico "$ENV_VIVO" "$1")"
  if [ -z "${!1}" ] && [ -n "$__a_v" ]; then
    printf -v "$1" '%s' "$__a_v"
    printf -v "${1}_ORIGEM" '%s' "lida da stack no ar"
  fi
}

# conflitos_stack: chaves de CHAVES_PRESERVADAS cujo valor na stack no ar existe e difere do atual.
conflitos_stack() {
  local c v
  for c in $CHAVES_PRESERVADAS; do
    v="$(valor_env_servico "$ENV_VIVO" "$c")"
    if [ -n "$v" ] && [ "$v" != "${!c}" ]; then printf '%s\n' "$c"; fi
  done
}

# decidir_motor: MOTOR_ATIVO da stack no ar quando ela tem a chave (ligar e desligar no Portainer
# vale); sem stack, o salvo; senão vazio (desligado).
decidir_motor() {
  if printf '%s\n' "$ENV_VIVO" | grep -q '^MOTOR_ATIVO='; then
    MOTOR_ATIVO="$(valor_env_servico "$ENV_VIVO" MOTOR_ATIVO)"
    MOTOR_ATIVO_ORIGEM="da stack no ar"
  else
    MOTOR_ATIVO="$(ler_credencial "$CREDENCIAIS" MOTOR_ATIVO)"
    MOTOR_ATIVO_ORIGEM="salvo"
  fi
}

# adaptador_completo: o motor só lê e envia pela Evolution com URL, chave e instância.
adaptador_completo() {
  [ -n "$EVOLUTION_URL" ] && [ -n "$EVOLUTION_API_KEY" ] && [ -n "$EVOLUTION_INSTANCIA" ]
}

# env_servico SERVICO: linhas CHAVE=valor do serviço. Só para variável, nunca imprimir.
env_servico() {
  docker service inspect --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' "$1"
}

imagem_servico() {
  docker service inspect --format '{{.Spec.TaskTemplate.ContainerSpec.Image}}' "$1"
}

# redes_servico SERVICO: nomes das redes, uma por linha.
# Erro do Docker => código 1 (o `for` sobre $(...) engoliria a falha).
redes_servico() {
  local ids id
  ids="$(docker service inspect --format '{{range .Spec.TaskTemplate.Networks}}{{.Target}} {{end}}' "$1")" || return 1
  for id in $ids; do
    docker network inspect --format '{{.Name}}' "$id" || return 1
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
  trocar_credencial "$@"
}

# trocar_credencial ARQUIVO CHAVE VALOR: grava exatamente VALOR, inclusive vazio (MOTOR_ATIVO
# desligado na stack não pode voltar a 1 pelo arquivo).
trocar_credencial() {
  if [ -f "$1" ] && grep -q "^$2=" "$1"; then
    [ "$(ler_credencial "$1" "$2")" = "$3" ] && return 0
    (
      umask 077
      grep -v "^$2=" "$1" >"$1.tmp.$$" || true
      mv "$1.tmp.$$" "$1"
    )
  fi
  # Grava mesmo vazio: render_stack exige a chave presente.
  garantir_credencial "$1" "$2" "$3"
}

# ler_orion VAR ARQUIVO ROTULO: VAR recebe o campo ROTULO de ORION_DIR/ARQUIVO (vazio se não houver).
ler_orion() {
  printf -v "$1" '%s' "$(valor_orion "$ORION_DIR/$2" "$3")"
}

# usou_orion ARQUIVO: anota o arquivo do Orion cujo valor foi adotado (para o resumo).
usou_orion() {
  case " $ORION_USADOS " in *" $1 "*) ;; *) ORION_USADOS="${ORION_USADOS:+$ORION_USADOS }$1" ;; esac
}

# dominio_sem_esquema TEXTO: tira http(s):// e tudo a partir da primeira barra.
dominio_sem_esquema() {
  local d="${1#*://}"
  printf '%s\n' "${d%%/*}"
}

# portainer_do_orion: com dados_portainer, a API vai pelo domínio público em HTTPS verificado.
# Preenche PORTAINER_DOMINIO e PORTAINER_TOKEN (preferido) ou, sem token, usuário e senha.
# Sem domínio válido ou sem credencial, deixa tudo vazio (perguntas segue como antes).
portainer_do_orion() {
  local dom
  PORTAINER_DOMINIO="" PORTAINER_TOKEN=""
  ler_orion dom dados_portainer "Dominio do portainer"
  dom="$(dominio_sem_esquema "$dom")"
  [ -n "$dom" ] || return 0
  if ! [[ "$dom" =~ ^[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
    aviso "Domínio do Portainer em $ORION_DIR/dados_portainer inválido; ignoro o arquivo."
    return 0
  fi
  ler_orion PORTAINER_TOKEN dados_portainer Token
  if [ -z "$PORTAINER_TOKEN" ]; then
    ler_orion PORTAINER_USUARIO dados_portainer Usuario
    ler_orion PORTAINER_SENHA dados_portainer Senha
    if [ -z "$PORTAINER_USUARIO" ] || [ -z "$PORTAINER_SENHA" ]; then
      aviso "$ORION_DIR/dados_portainer sem token nem usuário e senha; ignoro o arquivo."
      PORTAINER_USUARIO="" PORTAINER_SENHA=""
      return 0
    fi
  fi
  PORTAINER_DOMINIO="$dom"
  usou_orion dados_portainer
  ok "Portainer do Orion: https://$dom ($(if [ -n "$PORTAINER_TOKEN" ]; then echo token; else echo "usuário $PORTAINER_USUARIO"; fi))"
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

# Os contêineres temporários (migração, backup, admin) não entram na REDE: ela pode não ser
# attachable (NovaNet do Orion). Entram na rede do contêiner do Postgres neste nó
# (--network container:ID) e falam com o banco em 127.0.0.1. Só o CRM, serviço do Swarm,
# fica na REDE e usa PG_HOST (o nome do serviço).
PG_HOST_JOB=127.0.0.1

# container_pg: id do contêiner running da tarefa do Postgres neste nó; vazio se não houver.
# Erro do daemon => código != 0 (pipefail).
# shortcut: com mais de uma tarefa running neste nó (atualização em curso), pega qualquer uma;
# basta no Orion de nó único. Se o Postgres tiver réplicas no mesmo nó, escolher pela mais nova.
container_pg() {
  docker ps -q -f "label=com.docker.swarm.service.name=$PG_SERVICO" -f status=running | head -n1
}

# rede_job: valor de --network dos contêineres temporários. Procura o contêiner a cada uso
# (a tarefa do Postgres pode ter reiniciado); sem contêiner neste nó => ✗ e código 1.
rede_job() {
  local id
  id="$(container_pg)" || id=""
  if [ -z "$id" ]; then
    falha "Nenhum contêiner do Postgres ($PG_SERVICO) rodando neste nó: o instalador precisa rodar no nó do Postgres." >&2
    return 1
  fi
  printf 'container:%s\n' "$id"
}

# rodar_no_app ENVFILE CMD...: contêiner temporário da imagem do app na rede do Postgres.
rodar_no_app() {
  local env="$1" rede
  shift
  rede="$(rede_job)" || return 1
  docker run --rm --network "$rede" --env-file "$env" "$IMAGEM" "$@"
}

# rodar_no_pg ENVFILE CMD...: contêiner temporário postgres:PG_MAJOR (mesma versão do
# servidor, para pg_dump/pg_restore) na rede do Postgres, com DIR_BACKUPS em /backups.
rodar_no_pg() {
  local env="$1" rede
  shift
  rede="$(rede_job)" || return 1
  (umask 077 && mkdir -p "$DIR_BACKUPS")
  docker run --rm --network "$rede" --env-file "$env" -v "$DIR_BACKUPS:/backups" \
    "postgres:${PG_MAJOR}" "$@"
}

# derivar_urls: URLs do banco, só em memória. As da stack (DATABASE_URL, DATABASE_URL_RW,
# DATABASE_URL_MOTOR) usam PG_HOST, porque o CRM está na REDE; as dos contêineres temporários
# (DATABASE_URL_JOB, DATABASE_URL_RW_JOB e ADMIN_DATABASE_URL, que só vive neles) usam PG_HOST_JOB.
# shellcheck disable=SC2034 # lidas por nome em arquivo_env
derivar_urls() {
  DATABASE_URL="$(url_postgres painel_ro "$PAINEL_RO_PASSWORD" "$PG_HOST" 5432 wakeclub)"
  DATABASE_URL_RW="$(url_postgres painel_rw "$PAINEL_RW_PASSWORD" "$PG_HOST" 5432 wakeclub)"
  DATABASE_URL_MOTOR="$(url_postgres wakecrm_motor "$WAKECRM_MOTOR_PASSWORD" "$PG_HOST" 5432 wakeclub)"
  DATABASE_URL_JOB="$(url_postgres painel_ro "$PAINEL_RO_PASSWORD" "$PG_HOST_JOB" 5432 wakeclub)"
  DATABASE_URL_RW_JOB="$(url_postgres painel_rw "$PAINEL_RW_PASSWORD" "$PG_HOST_JOB" 5432 wakeclub)"
  ADMIN_DATABASE_URL="$(url_postgres "$PG_USUARIO" "$PG_SENHA" "$PG_HOST_JOB" 5432 wakeclub)"
}

# env_pg [BANCO]: arquivo de ambiente libpq do superusuário (padrão: banco wakeclub).
env_pg() {
  # shellcheck disable=SC2034 # lidas por nome em arquivo_env
  local PGHOST="$PG_HOST_JOB" PGUSER="$PG_USUARIO" PGPASSWORD="$PG_SENHA" PGDATABASE="${1:-wakeclub}" \
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
    morrer "Não consegui conectar ao Postgres em 127.0.0.1 (rede do contêiner $PG_SERVICO) com o usuário $PG_USUARIO. Confira se o Postgres escuta em localhost (listen_addresses) e se o pg_hba.conf aceita 127.0.0.1. Nada foi alterado."
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
# O contêiner do Postgres é procurado quando o comando roda (a tarefa pode ter reiniciado).
comando_restaurar() {
  printf '%s\n' "docker run --rm -it --network container:\$(docker ps -q -f label=com.docker.swarm.service.name=$PG_SERVICO -f status=running | head -n1) -v $DIR_BACKUPS:/backups -e PGHOST=$PG_HOST_JOB -e PGUSER=$PG_USUARIO postgres:$PG_MAJOR sh -c '$SCRIPT_RESTAURAR' sh /backups/${2##*/} /backups/${1##*/}"
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
  # As URLs do painel dentro do contêiner são as de 127.0.0.1, não as da stack.
  # shellcheck disable=SC2034 # lidas por nome em arquivo_env
  local env DATABASE_URL="$DATABASE_URL_JOB" DATABASE_URL_RW="$DATABASE_URL_RW_JOB"
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

# texto_publicacao: como a stack sai, para o resumo (sem segredo).
texto_publicacao() {
  if [ -n "$PORTAINER_DOMINIO" ] && [ -n "$PORTAINER_TOKEN" ]; then
    echo "API do Portainer em https://$PORTAINER_DOMINIO (token do Orion)"
  elif [ -n "$PORTAINER_DOMINIO" ]; then
    echo "API do Portainer em https://$PORTAINER_DOMINIO (usuário $PORTAINER_USUARIO, do Orion)"
  elif [ -n "$PORTAINER_USUARIO" ]; then
    echo "API do Portainer (usuário $PORTAINER_USUARIO)"
  else
    echo "docker stack deploy"
  fi
}

mascarar() {
  if [ -z "$1" ]; then echo "(vazio)"; else echo "•••••••• (${#1} caracteres)"; fi
}

# Chaves do ambiente do app na stack. Nunca ADMIN_DATABASE_URL nem a senha do superusuário.
CHAVES_STACK="IMAGEM DOMINIO REDE CERTRESOLVER ENTRYPOINT DATABASE_URL DATABASE_URL_RW DATABASE_URL_MOTOR VITE_VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY PUSH_DISPATCH_SECRET WEBHOOK_EVOLUTION_SECRET WEBHOOK_VENDAS_SECRET EVOLUTION_INSTANCIA EVOLUTION_URL EVOLUTION_API_KEY OPENAI_API_KEY OPENAI_MODELO_TRANSCRICAO MOTOR_ATIVO"

# stack_publicavel MODELO ENV: render_stack com cada $ dobrado, porque docker stack deploy
# (e o Portainer) interpolam $VAR no arquivo; o modelo já preenchido não tem outro $.
stack_publicavel() {
  render_stack "$1" "$2" | sed 's/\$/$$/g'
}

# json_texto: stdin vira uma string JSON entre aspas (escapa \, ", tab, CR e quebra de linha).
# shortcut: outros caracteres de controle passam crus; a API recusa e cai no docker stack deploy.
json_texto() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e "s/$(printf '\t')/\\\\t/g" -e "s/$(printf '\r')/\\\\r/g" |
    awk 'BEGIN { printf "\"" } { printf "%s%s", (NR > 1 ? "\\n" : ""), $0 } END { printf "\"" }'
}

# Leitura mínima das respostas da API do Portainer (JSON compacto, sem jq). Os campos saem
# na ordem das structs do Portainer: o objeto de endpoint e o de stack começam por "Id",
# e na stack "Name" vem logo depois.
jwt_portainer() { printf '%s\n' "$1" | sed -n 's/.*"jwt": *"\([^"]*\)".*/\1/p' | head -n1; }
# ids_endpoints_docker JSON: Id dos endpoints Docker (Type 1 local, 2 agente, 4 edge), um por linha.
# shortcut: Name com aspas escapadas não casa; o endpoint some da lista e cai no docker stack deploy.
ids_endpoints_docker() {
  printf '%s\n' "$1" | grep -o '"Id": *[0-9][0-9]*, *"Name": *"[^"]*", *"Type": *[124][,}]' |
    sed 's/^"Id": *\([0-9]*\).*/\1/' || true
}
# id_swarm_json: stdin é a resposta de /docker/swarm; imprime o ID do cluster (primeiro "ID").
id_swarm_json() { grep -o '"ID": *"[^"]*"' | head -n1 | sed 's/^"ID": *"\(.*\)"$/\1/' || true; }
# endpoint_por_swarm SWARM PARES: PARES tem "id swarmID" por linha; imprime o id cujo swarmID é SWARM.
endpoint_por_swarm() {
  [ -n "$1" ] || return 0
  printf '%s\n' "$2" | awk -v s="$1" '$2 == s { print $1; exit }'
}
id_stack() { # JSON NOME
  printf '%s\n' "$1" | grep -o "\"Id\": *[0-9][0-9]*, *\"Name\": *\"$2\"" | head -n1 |
    sed 's/^"Id": *\([0-9]*\).*/\1/' || true
}

# texto_config: stdin vira uma string entre aspas do arquivo de config do curl (escapa \ e ").
texto_config() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk 'BEGIN { printf "\"" } { printf "%s", $0 } END { printf "\"" }'
}

# base_portainer RC: código do curl na 9443. Só recusa (7), timeout (28) ou nome que não
# resolve (6) contam como "não responde" e caem no HTTP da 9000; o resto fica no HTTPS.
base_portainer() {
  case "$1" in
    6 | 7 | 28) printf 'http://%s:9000\n' "$PORTAINER_SERVICO" ;;
    *) printf 'https://%s:9443\n' "$PORTAINER_SERVICO" ;;
  esac
}

# config_portainer METODO CAMINHO [CORPO]: config do curl para uma chamada à API do Portainer
# em PORTAINER_BASE. Token e corpo moram aqui dentro, nunca em argumento.
config_portainer() {
  printf 'url = "%s%s"\nrequest = "%s"\n' "$PORTAINER_BASE" "$2" "$1"
  # O certificado do Portainer na 9443 é autoassinado; o domínio público do Orion tem
  # certificado de verdade e é verificado.
  if [ -z "${PORTAINER_DOMINIO:-}" ]; then case "$PORTAINER_BASE" in https:*) printf 'insecure\n' ;; esac; fi
  printf 'fail\nsilent\nshow-error\nconnect-timeout = 10\nmax-time = %s\nheader = "Content-Type: application/json"\n' "${PORTAINER_MAX_TIME:-300}"
  if [ -n "${PORTAINER_TOKEN:-}" ]; then
    printf 'header = %s\n' "$(printf 'X-API-Key: %s' "$PORTAINER_TOKEN" | texto_config)"
  elif [ -n "${PORTAINER_JWT:-}" ]; then
    printf 'header = "Authorization: Bearer %s"\n' "$PORTAINER_JWT"
  fi
  if [ -n "${3:-}" ]; then printf 'data-binary = %s\n' "$(printf '%s' "$3" | texto_config)"; fi
}

# portainer_api METODO CAMINHO [CORPO]: config sempre pelo stdin (curl -K -), nunca em argumento.
# Pelo domínio público do Orion, o curl roda no próprio servidor. Senão, sai de um contêiner
# curlimages/curl na REDE (só com REDE attachable; perguntas garante); a saída tem token e Env
# de outras stacks: sem log do Docker.
portainer_api() {
  if [ -n "${PORTAINER_DOMINIO:-}" ]; then
    config_portainer "$@" | curl -K -
  else
    config_portainer "$@" | docker run --rm -i --log-driver none --network "$REDE" curlimages/curl:8.11.1 -K -
  fi
}

# endpoint_do_swarm SWARM: id do endpoint Docker do Portainer que é este Swarm (o "ID" de
# /api/endpoints/{id}/docker/swarm igual ao do cluster local); vazio se nenhum for. A lista
# de endpoints falhar (credencial recusada, sem conexão) => código 1. Cada sonda tem 15 s:
# um endpoint fora do ar não segura o instalador.
endpoint_do_swarm() {
  local resp id pares=""
  resp="$(portainer_api GET /api/endpoints)" || return 1
  for id in $(ids_endpoints_docker "$resp"); do
    pares="$pares$id $(PORTAINER_MAX_TIME=15 portainer_api GET "/api/endpoints/$id/docker/swarm" 2>/dev/null | id_swarm_json)"$'\n'
  done
  endpoint_por_swarm "$1" "$pares"
}

# aviso_api_portainer: a API não aceitou a credencial ou não respondeu; diz de onde ela veio.
aviso_api_portainer() {
  if [ -n "$PORTAINER_DOMINIO" ]; then
    aviso "O Portainer em $PORTAINER_BASE recusou $(if [ -n "$PORTAINER_TOKEN" ]; then echo o token; else echo "usuário e senha"; fi) de $ORION_DIR/dados_portainer ou não respondeu (erro do curl acima)."
  else
    aviso "O Portainer em $PORTAINER_BASE recusou o usuário e a senha digitados ou não respondeu (erro do curl acima)."
  fi
}

# publicar_portainer: cria ou atualiza (pullImage) a stack wakecrm pela API. Falha => 1.
publicar_portainer() {
  local corpo resp endpoint swarm id conteudo rc=0
  if [ -n "$PORTAINER_DOMINIO" ]; then
    PORTAINER_BASE="https://$PORTAINER_DOMINIO"
    ok "Portainer por $PORTAINER_BASE (dados do Orion)"
  else
    PORTAINER_BASE="https://$PORTAINER_SERVICO:9443"
    portainer_api GET /api/system/status >/dev/null 2>&1 || rc=$?
    PORTAINER_BASE="$(base_portainer "$rc")"
    case "$PORTAINER_BASE" in
      https:*) ok "Portainer por HTTPS ($PORTAINER_BASE)" ;;
      *) aviso "O Portainer não respondeu na 9443; uso $PORTAINER_BASE (senha sem criptografia na rede overlay)." ;;
    esac
  fi
  # Com o token do Orion (header X-API-Key), não há login.
  if [ -z "$PORTAINER_TOKEN" ]; then
    corpo="{\"username\":$(printf '%s' "$PORTAINER_USUARIO" | json_texto),\"password\":$(printf '%s' "$PORTAINER_SENHA" | json_texto)}"
    resp="$(portainer_api POST /api/auth "$corpo")" || {
      aviso_api_portainer
      return 1
    }
    PORTAINER_JWT="$(jwt_portainer "$resp")"
    [ -n "$PORTAINER_JWT" ] || return 1
  fi
  swarm="$(docker info --format '{{.Swarm.Cluster.ID}}')" || return 1
  if ! endpoint="$(endpoint_do_swarm "$swarm")"; then
    aviso_api_portainer
    return 1
  fi
  if [ -z "$endpoint" ]; then
    aviso "Nenhum endpoint Docker do Portainer é este Swarm ($swarm)."
    return 1
  fi
  resp="$(portainer_api GET /api/stacks)" || return 1
  id="$(id_stack "$resp" wakecrm)"
  conteudo="$(json_texto <"$STACK")"
  if [ -n "$id" ]; then
    portainer_api PUT "/api/stacks/$id?endpointId=$endpoint" \
      "{\"stackFileContent\":$conteudo,\"env\":[],\"prune\":false,\"pullImage\":true}" >/dev/null || return 1
    ok "stack wakecrm atualizada pelo Portainer"
  else
    portainer_api POST "/api/stacks/create/swarm/string?endpointId=$endpoint" \
      "{\"name\":\"wakecrm\",\"swarmID\":\"$swarm\",\"stackFileContent\":$conteudo,\"env\":[]}" >/dev/null || return 1
    ok "stack wakecrm criada pelo Portainer"
  fi
}

# update_falhou ESTADO: 0 se o Swarm pausou ou voltou a atualização.
update_falhou() {
  case "$1" in paused | rollback_*) return 0 ;; *) return 1 ;; esac
}

# replica_pronta: 0 quando o serviço já recebeu o deploy (UpdatedAt mudou desde
# ATUALIZADO_ANTES; o Portainer aplica depois de responder), há tarefa running com a imagem
# e o Env atuais e nenhuma atualização em curso (logo depois do deploy a tarefa antiga ainda
# responde). Também 0 se a atualização falhou, para parar de esperar; ESTADO_UPDATE diz qual.
replica_pronta() {
  local esperado id
  [ "$(docker service inspect --format '{{.UpdatedAt}}' "$SERVICO_APP" 2>/dev/null)" != "$ATUALIZADO_ANTES" ] ||
    return 1
  ESTADO_UPDATE="$(docker service inspect --format '{{if .UpdateStatus}}{{.UpdateStatus.State}}{{end}}' "$SERVICO_APP" 2>/dev/null)" ||
    return 1
  if update_falhou "$ESTADO_UPDATE"; then return 0; fi
  [ "$ESTADO_UPDATE" != updating ] || return 1
  # Só imagem e Env (o que o instalador muda): o JSON inteiro da tarefa omite campos do serviço.
  esperado="$(docker service inspect --format '{{.Spec.TaskTemplate.ContainerSpec.Image}} {{json .Spec.TaskTemplate.ContainerSpec.Env}}' "$SERVICO_APP")" || return 1
  for id in $(docker service ps -q --filter desired-state=running "$SERVICO_APP" 2>/dev/null); do
    [ "$(docker inspect --type task --format '{{.Status.State}}' "$id" 2>/dev/null)" = running ] || continue
    [ "$(docker inspect --type task --format '{{.Spec.ContainerSpec.Image}} {{json .Spec.ContainerSpec.Env}}' "$id" 2>/dev/null)" = "$esperado" ] && return 0
  done
  return 1
}

# WAKECRM_CURL_INSECURE só serve ao teste local (certificado padrão do Traefik).
login_ok() {
  [ "$(curl ${WAKECRM_CURL_INSECURE:+"-k"} -s -o /dev/null -w '%{http_code}' --max-time 10 \
    "https://$DOMINIO/login" 2>/dev/null)" = 200 ]
}
codigo_webhook() {
  curl ${WAKECRM_CURL_INSECURE:+"-k"} -s -o /dev/null -w '%{http_code}' --max-time 10 \
    -X POST "https://$DOMINIO/api/webhooks/evolution" 2>/dev/null
}

# ip_servidor: IP para o scp do resumo; placeholder se não der para descobrir.
ip_servidor() {
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || ip=""
  [ -n "$ip" ] || ip="$(curl -4 -fsS --max-time 5 https://ifconfig.me 2>/dev/null)" || ip=""
  if [[ "$ip" =~ ^[0-9A-Fa-f.:]+$ ]]; then printf '%s\n' "$ip"; else echo "<ip-do-servidor>"; fi
}

# texto_resumo IP: resumo final (sem segredo). IPv6 vai entre colchetes no scp.
texto_resumo() {
  local host="$1"
  case "$host" in *:*) host="[$host]" ;; esac
  cat <<FIM
  CRM                https://$DOMINIO
  Webhook Evolution  https://$DOMINIO/api/webhooks/evolution
  Webhook vendas     https://$DOMINIO/api/webhooks/vendas
                     (as URLs com o segredo estão no CRM em Configurações › Webhooks)
  Credenciais        $CREDENCIAIS
FIM
  if [ -n "$BACKUP" ]; then
    printf '  Backup             %s\n' "$BACKUP"
    printf '  Copie o backup para o seu computador (rode lá):\n    scp root@%s:%s .\n' "$host" "$BACKUP"
  else
    echo "  Backup             nenhum (sem migração pendente)"
  fi
  cat <<FIM

  Próximo passo: na Evolution, aponte o webhook da instância $EVOLUTION_INSTANCIA para a URL
  completa do webhook da Evolution (Configurações › Webhooks).
FIM
  if [ "${MOTOR_ATIVO:-}" = 1 ]; then echo "  Motor ligado (MOTOR_ATIVO=1)."; else
    echo "  Motor desligado (MOTOR_ATIVO vazio): ligue no Portainer ou rodando o instalador de novo."
  fi
}

# ---------------------------------------------------------------------------
# Passos
# ---------------------------------------------------------------------------

precondicoes() {
  passo 1 "Pré-condições"
  [ "$(id -u)" -eq 0 ] || [ -n "${WAKECRM_PERMITIR_NAO_ROOT:-}" ] || morrer "Rode como root (sudo -i)."
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

  # Postgres. O serviço manda; o Orion (dados_postgres) só cobre o que ele não diz. Com mais
  # de um serviço, a sugestão é o salvo, depois o do Host do Orion (padrao_postgres); a porta
  # fica 5432 (a do contêiner, que é por onde o instalador e o CRM falam).
  local pg_salvo pg_orion pg_img='^(postgres(:|$)|pgvector/)' pg_nome='postgres|pgvector' pg_c
  local -a pg_cand=()
  pg_salvo="$(ler_credencial "$CREDENCIAIS" PG_SERVICO)"
  ler_orion pg_orion dados_postgres Host
  while IFS= read -r pg_c; do [ -n "$pg_c" ] && pg_cand+=("$pg_c"); done <<<"$(servicos_por "$pg_img" "$pg_nome")"
  detectar_servico PG_SERVICO "Postgres" "$pg_img" "$pg_nome" \
    "$(padrao_postgres "$pg_orion" "$pg_salvo" ${pg_cand[@]+"${pg_cand[@]}"})" sim
  PG_HOST="$PG_SERVICO"
  local env_pg img_pg
  env_pg="$(env_servico "$PG_SERVICO")"
  PG_USUARIO="$(valor_env_servico "$env_pg" POSTGRES_USER)"
  PG_SENHA="$(valor_env_servico "$env_pg" POSTGRES_PASSWORD)"
  PG_SENHA_ORIGEM="lida do serviço"
  if [ -z "$PG_SENHA" ]; then
    ler_orion PG_SENHA dados_postgres Senha
    if [ -n "$PG_SENHA" ]; then
      PG_SENHA_ORIGEM="lida do Orion"
      usou_orion dados_postgres
      # Senha e usuário do Orion andam juntos.
      ler_orion pg_orion dados_postgres Usuario
      PG_USUARIO="${pg_orion:-$PG_USUARIO}"
    fi
  fi
  PG_USUARIO="${PG_USUARIO:-postgres}"
  # O usuário entra na URL do superusuário e no arquivo de ambiente dos contêineres.
  exigir_valor_seguro PG_USUARIO "Usuário do Postgres"
  PG_USUARIO="${PG_USUARIO:-postgres}"
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
  exigir_valor_seguro CERTRESOLVER "Certresolver do Traefik"
  ok "certresolver: $CERTRESOLVER"

  # Entrypoint HTTPS (porta 443) do Traefik; sem achar, o salvo ou websecure (padrão Orion).
  ENTRYPOINT="$(entrypoint_https "$texto_traefik")"
  if [ -z "$ENTRYPOINT" ]; then
    texto_traefik="$(docker service inspect --format \
      '{{range .Spec.TaskTemplate.ContainerSpec.Args}}{{println .}}{{end}}{{range $k, $v := .Spec.Labels}}{{$k}}={{$v}}{{println}}{{end}}' \
      "$TRAEFIK_SERVICO")"
    ENTRYPOINT="$(entrypoint_https "$texto_traefik")"
  fi
  if [ -z "$ENTRYPOINT" ]; then
    ENTRYPOINT="$(ler_credencial "$CREDENCIAIS" ENTRYPOINT)"
    ENTRYPOINT="${ENTRYPOINT:-websecure}"
    aviso "Não achei o entrypoint do Traefik na porta 443; uso \"$ENTRYPOINT\"."
  fi
  exigir_valor_seguro ENTRYPOINT "Entrypoint HTTPS do Traefik"
  [ -n "$ENTRYPOINT" ] || morrer "Entrypoint do Traefik é obrigatório."
  ok "entrypoint HTTPS: $ENTRYPOINT"

  # Rede overlay compartilhada entre Postgres e Traefik (o CRM precisa dos dois). Ambígua:
  # a salva, depois a Rede interna do Orion (dados_vps), senão menu; só vale rede comum aos dois.
  local redes_pg redes_tr r rede_salva rede_orion
  local -a comuns=()
  redes_pg="$(redes_servico "$PG_SERVICO")" ||
    morrer "Não consegui ler as redes do serviço $PG_SERVICO (erro do Docker acima). Nada foi alterado."
  redes_tr="$(redes_servico "$TRAEFIK_SERVICO")" ||
    morrer "Não consegui ler as redes do serviço $TRAEFIK_SERVICO (erro do Docker acima). Nada foi alterado."
  while IFS= read -r r; do
    [ -n "$r" ] && printf '%s\n' "$redes_tr" | grep -qxF "$r" && comuns+=("$r")
  done <<<"$redes_pg"
  rede_salva="$(ler_credencial "$CREDENCIAIS" REDE)"
  ler_orion rede_orion dados_vps "Rede interna"
  if [ "${#comuns[@]}" -eq 0 ]; then
    morrer "Postgres ($PG_SERVICO) e Traefik ($TRAEFIK_SERVICO) não compartilham nenhuma rede."
  elif [ "${#comuns[@]}" -eq 1 ]; then
    REDE="${comuns[0]}"
    REDE_ORIGEM="única comum a Postgres e Traefik"
  elif [ -n "$rede_salva" ] && printf '%s\n' "${comuns[@]}" | grep -qxF "$rede_salva"; then
    REDE="$rede_salva"
    REDE_ORIGEM="salva"
  elif [ -n "$rede_orion" ] && printf '%s\n' "${comuns[@]}" | grep -qxF "$rede_orion"; then
    REDE="$rede_orion"
    REDE_ORIGEM="lida do Orion"
    usou_orion dados_vps
  else
    escolher REDE "Postgres e Traefik compartilham mais de uma rede:" "" "${comuns[@]}"
    REDE_ORIGEM="escolhida"
  fi
  # Attachable só importa para a API do Portainer pela overlay (perguntas); o CRM, serviço do
  # Swarm, entra na REDE de qualquer jeito, e os contêineres temporários vão pela rede do Postgres.
  REDE_ATTACHABLE=""
  if rede_attachable "$(docker network inspect --format '{{.Attachable}}' "$REDE")"; then REDE_ATTACHABLE=1; fi
  ok "rede: $REDE ($(if [ -n "$REDE_ATTACHABLE" ]; then echo attachable; else echo "não attachable"; fi))"
  local pg_cont
  pg_cont="$(container_pg)" || morrer "docker ps falhou ao procurar o contêiner do Postgres (erro do Docker acima). Nada foi alterado."
  [ -n "$pg_cont" ] ||
    morrer "Nenhum contêiner do Postgres ($PG_SERVICO) rodando neste nó. Rode o instalador no nó onde o Postgres roda. Nada foi alterado."
  ok "jobs temporários: rede do contêiner do Postgres (127.0.0.1)"

  # Evolution API 2.3.7 (não Evolution Go)
  detectar_servico EVO_SERVICO "Evolution API" '^(atendai/evolution-api|evoapicloud/evolution-api)' \
    'evolution[_-]?api' "" ""
  # Chave: serviço, depois Global API Key do Orion, depois a salva; só com o serviço pergunta.
  # URL: a interna do serviço; sem serviço, a BaseUrl do Orion, depois a salva.
  EVOLUTION_API_KEY="" EVOLUTION_URL=""
  if [ -n "$EVO_SERVICO" ]; then
    local env_evo porta
    env_evo="$(env_servico "$EVO_SERVICO")"
    porta="$(valor_env_servico "$env_evo" SERVER_PORT)"
    EVOLUTION_URL="http://$EVO_SERVICO:${porta:-8080}"
    EVOLUTION_URL_ORIGEM="detectada no serviço"
    EVOLUTION_API_KEY="$(valor_env_servico "$env_evo" AUTHENTICATION_API_KEY)"
    EVOLUTION_API_KEY_ORIGEM="lida do serviço"
    [ -n "$EVOLUTION_API_KEY" ] || aviso "AUTHENTICATION_API_KEY não está nas variáveis de $EVO_SERVICO."
  else
    ler_orion EVOLUTION_URL dados_evolution BaseUrl
    EVOLUTION_URL_ORIGEM="lida do Orion"
    if [ -n "$EVOLUTION_URL" ]; then
      usou_orion dados_evolution
    else
      EVOLUTION_URL="$(ler_credencial "$CREDENCIAIS" EVOLUTION_URL)"
      EVOLUTION_URL_ORIGEM="salva"
    fi
  fi
  if [ -z "$EVOLUTION_API_KEY" ]; then
    ler_orion EVOLUTION_API_KEY dados_evolution "Global API Key"
    EVOLUTION_API_KEY_ORIGEM="lida do Orion"
    if [ -n "$EVOLUTION_API_KEY" ]; then
      usou_orion dados_evolution
    else
      EVOLUTION_API_KEY="$(ler_credencial "$CREDENCIAIS" EVOLUTION_API_KEY)"
      EVOLUTION_API_KEY_ORIGEM="salva"
      if [ -n "$EVOLUTION_API_KEY" ]; then
        ok "chave da Evolution reaproveitada de $CREDENCIAIS"
      elif [ -n "$EVO_SERVICO" ] && [ -n "$SIM" ]; then
        aviso "Chave da Evolution fica vazia (o adaptador que a usa vem depois)."
      elif [ -n "$EVO_SERVICO" ]; then
        perguntar EVOLUTION_API_KEY "Chave da API da Evolution (AUTHENTICATION_API_KEY, Enter deixa vazia)" "" -s
        EVOLUTION_API_KEY_ORIGEM="digitada"
      fi
    fi
  fi
  if [ -n "$EVO_SERVICO" ]; then
    redes_servico "$EVO_SERVICO" | grep -qxF "$REDE" ||
      aviso "A Evolution não está na rede $REDE: $EVOLUTION_URL pode não ser alcançável pelo CRM."
  elif [ "$EVOLUTION_URL_ORIGEM" = salva ] && [ "$EVOLUTION_API_KEY_ORIGEM" = salva ]; then
    aviso "Sem serviço da Evolution: EVOLUTION_URL e EVOLUTION_API_KEY ficam como estavam."
  fi
  # Stack no ar: o que o dono pôs no Portainer não some no re-render. Vazio aqui adota o de lá;
  # valor diferente vira escolha no resumo (confirmar).
  ENV_VIVO=""
  if servico_existe "$SERVICO_APP"; then
    ENV_VIVO="$(env_servico "$SERVICO_APP")" ||
      morrer "Não consegui ler as variáveis de $SERVICO_APP (erro do Docker acima). Nada foi alterado."
  fi
  OPENAI_API_KEY="$(ler_credencial "$CREDENCIAIS" OPENAI_API_KEY)" OPENAI_API_KEY_ORIGEM="salva"
  OPENAI_MODELO_TRANSCRICAO="$(ler_credencial "$CREDENCIAIS" OPENAI_MODELO_TRANSCRICAO)"
  # shellcheck disable=SC2034 # lida por nome em escolher_conflitos
  OPENAI_MODELO_TRANSCRICAO_ORIGEM="salvo"
  local chave
  for chave in $CHAVES_PRESERVADAS; do adotar_da_stack "$chave"; done
  decidir_motor
  exigir_url_evolution
  exigir_valor_seguro EVOLUTION_API_KEY "Chave da API da Evolution" -s
  exigir_valor_seguro OPENAI_MODELO_TRANSCRICAO "Modelo de transcrição da OpenAI"
  exigir_valor_seguro MOTOR_ATIVO "MOTOR_ATIVO"

  # Portainer: com dados_portainer do Orion, a API vai pelo domínio dele; senão, perguntas
  # pede a credencial e a API vai pelo serviço na overlay.
  detectar_servico PORTAINER_SERVICO "Portainer" '^portainer/portainer' 'portainer' "" ""
  portainer_do_orion
  [ -n "$PORTAINER_SERVICO" ] || [ -n "$PORTAINER_DOMINIO" ] || aviso "Sem Portainer: a stack sai por docker stack deploy."
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
  exigir_valor_seguro EVOLUTION_INSTANCIA "Instância da Evolution"
  ok "instância: $EVOLUTION_INSTANCIA"

  # OpenAI: sem chave salva nem na stack no ar, pergunta (Enter pula); com WAKECRM_SIM, fica vazia.
  if [ -z "$OPENAI_API_KEY" ] && [ -z "$SIM" ]; then
    echo "Sem OPENAI_API_KEY, transcrição e IA ficam ociosas (o resto do motor funciona); com ela, cada uso da OpenAI tem custo." >&2
    perguntar OPENAI_API_KEY "Chave da OpenAI (OPENAI_API_KEY, Enter pula)" "" -s
    OPENAI_API_KEY_ORIGEM="digitada"
  fi
  exigir_valor_seguro OPENAI_API_KEY "Chave da OpenAI" -s

  # Portainer: com credencial, a stack sai pela API (controle total no Portainer). Com os
  # dados do Orion (detectar), não pergunta nada.
  [ -z "$PORTAINER_DOMINIO" ] || return 0
  # Sem domínio, a API vai de um contêiner na REDE, que precisa ser attachable.
  if [ -n "$PORTAINER_SERVICO" ] && [ -z "$REDE_ATTACHABLE" ]; then
    aviso "A rede $REDE não é attachable e o Portainer não tem domínio em $ORION_DIR/dados_portainer: a stack sai por docker stack deploy."
    PORTAINER_USUARIO="" PORTAINER_SENHA=""
    return 0
  fi
  PORTAINER_USUARIO="${WAKECRM_PORTAINER_USUARIO:-}"
  PORTAINER_SENHA="${WAKECRM_PORTAINER_SENHA:-}"
  if [ -n "$PORTAINER_SERVICO" ] && [ -z "$SIM" ] && [ -z "$PORTAINER_USUARIO" ]; then
    perguntar PORTAINER_USUARIO "Usuário do Portainer, para a stack ficar com controle total (Enter pula)" ""
    if [ -n "$PORTAINER_USUARIO" ]; then perguntar PORTAINER_SENHA "Senha do Portainer" "" -s; fi
  fi
  if [ -z "$PORTAINER_SERVICO" ] || [ -z "$PORTAINER_SENHA" ]; then PORTAINER_USUARIO=""; fi
}

SEGREDOS="WEBHOOK_EVOLUTION_SECRET WEBHOOK_VENDAS_SECRET PAINEL_RO_PASSWORD PAINEL_RW_PASSWORD WAKECRM_MOTOR_PASSWORD PUSH_DISPATCH_SECRET"
DECIDIDOS="DOMINIO EVOLUTION_INSTANCIA EVOLUTION_URL EVOLUTION_API_KEY OPENAI_API_KEY OPENAI_MODELO_TRANSCRICAO REDE CERTRESOLVER ENTRYPOINT PG_SERVICO"

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
  if ! docker pull -q "$IMAGEM" >/dev/null; then
    # Só com WAKECRM_IMAGEM (teste com imagem construída na máquina): aceita a local.
    if [ -z "${WAKECRM_IMAGEM:-}" ] || ! docker image inspect "$IMAGEM" >/dev/null 2>&1; then
      morrer "Não consegui baixar $IMAGEM."
    fi
    aviso "Uso a imagem local $IMAGEM (WAKECRM_IMAGEM)."
  fi

  VITE_VAPID_PUBLIC_KEY="$(ler_credencial "$CREDENCIAIS" VITE_VAPID_PUBLIC_KEY)"
  VAPID_PRIVATE_KEY="$(ler_credencial "$CREDENCIAIS" VAPID_PRIVATE_KEY)"
  checar_par_vapid "$VITE_VAPID_PUBLIC_KEY" "$VAPID_PRIVATE_KEY"
  if [ -z "$VITE_VAPID_PUBLIC_KEY" ]; then
    # web-push é dependência de produção do app: gera offline, dentro da imagem.
    local par
    par="$(docker run --rm --log-driver none --network none "$IMAGEM" bun -e \
      'const k=require("web-push").generateVAPIDKeys();console.log(k.publicKey);console.log(k.privateKey)')" ||
      morrer "Não consegui gerar as chaves VAPID."
    VITE_VAPID_PUBLIC_KEY="$(printf '%s\n' "$par" | sed -n 1p)"
    VAPID_PRIVATE_KEY="$(printf '%s\n' "$par" | sed -n 2p)"
    [ -n "$VITE_VAPID_PUBLIC_KEY" ] && [ -n "$VAPID_PRIVATE_KEY" ] || morrer "Chaves VAPID vazias."
    novos=$((novos + 2))
  fi

  # URLs derivadas (não gravadas). A do superusuário só vive nos contêineres temporários.
  derivar_urls

  if [ "$novos" -gt 0 ]; then ok "$novos segredo(s) novo(s); os existentes ficam como estão"; else
    ok "todos os segredos reaproveitados de $CREDENCIAIS"
  fi
}

# Tudo fora do schema wakeclub que `drop schema wakeclub cascade` (a volta automática) apagaria:
# o dump do schema não traz esses objetos de volta. Em pg_depend, cada dependência normal ou
# automática ('n', 'a') cujo objeto referido está no wakeclub (ou é o próprio schema) e cujo
# dependente está fora dele: views, FKs, funções com tipo do wakeclub, triggers que chamam
# função dele, defaults com sequência dele, casts e o que mais o Postgres registrar.
# Regra, trigger, default e policy não têm schema próprio em pg_identify_object: valem o da
# tabela ou view dona (dependência 'a' ou 'i'); sem dono (cast, event trigger), contam como fora.
# Com mais de um dono, vence o de fora do wakeclub (na dúvida, lista: fail-closed).
# Default privileges do schema wakeclub dependem do schema e são dele (o dump as traz).
# Corpo de função (plpgsql, ou SQL entre aspas) não entra em pg_depend: o cascade não apaga a
# função por citar uma tabela do wakeclub, e ela volta a funcionar depois da restauração.
# search_path só pg_catalog: pg_describe_object qualifica o schema de tudo (inclusive public).
# to_regnamespace: banco sem o schema não tem dependentes (e não dá erro).
SQL_DEPENDENTES="set search_path to pg_catalog;
select distinct pg_describe_object(d.classid, d.objid, d.objsubid)
  from pg_depend d
  cross join lateral pg_identify_object(d.refclassid, d.refobjid, d.refobjsubid) r
  cross join lateral pg_identify_object(d.classid, d.objid, d.objsubid) o
 where d.deptype in ('n', 'a')
   and (r.schema = 'wakeclub' or (d.refclassid = 'pg_namespace'::regclass and d.refobjid = to_regnamespace('wakeclub')))
   and coalesce(o.schema, (
         select case when dp.refclassid = 'pg_namespace'::regclass then p.identity else p.schema end
           from pg_depend dp
          cross join lateral pg_identify_object(dp.refclassid, dp.refobjid, dp.refobjsubid) p
          where dp.classid = d.classid and dp.objid = d.objid and dp.objsubid = d.objsubid
            and dp.deptype in ('a', 'i') and dp.refclassid in ('pg_class'::regclass, 'pg_namespace'::regclass)
          order by (case when dp.refclassid = 'pg_namespace'::regclass then p.identity else p.schema end) is not distinct from 'wakeclub'
          limit 1)) is distinct from 'wakeclub'
 order by 1"

# checar_dependentes: só leitura, antes do backup. Qualquer dependente ou erro para.
checar_dependentes() {
  local fora
  fora="$(sql_pg "$SQL_DEPENDENTES")" ||
    morrer "Não consegui conferir dependências de fora do schema wakeclub. Nada foi alterado."
  [ -z "$fora" ] && return 0
  falha "Objetos fora do schema wakeclub dependem dele:"
  printf '%s\n' "$fora" | sed 's/^/    - /'
  morrer "A volta automática (drop schema wakeclub cascade) os apagaria sem trazer de volta. Remova ou mova esses objetos e rode de novo. Nada foi alterado."
}

# Migrações pendentes, só leitura. Saída vazia = nada pendente; erro = para.
listar_pendentes() {
  local env n
  checar_banco
  env="$(arquivo_env ADMIN_DATABASE_URL)"
  PENDENTES="$(rodar_no_app "$env" bun scripts/migrar.mjs --pendentes)" ||
    morrer "Não consegui listar as migrações pendentes (o banco wakeclub existe em $PG_SERVICO?). Nada foi alterado."
  rm -f "$env"
  [ -n "$PENDENTES" ] || return 0
  checar_dependentes
  # Pré-checagem do runbook: nenhum follow-up no meio de um envio antes de migrar.
  n="$(sql_pg "select to_regclass('wakeclub.followups') is not null")" ||
    morrer "Não consegui consultar o banco wakeclub. Nada foi alterado."
  [ "$n" = t ] || return 0
  n="$(sql_pg "select count(*) from wakeclub.followups where status = 'enviando'")" ||
    morrer "Não consegui consultar wakeclub.followups. Nada foi alterado."
  [ "$n" = 0 ] ||
    morrer "Há $n follow-up(s) com status 'enviando'. Espere o envio terminar (ou resolva à mão) e rode de novo. Nada foi alterado."
}

# texto_valor CHAVE VALOR: como o valor aparece no resumo (chave de API mascarada).
texto_valor() {
  case "$1" in *_KEY) mascarar "$2" ;; *) printf '%s\n' "$2" ;; esac
}

# escolher_conflitos: valor da stack no ar diferente do instalador. Mostra os dois e fica com o
# do instalador, salvo escolha do dono; com WAKECRM_SIM fica com o do instalador e avisa.
escolher_conflitos() {
  local c v origem resp
  for c in $(conflitos_stack); do
    v="$(valor_env_servico "$ENV_VIVO" "$c")"
    origem="${c}_ORIGEM"
    aviso "$c na stack no ar difere do instalador:"
    echo "    instalador (${!origem:-salvo}): $(texto_valor "$c" "${!c}")"
    echo "    stack no ar: $(texto_valor "$c" "$v")"
    if [ -n "$SIM" ]; then
      aviso "Fico com o do instalador (WAKECRM_SIM)."
      continue
    fi
    perguntar resp "Usar o valor da stack no ar? [s/N]" ""
    case "$resp" in s | S | sim | Sim | SIM) ;; *) continue ;; esac
    if ! valor_seguro_stack "$v" || { [ "$c" = EVOLUTION_URL ] && ! url_evolution_ok "$v"; }; then
      aviso "O valor da stack no ar não serve (aspas, barra, quebra de linha ou /manager); fico com o do instalador."
      continue
    fi
    printf -v "$c" '%s' "$v"
    printf -v "$origem" '%s' "da stack no ar"
  done
}

# perguntar_motor: ligar o motor é decisão explícita do dono (padrão N). Só pergunta com o
# motor desligado e o adaptador completo. Com WAKECRM_SIM, WAKECRM_MOTOR_ATIVO (1 ou vazio)
# decide; sem ela, fica como está.
perguntar_motor() {
  local resp
  if [ -n "$SIM" ]; then
    [ -n "${WAKECRM_MOTOR_ATIVO+x}" ] || return 0
    case "$WAKECRM_MOTOR_ATIVO" in 1 | "") ;; *) morrer "WAKECRM_MOTOR_ATIVO aceita 1 ou vazio. Nada foi alterado." ;; esac
    if [ "$WAKECRM_MOTOR_ATIVO" = 1 ] && ! adaptador_completo; then
      morrer "WAKECRM_MOTOR_ATIVO=1 sem EVOLUTION_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCIA. Nada foi alterado."
    fi
    MOTOR_ATIVO="$WAKECRM_MOTOR_ATIVO"
    MOTOR_ATIVO_ORIGEM="WAKECRM_MOTOR_ATIVO"
    return 0
  fi
  [ "$MOTOR_ATIVO" != 1 ] || return 0
  adaptador_completo || return 0
  echo "  O motor desligado só grava os eventos; ligado, processa filas, distribui leads e envia mensagens." >&2
  perguntar resp "Ligar o motor (MOTOR_ATIVO=1)? [s/N]" ""
  case "$resp" in
    s | S | sim | Sim | SIM)
      MOTOR_ATIVO=1
      MOTOR_ATIVO_ORIGEM="ligado agora"
      ;;
  esac
}

confirmar() {
  passo 5 "Resumo"
  listar_pendentes
  local chave
  cat <<EOF

  Postgres        $PG_SERVICO (Postgres $PG_MAJOR, usuário $PG_USUARIO, senha $PG_SENHA_ORIGEM)
  Traefik         $TRAEFIK_SERVICO, certresolver $CERTRESOLVER, entrypoint $ENTRYPOINT
  Rede            $REDE ($REDE_ORIGEM, $(if [ -n "$REDE_ATTACHABLE" ]; then echo attachable; else echo "não attachable"; fi))
  Jobs temporários rede do contêiner do Postgres (127.0.0.1)
  Evolution       ${EVO_SERVICO:-não encontrada} ${EVOLUTION_URL:+($EVOLUTION_URL, $EVOLUTION_URL_ORIGEM)}
  Chave Evolution $(mascarar "$EVOLUTION_API_KEY")${EVOLUTION_API_KEY:+, $EVOLUTION_API_KEY_ORIGEM}
  Portainer       ${PORTAINER_SERVICO:-não encontrado}
  Publicação      $(texto_publicacao)
  Dados do Orion  ${ORION_USADOS:-nenhum} (em $ORION_DIR)
  Domínio         https://$DOMINIO
  Instância       $EVOLUTION_INSTANCIA
  Chave OpenAI    $(mascarar "$OPENAI_API_KEY")${OPENAI_API_KEY:+, $OPENAI_API_KEY_ORIGEM}
  Modelo transcr. ${OPENAI_MODELO_TRANSCRICAO:-padrão (whisper-1)}
  Motor           MOTOR_ATIVO=${MOTOR_ATIVO} ($(if [ "$MOTOR_ATIVO" = 1 ]; then echo ligado; else echo desligado; fi), $MOTOR_ATIVO_ORIGEM)
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
  escolher_conflitos
  perguntar_motor

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
  # Exato, inclusive vazio: o motor desligado na stack não volta a ligar pelo arquivo.
  trocar_credencial "$CREDENCIAIS" MOTOR_ATIVO "$MOTOR_ATIVO"
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
    if [ -n "${REPLICAS_ANTES:-}" ] && [ "$REPLICAS_ANTES" -gt 0 ]; then CRM_PARADO=1; fi
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

# Publica a stack wakecrm: pela API do Portainer com credencial; senão (ou se a API falhar)
# por docker stack deploy. O arquivo preenchido tem segredos: fica em TMP, 600.
publicar() {
  passo 8 "Publicando a stack wakecrm"
  local env
  STACK="$TMP/wakecrm-stack.yml"
  # shellcheck disable=SC2086 # uma chave por palavra
  env="$(arquivo_env $CHAVES_STACK)"
  (umask 077 && stack_publicavel "$MODELO_STACK" "$env" >"$STACK") || morrer "Não consegui preencher $MODELO_STACK."
  rm -f "$env"
  # Vazio se o serviço não existe; conferir espera o deploy mudar isto.
  ATUALIZADO_ANTES="$(docker service inspect --format '{{.UpdatedAt}}' "$SERVICO_APP" 2>/dev/null || true)"
  if [ -n "$PORTAINER_TOKEN" ] || [ -n "$PORTAINER_USUARIO" ]; then
    if publicar_portainer; then
      CRM_PARADO=""
      religar_depois_do_deploy
      return 0
    fi
    aviso "A API do Portainer falhou; publico por docker stack deploy (controle limitado no Portainer)."
  fi
  docker stack deploy --with-registry-auth=false -c - wakecrm <"$STACK" ||
    morrer "docker stack deploy falhou. O banco já está como o instalador deixou; corrija e rode de novo. Log: docker service logs --tail 100 $SERVICO_APP"
  CRM_PARADO=""
  ok "stack wakecrm publicada por docker stack deploy"
  religar_depois_do_deploy
}

# O deploy volta o serviço para as réplicas do arquivo (1); com mais antes, devolve.
religar_depois_do_deploy() {
  if [ -n "${REPLICAS_ANTES:-}" ] && [ "$REPLICAS_ANTES" -gt 1 ]; then religar_app; fi
}

# Confere réplica, /login (certificado válido) e o webhook protegido. Falha => 1, com o
# comando do log; não para o instalador antes do resumo.
conferir() {
  passo 9 "Conferindo"
  local codigo
  if ! esperar_ate 180 5 replica_pronta; then
    falha "A réplica nova de $SERVICO_APP não ficou Running em 180 s. Veja o log: docker service logs --tail 100 $SERVICO_APP"
    return 1
  fi
  if update_falhou "$ESTADO_UPDATE"; then
    falha "O Swarm não concluiu a atualização de $SERVICO_APP (estado $ESTADO_UPDATE). Veja: docker service ps $SERVICO_APP e docker service logs --tail 100 $SERVICO_APP"
    return 1
  fi
  ok "réplica nova Running (atualização concluída)"
  if ! esperar_ate 180 10 login_ok; then
    falha "https://$DOMINIO/login não respondeu 200 em 180 s. Log: docker service logs --tail 100 $SERVICO_APP"
    aviso "O CRM está de pé: confira se o DNS de $DOMINIO aponta para este servidor e se o Traefik emitiu o certificado (docker service logs --tail 100 $TRAEFIK_SERVICO)."
    return 1
  fi
  ok "https://$DOMINIO/login respondeu 200"
  codigo="$(codigo_webhook)" || true
  if [ "$codigo" != 404 ]; then
    falha "POST /api/webhooks/evolution sem segredo respondeu ${codigo:-nada} (esperado 404). Log: docker service logs --tail 100 $SERVICO_APP"
    return 1
  fi
  ok "webhook da Evolution vivo e protegido (404 sem segredo)"
}

resumo() {
  passo 10 "Resumo final"
  if [ "$1" != 0 ]; then
    falha "A conferência falhou (veja acima). A stack foi publicada e o banco não foi restaurado."
  fi
  texto_resumo "$(ip_servidor)"
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
  publicar
  local rc=0
  conferir || rc=1
  resumo "$rc"
  return "$rc"
}

# Permite `. instalar.sh` em teste sem rodar nada.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
