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
#   WAKECRM_DIR                         pasta das credenciais (padrão /root/wakecrm)
set -euo pipefail

IMAGEM="ghcr.io/felip2ee/dash-wakeclub-crm-wpp:latest"
DIR_WAKECRM="${WAKECRM_DIR:-/root/wakecrm}"
CREDENCIAIS="$DIR_WAKECRM/credenciais.env"
SIM="${WAKECRM_SIM:-}"

# Tudo que é temporário (inclusive arquivos com segredo) mora aqui e sai no fim.
TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
trap 'exit 130' INT TERM

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
  local env
  env="$(arquivo_env ADMIN_DATABASE_URL)"
  PENDENTES="$(rodar_no_app "$env" bun scripts/migrar.mjs --pendentes)" ||
    morrer "Não consegui listar as migrações pendentes (o banco wakeclub existe em $PG_SERVICO?). Nada foi alterado."
  rm -f "$env"
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

main() {
  precondicoes
  detectar
  perguntas
  gerar
  confirmar
  gravar_credenciais
  # Task 6: banco (backup se houver PENDENTES, migrar, aplicar, restaurar em falha, admin).
  # Task 7: publicar a stack, conferir /login e o webhook, resumo final.
}

# Permite `. instalar.sh` em teste sem rodar nada.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
