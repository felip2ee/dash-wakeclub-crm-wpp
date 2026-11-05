#!/usr/bin/env bash
# shellcheck disable=SC1091,SC2030,SC2031 # subshells de teste isolam variáveis de propósito
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

# comando_restaurar: o manual usa o mesmo script atômico, com lista e dump nessa ordem, na rede
# do contêiner do Postgres (procurado quando o comando roda) e com o banco em 127.0.0.1.
# shellcheck disable=SC2034 # lidas dentro de comando_restaurar
REDE=r1 DIR_BACKUPS=/root/wakecrm/backups PG_HOST=pg PG_SERVICO=pg_pg PG_USUARIO=postgres PG_MAJOR=14
CMD="$(comando_restaurar /root/wakecrm/backups/w.dump /root/wakecrm/backups/w.dump.lista)"
# shellcheck disable=SC2016 # $(...) literal: expande quando o dono colar o comando
case "$CMD" in
  'docker run --rm -it --network container:$(docker ps -q -f label=com.docker.swarm.service.name=pg_pg -f status=running | head -n1) -v /root/wakecrm/backups:/backups '*"-e PGHOST=127.0.0.1 -e PGUSER=postgres postgres:14 sh -c '$SCRIPT_RESTAURAR' sh /backups/w.dump.lista /backups/w.dump") r=ok ;;
  *) r="$CMD" ;;
esac
assert_eq ok "$r" "comando manual de restauração"
case "$CMD" in *r1* | *"PGHOST=pg "*) r=rede ;; *) r=ok ;; esac
assert_eq ok "$r" "comando manual não usa a REDE nem o nome do serviço"
case "$SCRIPT_RESTAURAR" in *"drop schema"*"psql -X -q -1 -v ON_ERROR_STOP=1"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "drop e restauração na mesma transação (psql -1)"
case "$CMD" in *PGPASSWORD* | *teste*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "comando manual sem senha"

# Contêineres temporários: rede do contêiner do Postgres neste nó, procurado a cada uso.
# shellcheck disable=SC2329,SC2317 # docker simulado
docker() {
  case "$1" in
    ps) echo "ps $*" >>"$TMP/docker.log"; printf '%s\n' ${PG_CONT:+"$PG_CONT"} ;;
    *) printf '%s\n' "$*" ;;
  esac
}
# shellcheck disable=SC2034 # lidas dentro de rodar_no_*
{ IMAGEM=img:1; DIR_BACKUPS="$TMP/bk"; PG_CONT=c1; }
assert_eq "run --rm --network container:c1 --env-file /e img:1 bun scripts/migrar.mjs" "$(rodar_no_app /e bun scripts/migrar.mjs)" "rodar_no_app na rede do contêiner do Postgres"
assert_eq "run --rm --network container:c1 --env-file /e -v $TMP/bk:/backups postgres:14 psql -At" "$(rodar_no_pg /e psql -At)" "rodar_no_pg na rede do contêiner do Postgres"
case "$(cat "$TMP/docker.log")" in *"label=com.docker.swarm.service.name=pg_pg -f status=running"*) r=ok ;; *) r="$(cat "$TMP/docker.log")" ;; esac
assert_eq ok "$r" "contêiner procurado pelo serviço, só running"
PG_CONT=c2
assert_eq "run --rm --network container:c2 --env-file /e img:1 x" "$(rodar_no_app /e x)" "tarefa reiniciada: acha o contêiner novo"
PG_CONT=""
saida="$(rodar_no_pg /e psql 2>&1)"
assert_eq 1 "$(rodar_no_pg /e psql >/dev/null 2>&1; echo $?)" "sem contêiner do Postgres neste nó: código 1"
case "$saida" in "✗ Nenhum contêiner do Postgres (pg_pg) rodando neste nó"*) r=ok ;; *) r="$saida" ;; esac
assert_eq ok "$r" "sem contêiner: diz por quê, sem rodar nada"
assert_eq "" "$(rodar_no_app /e x 2>/dev/null)" "sem contêiner: mensagem só no stderr"
unset -f docker

# derivar_urls: stack no nome do serviço (REDE), contêineres temporários em 127.0.0.1.
# shellcheck disable=SC2034 # lidas dentro de derivar_urls
{ PG_HOST=postgres_postgres; PG_USUARIO=postgres; PG_SENHA='s@1'; PAINEL_RO_PASSWORD=ro; PAINEL_RW_PASSWORD=rw; WAKECRM_MOTOR_PASSWORD=mo; }
derivar_urls
assert_eq "postgres://painel_ro:ro@postgres_postgres:5432/wakeclub|postgres://painel_rw:rw@postgres_postgres:5432/wakeclub|postgres://wakecrm_motor:mo@postgres_postgres:5432/wakeclub" \
  "$DATABASE_URL|$DATABASE_URL_RW|$DATABASE_URL_MOTOR" "URLs da stack no nome do serviço"
assert_eq "postgres://painel_ro:ro@127.0.0.1:5432/wakeclub|postgres://painel_rw:rw@127.0.0.1:5432/wakeclub|postgres://postgres:s%401@127.0.0.1:5432/wakeclub" \
  "$DATABASE_URL_JOB|$DATABASE_URL_RW_JOB|$ADMIN_DATABASE_URL" "URLs dos contêineres temporários em 127.0.0.1"
# aplicar_banco entrega ao contêiner as URLs de 127.0.0.1 e não mexe nas da stack.
# shellcheck disable=SC2329 # rodar_no_app simulado
r="$(rodar_no_app() { cat "$1"; }; aplicar_banco | grep -E '^DATABASE_URL(_RW)?=' | sort -u | tr '\n' ' '; echo "$DATABASE_URL")"
assert_eq "DATABASE_URL=postgres://painel_ro:ro@127.0.0.1:5432/wakeclub DATABASE_URL_RW=postgres://painel_rw:rw@127.0.0.1:5432/wakeclub postgres://painel_ro:ro@postgres_postgres:5432/wakeclub" \
  "$r" "aplicar_banco: env do contêiner com 127.0.0.1, stack intacta"
# shellcheck disable=SC2034
PG_HOST=pg

# Publicação: modelo real preenchido, sem segredo do superusuário e com $ dobrado.
# shellcheck disable=SC2034,SC2016 # lidas por nome em arquivo_env; $ literal de propósito
{
  IMAGEM=img:1 DOMINIO=crm.exemplo.com REDE=rede CERTRESOLVER=le ENTRYPOINT=https443 DATABASE_URL=u1 DATABASE_URL_RW=u2
  DATABASE_URL_MOTOR=u3 VITE_VAPID_PUBLIC_KEY=p VAPID_PRIVATE_KEY=v PUSH_DISPATCH_SECRET=s1
  WEBHOOK_EVOLUTION_SECRET=s2 WEBHOOK_VENDAS_SECRET=s3 EVOLUTION_INSTANCIA=wakeclub EVOLUTION_URL=http://evo:8080
  EVOLUTION_API_KEY='a$b' ADMIN_DATABASE_URL=postgres://postgres:superu@pg/wakeclub
  OPENAI_API_KEY=sk-1 OPENAI_MODELO_TRANSCRICAO="" MOTOR_ATIVO=1
}
# shellcheck disable=SC2086
ENV_STACK="$(arquivo_env $CHAVES_STACK)"
PUB="$(stack_publicavel "$AQUI/wakecrm-stack.yml" "$ENV_STACK")"
assert_eq 0 "$?" "modelo real preenche com CHAVES_STACK"
case "$PUB" in *superu* | *ADMIN_DATABASE_URL*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "stack sem a URL do superusuário"
# A stack real com as URLs de derivar_urls: nunca 127.0.0.1.
# shellcheck disable=SC2086 # uma chave por palavra
r="$(derivar_urls; e="$(arquivo_env $CHAVES_STACK)"; stack_publicavel "$AQUI/wakecrm-stack.yml" "$e")"
case "$r" in *127.0.0.1*) r=vazou ;; *"DATABASE_URL=postgres://painel_ro:ro@pg:5432/wakeclub"*) r=ok ;; esac
assert_eq ok "$r" "stack com o nome do serviço do Postgres, nunca 127.0.0.1"
case "$PUB" in *"image: img:1"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "stack usa IMAGEM"
case "$PUB" in *'"traefik.http.routers.wakecrm.entrypoints=https443"'*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "stack usa ENTRYPOINT"
# shellcheck disable=SC2016 # $ literal
case "$PUB" in *'EVOLUTION_API_KEY=a$$b"'*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "\$ do valor vira \$\$ (docker stack deploy interpola)"
# shellcheck disable=SC2016 # $ literal
assert_eq "" "$(printf '%s\n' "$PUB" | grep -o '\${[A-Za-z_]*}')" "nenhum marcador sobra"
for c in OPENAI_API_KEY OPENAI_MODELO_TRANSCRICAO MOTOR_ATIVO; do
  # shellcheck disable=SC2016 # marcador literal
  assert_eq 1 "$(grep -c "\"$c=\${$c}\"" "$AQUI/wakecrm-stack.yml")" "modelo tem o marcador de $c"
done
case "$PUB" in *'"OPENAI_API_KEY=sk-1"'*'"OPENAI_MODELO_TRANSCRICAO="'*'"MOTOR_ATIVO=1"'*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "stack leva OPENAI_API_KEY, modelo vazio e MOTOR_ATIVO"

# Stack no ar (o que o dono mudou no Portainer): vazio aqui adota o de lá; salvo vence;
# diferente vira conflito; MOTOR_ATIVO segue a stack no ar.
F2="$TMP/c2.env"
printf '%s\n' OPENAI_API_KEY=sk-salva EVOLUTION_URL=http://salva:8080 MOTOR_ATIVO=1 >"$F2"
VIVO="$(printf '%s\n' NODE_ENV=production OPENAI_API_KEY=sk-viva OPENAI_MODELO_TRANSCRICAO=whisper-1 \
  EVOLUTION_URL=http://evolution_evolution_api:8080/manager/ EVOLUTION_API_KEY=k-viva MOTOR_ATIVO=)"
# shellcheck disable=SC2034 # lidas por nome em adotar_da_stack e conflitos_stack
r="$(ENV_VIVO="$VIVO" CREDENCIAIS="$F2"
  OPENAI_API_KEY="$(ler_credencial "$F2" OPENAI_API_KEY)" OPENAI_MODELO_TRANSCRICAO="" EVOLUTION_URL=http://evo:8080 EVOLUTION_API_KEY=""
  for c in $CHAVES_PRESERVADAS; do adotar_da_stack "$c"; done
  decidir_motor
  printf '%s|' "$OPENAI_API_KEY" "$OPENAI_MODELO_TRANSCRICAO ($OPENAI_MODELO_TRANSCRICAO_ORIGEM)" "$EVOLUTION_API_KEY" \
    "$EVOLUTION_URL" "[$MOTOR_ATIVO] ($MOTOR_ATIVO_ORIGEM)" "$(conflitos_stack | tr '\n' ' ')")"
assert_eq "sk-salva|whisper-1 (lida da stack no ar)|k-viva|http://evo:8080|[] (da stack no ar)|EVOLUTION_URL OPENAI_API_KEY |" "$r" \
  "preservação: salvo vence, vazio adota a stack, motor da stack, diferentes viram conflito"
# shellcheck disable=SC2034
r="$(ENV_VIVO="" CREDENCIAIS="$F2"; decidir_motor; echo "$MOTOR_ATIVO ($MOTOR_ATIVO_ORIGEM)")"
assert_eq "1 (salvo)" "$r" "sem stack no ar: MOTOR_ATIVO salvo"
# shellcheck disable=SC2034
r="$(ENV_VIVO="NODE_ENV=production" CREDENCIAIS="$TMP/nada.env"; decidir_motor; echo "[$MOTOR_ATIVO]")"
assert_eq "[]" "$r" "stack antiga sem a chave e nada salvo: motor desligado"
trocar_credencial "$F2" MOTOR_ATIVO ""
assert_eq "MOTOR_ATIVO=" "$(grep '^MOTOR_ATIVO=' "$F2")" "motor desligado grava vazio por cima do 1"
assert_eq 1 "$(grep -c '^MOTOR_ATIVO=' "$F2")" "uma linha só de MOTOR_ATIVO"

# escolher_conflitos com WAKECRM_SIM: fica com o do instalador, avisa, chave mascarada.
# shellcheck disable=SC2034
saida="$( (SIM=1 ENV_VIVO="$VIVO" EVOLUTION_URL=http://evo:8080 EVOLUTION_URL_ORIGEM="detectada no serviço" \
  EVOLUTION_API_KEY=k-instalador EVOLUTION_API_KEY_ORIGEM="lida do serviço" OPENAI_API_KEY=sk-viva OPENAI_MODELO_TRANSCRICAO=whisper-1
  escolher_conflitos; echo "fim=$EVOLUTION_URL") 2>&1)"
case "$saida" in *"EVOLUTION_URL na stack no ar difere"*"instalador (detectada no serviço): http://evo:8080"*"stack no ar: http://evolution_evolution_api:8080/manager/"*"EVOLUTION_API_KEY na stack"*"(12 caracteres)"*"(6 caracteres)"*"fim=http://evo:8080") r=ok ;; *) r="$saida" ;; esac
assert_eq ok "$r" "conflito com SIM: mostra os dois, fica com o do instalador"
case "$saida" in *k-viva* | *k-instalador*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "conflito não mostra a chave"
# Interativo escolhendo a stack no ar: URL /manager é recusada, chave é adotada.
# shellcheck disable=SC2034,SC2329 # perguntar simulado
r="$( (SIM="" ENV_VIVO="$VIVO" EVOLUTION_URL=http://evo:8080 EVOLUTION_API_KEY=k-instalador OPENAI_API_KEY=sk-viva OPENAI_MODELO_TRANSCRICAO=whisper-1
  perguntar() { printf -v "$1" s; }
  escolher_conflitos >/dev/null 2>&1; echo "$EVOLUTION_URL|$EVOLUTION_API_KEY|$EVOLUTION_API_KEY_ORIGEM"))"
assert_eq "http://evo:8080|k-viva|da stack no ar" "$r" "escolha da stack: /manager recusada, chave adotada"

# /manager é o painel da Evolution, não a base da API.
for v in http://evolution_evolution_api:8080 https://evo.exemplo.com http://evo:8080/managerx; do
  assert_eq 0 "$(url_evolution_ok "$v"; echo $?)" "URL [$v] aceita"
done
for v in https://evo.exemplo.com/manager https://evo.exemplo.com/manager/; do
  assert_eq 1 "$(url_evolution_ok "$v"; echo $?)" "URL [$v] recusada"
done
saida="$( (SIM=1 EVOLUTION_URL=https://evo.exemplo.com/manager/; exigir_url_evolution) 2>&1)"
assert_eq 1 "$( (SIM=1 EVOLUTION_URL=https://evo.exemplo.com/manager; exigir_url_evolution) >/dev/null 2>&1; echo $?)" "SIM com /manager: para"
case "$saida" in *"painel da Evolution, não a base da API"*"Nada foi alterado."*) r=ok ;; *) r="$saida" ;; esac
assert_eq ok "$r" "mensagem do /manager explica o painel"
# shellcheck disable=SC2034,SC2329 # perguntar simulado
r="$( (SIM="" EVOLUTION_URL=https://evo.exemplo.com/manager/; perguntar() { printf -v "$1" http://evo:8080; }; exigir_url_evolution >/dev/null 2>&1; echo "$EVOLUTION_URL"))"
assert_eq http://evo:8080 "$r" "interativo com /manager: pergunta de novo"

# perguntar_motor: SIM segue WAKECRM_MOTOR_ATIVO; sem ela, fica; interativo só com motor
# desligado e adaptador completo, padrão N.
# shellcheck disable=SC2034
{ EVOLUTION_URL=http://evo:8080; EVOLUTION_API_KEY=k; EVOLUTION_INSTANCIA=wakeclub; }
# shellcheck disable=SC2034 # lidas dentro de perguntar_motor
{
assert_eq "x" "$(SIM=1 MOTOR_ATIVO=x; unset WAKECRM_MOTOR_ATIVO; perguntar_motor; echo "$MOTOR_ATIVO")" "SIM sem WAKECRM_MOTOR_ATIVO: fica"
assert_eq 1 "$(SIM=1 MOTOR_ATIVO="" WAKECRM_MOTOR_ATIVO=1; perguntar_motor; echo "$MOTOR_ATIVO")" "SIM liga com WAKECRM_MOTOR_ATIVO=1"
assert_eq "[]" "$(SIM=1 MOTOR_ATIVO=1 WAKECRM_MOTOR_ATIVO=""; perguntar_motor; echo "[$MOTOR_ATIVO]")" "SIM desliga com WAKECRM_MOTOR_ATIVO vazio"
assert_eq 1 "$( (SIM=1 MOTOR_ATIVO="" WAKECRM_MOTOR_ATIVO=1 EVOLUTION_API_KEY=""; perguntar_motor) >/dev/null 2>&1; echo $?)" "SIM liga sem adaptador: para"
assert_eq 1 "$( (SIM=1 WAKECRM_MOTOR_ATIVO=0; perguntar_motor) >/dev/null 2>&1; echo $?)" "SIM com valor estranho: para"
}
# shellcheck disable=SC2329 # perguntar simulado
{
  assert_eq "[]" "$(SIM="" MOTOR_ATIVO=""; perguntar() { printf -v "$1" ''; }; perguntar_motor 2>/dev/null; echo "[$MOTOR_ATIVO]")" "Enter: motor fica desligado"
  assert_eq 1 "$(SIM="" MOTOR_ATIVO=""; perguntar() { printf -v "$1" s; }; perguntar_motor 2>/dev/null; echo "$MOTOR_ATIVO")" "s: liga o motor"
  assert_eq "[]" "$(SIM="" MOTOR_ATIVO="" EVOLUTION_API_KEY=""; perguntar() { echo PERGUNTOU; }; perguntar_motor 2>/dev/null; echo "[$MOTOR_ATIVO]")" "adaptador incompleto: não pergunta"
  assert_eq 1 "$(SIM="" MOTOR_ATIVO=1; perguntar() { echo PERGUNTOU; }; perguntar_motor 2>/dev/null; echo "$MOTOR_ATIVO")" "motor já ligado: não pergunta"
}

# json_texto: escapes de string JSON.
assert_eq '"a\"b\\c\td\nl2"' "$(printf 'a"b\\c\td\nl2\n' | json_texto)" "json_texto escapa aspas, barra, tab e linha"
assert_eq '""' "$(printf '' | json_texto)" "json_texto vazio"

# Respostas da API do Portainer.
assert_eq tok.x-y "$(jwt_portainer '{"jwt":"tok.x-y"}')" "jwt da resposta de /api/auth"
EP='[{"Id":1,"Name":"local","Type":1,"Snapshots":[{"Id":9}]},{"Id":3,"Name":"k8s","Type":5},{"Id":4,"Name":"agente","Type":2,"URL":"x"},{"Id":6,"Name":"edge","Type":4}]'
assert_eq "$(printf '1\n4\n6')" "$(ids_endpoints_docker "$EP")" "endpoints Docker (tipos 1, 2 e 4), sem Ids aninhados"
assert_eq "" "$(ids_endpoints_docker '[]')" "sem endpoint: vazio"
assert_eq abc123 "$(printf '{"ID":"abc123","Version":{"Index":10},"Spec":{"Name":"default"}}' | id_swarm_json)" "ID do cluster na resposta de /docker/swarm"
assert_eq "" "$(printf '{"message":"not a swarm"}' | id_swarm_json)" "resposta sem ID: vazio"
PARES="$(printf '1 outro\n4 \n6 abc123\n')"
assert_eq 6 "$(endpoint_por_swarm abc123 "$PARES")" "endpoint cujo Swarm é o local"
assert_eq "" "$(endpoint_por_swarm zzz "$PARES")" "nenhum endpoint é o Swarm local: vazio"
assert_eq "" "$(endpoint_por_swarm "" "$PARES")" "Swarm local vazio não casa com endpoint sem ID"
# endpoint_do_swarm: consulta cada endpoint Docker e fica com o do Swarm local.
api_simulada() {
  case "$2" in
    /api/endpoints) printf '%s' "$EP" ;;
    /api/endpoints/1/docker/swarm) printf '{"ID":"outro"}' ;;
    /api/endpoints/4/docker/swarm) return 22 ;;
    /api/endpoints/6/docker/swarm) printf '{"ID":"abc123","Version":{}}' ;;
    *) printf 'chamada inesperada %s' "$2" ;;
  esac
}
# shellcheck disable=SC2329 # portainer_api chamada por endpoint_do_swarm
r="$(portainer_api() { api_simulada "$@"; }; endpoint_do_swarm abc123)"
assert_eq 6 "$r" "endpoint_do_swarm escolhe pelo ID do Swarm, não o primeiro"
# shellcheck disable=SC2329
assert_eq 1 "$(portainer_api() { return 22; }; endpoint_do_swarm abc123; echo $?)" "lista de endpoints falhou (401, rede): código 1, não 'nenhum endpoint'"
# shellcheck disable=SC2329
assert_eq 0 "$(portainer_api() { api_simulada "$@"; }; endpoint_do_swarm zzz >/dev/null; echo $?)" "nenhum endpoint bate: código 0 e vazio"
# As sondas de /docker/swarm têm 15 s; o resto fica com 300 s.
api_tempo() {
  if [ "$2" = /api/endpoints ]; then printf '%s' "$EP"; else config_portainer "$@" | grep '^max-time' >>"$TMP/tempos"; fi
}
# shellcheck disable=SC2329
(portainer_api() { api_tempo "$@"; }; PORTAINER_BASE=http://p:9000; endpoint_do_swarm abc123 >/dev/null)
r="$(sort -u "$TMP/tempos")"
assert_eq "max-time = 15" "$r" "sonda de endpoint com max-time 15"
# shellcheck disable=SC2034
PORTAINER_BASE=http://p:9000
assert_eq "max-time = 300" "$(config_portainer GET /api/stacks | grep '^max-time')" "chamada normal com max-time 300"
# Falha da API: diz de onde veio a credencial, sem mostrá-la.
r="$( (PORTAINER_DOMINIO=painel.exemplo.com PORTAINER_TOKEN=ptr_segredo PORTAINER_BASE=https://painel.exemplo.com ORION_DIR=/root/dados_vps; aviso_api_portainer) 2>&1)"
assert_eq "! O Portainer em https://painel.exemplo.com recusou o token de /root/dados_vps/dados_portainer ou não respondeu (erro do curl acima)." "$r" "falha da API com token do Orion"
r="$( (PORTAINER_DOMINIO="" PORTAINER_TOKEN="" PORTAINER_BASE=https://pt:9443; aviso_api_portainer) 2>&1)"
assert_eq "! O Portainer em https://pt:9443 recusou o usuário e a senha digitados ou não respondeu (erro do curl acima)." "$r" "falha da API com credencial digitada"
ST='[{"Id":2,"Name":"evolution","ResourceControl":{"Id":7}},{"Id":12,"Name":"wakecrm","Type":1}]'
assert_eq 12 "$(id_stack "$ST" wakecrm)" "id da stack wakecrm"
assert_eq "" "$(id_stack '[{"Id":2,"Name":"wakecrm2"}]' wakecrm)" "nome parecido não casa"

# Config do curl para o Portainer: corpo e token dentro da config, escapados.
# shellcheck disable=SC2034 # lidas dentro de config_portainer
{ PORTAINER_SERVICO=portainer_portainer; PORTAINER_JWT=jwt1; PORTAINER_BASE=https://portainer_portainer:9443; }
CFG="$(config_portainer PUT '/api/stacks/3?endpointId=1' '{"a":"x\\ny \"q\""}')"
case "$CFG" in *'url = "https://portainer_portainer:9443/api/stacks/3?endpointId=1"'*'request = "PUT"'*insecure*'Authorization: Bearer jwt1"'*) r=ok ;; *) r="$CFG" ;; esac
assert_eq ok "$r" "config do curl com url, método e token"
assert_eq 'data-binary = "{\"a\":\"x\\\\ny \\\"q\\\"\"}"' "$(printf '%s\n' "$CFG" | grep '^data-binary')" "corpo escapado na config do curl"
# shellcheck disable=SC2034 # lida dentro de config_portainer
PORTAINER_JWT=""
case "$(config_portainer GET /api/endpoints)" in *Authorization* | *data-binary*) r=nao ;; *) r=ok ;; esac
assert_eq ok "$r" "sem token e sem corpo: nem header nem data"

# Portainer pelo domínio do Orion: token no header X-API-Key, TLS verificado (sem insecure).
# shellcheck disable=SC2034 # lidas dentro de config_portainer
{ PORTAINER_DOMINIO=painel.exemplo.com; PORTAINER_TOKEN='ptr_"x'; PORTAINER_JWT=jwt1; PORTAINER_BASE=https://painel.exemplo.com; }
CFG="$(config_portainer GET /api/endpoints)"
case "$CFG" in *'url = "https://painel.exemplo.com/api/endpoints"'*'header = "X-API-Key: ptr_\"x"'*) r=ok ;; *) r="$CFG" ;; esac
assert_eq ok "$r" "config com token do Orion no X-API-Key"
case "$CFG" in *insecure* | *Authorization*) r=nao ;; *) r=ok ;; esac
assert_eq ok "$r" "domínio do Orion: sem insecure e sem Bearer"
# portainer_api pelo domínio: curl no servidor, config no stdin, token fora dos argumentos.
# shellcheck disable=SC2329 # stubs chamados por portainer_api
r="$(curl() { printf 'args=[%s] ' "$*"; grep -c 'X-API-Key' ; }; docker() { echo docker; }; portainer_api GET /api/stacks)"
assert_eq "args=[-K -] 1" "$r" "curl no servidor com a config pelo stdin"
# shellcheck disable=SC2034 # lidas dentro de config_portainer
{ PORTAINER_DOMINIO=""; PORTAINER_TOKEN=""; PORTAINER_JWT=jwt1; }

# portainer_do_orion: dados_portainer do Orion.
ORION_DIR="$TMP/orion-p"
mkdir -p "$ORION_DIR"
printf '%s\n' '[ PORTAINER ]' 'Dominio do portainer: https://painel.exemplo.com/' '' 'Usuario: dono' '' 'Senha: s1' '' 'Token: ptr_1' >"$ORION_DIR/dados_portainer"
r="$(ORION_USADOS=""; portainer_do_orion >/dev/null; echo "$PORTAINER_DOMINIO|$PORTAINER_TOKEN|${PORTAINER_USUARIO:-}|$ORION_USADOS")"
assert_eq "painel.exemplo.com|ptr_1||dados_portainer" "$r" "Orion com token: domínio sem esquema e barra, token preferido"
printf '%s\n' '[ PORTAINER ]' 'Dominio do portainer: painel.exemplo.com' '' 'Usuario: dono' '' 'Senha: s1' '' 'Token: ' >"$ORION_DIR/dados_portainer"
r="$(PORTAINER_USUARIO=""; PORTAINER_SENHA=""; portainer_do_orion >/dev/null; echo "$PORTAINER_DOMINIO|$PORTAINER_TOKEN|$PORTAINER_USUARIO|$PORTAINER_SENHA")"
assert_eq "painel.exemplo.com||dono|s1" "$r" "Orion sem token: usuário e senha"
printf '%s\n' '[ PORTAINER ]' 'Dominio do portainer: painel.exemplo.com' 'Token:' >"$ORION_DIR/dados_portainer"
# shellcheck disable=SC2030 # subshell de propósito, como em rodar_perguntas
r="$(PORTAINER_USUARIO=""; PORTAINER_SENHA=""; portainer_do_orion >/dev/null; echo "$PORTAINER_DOMINIO|$PORTAINER_TOKEN|$PORTAINER_USUARIO")"
assert_eq "||" "$r" "Orion sem credencial: ignorado (pergunta como antes)"
printf '%s\n' 'Dominio do portainer: "painel".x' 'Token: t' >"$ORION_DIR/dados_portainer"
r="$(portainer_do_orion >/dev/null; echo "$PORTAINER_DOMINIO|$PORTAINER_TOKEN")"
assert_eq "|" "$r" "domínio inválido: ignorado"
rm -f "$ORION_DIR/dados_portainer"
r="$(portainer_do_orion; echo "[$PORTAINER_DOMINIO]")"
assert_eq "[]" "$r" "sem dados_portainer: nada, sem mensagem"

# Portainer: HTTPS na 9443; só recusa, timeout ou nome sem resposta caem no HTTP da 9000.
for rc in 0 22 35 60; do
  assert_eq https://portainer_portainer:9443 "$(base_portainer "$rc")" "curl $rc na 9443: fica no HTTPS"
done
for rc in 6 7 28; do
  assert_eq http://portainer_portainer:9000 "$(base_portainer "$rc")" "curl $rc na 9443: cai no HTTP"
done
# shellcheck disable=SC2034 # lida dentro de config_portainer
PORTAINER_BASE=http://portainer_portainer:9000
case "$(config_portainer GET /api/stacks)" in *insecure*) r=nao ;; *) r=ok ;; esac
assert_eq ok "$r" "HTTP sem insecure"

# Atualização do Swarm: pausada ou voltada é falha; o resto espera ou segue.
for e in paused rollback_started rollback_paused rollback_completed; do
  assert_eq 0 "$(update_falhou "$e"; echo $?)" "update $e falhou"
done
for e in "" updating completed; do
  assert_eq 1 "$(update_falhou "$e"; echo $?)" "update [$e] não é falha"
done

# Saída com erro depois da migração com o CRM em 0: o trap avisa, não religa.
SAIDA="$(bash -c '. "$1"; set +e; CRM_PARADO=1; REPLICAS_ANTES=2; docker() { echo "docker $*"; }; exit 1' _ "$AQUI/instalar.sh" 2>&1)"
case "$SAIDA" in *"✗ O CRM está parado (0 réplicas)"*"banco já está migrado"*"rode o instalador de novo"*"docker service scale wakecrm_wakecrm=2"*) r=ok ;; *) r="$SAIDA" ;; esac
assert_eq ok "$r" "saída com erro e CRM parado: mensagem com as duas saídas"
case "$SAIDA" in *"docker service"*"docker service"*) r=religou ;; *) r=ok ;; esac
assert_eq ok "$r" "trap não escala nada sozinho"
assert_eq "" "$(bash -c '. "$1"; CRM_PARADO=1; REPLICAS_ANTES=2; exit 0' _ "$AQUI/instalar.sh" 2>&1)" "saída 0: sem aviso"
assert_eq "" "$(bash -c '. "$1"; set +e; REPLICAS_ANTES=2; exit 1' _ "$AQUI/instalar.sh" 2>&1)" "sem CRM_PARADO: sem aviso"

# Entrypoint HTTPS do Traefik: o que escuta na 443, em argumento ou label.
ARGS="$(printf '%s\n' --providers.swarm=true --entrypoints.web.address=:80 --entrypoints.websecure.address=:443 \
  --certificatesresolvers.le.acme.httpchallenge.entrypoint=web)"
assert_eq websecure "$(entrypoint_https "$ARGS")" "entrypoint da 443 nos argumentos"
assert_eq https "$(entrypoint_https '--entryPoints.https.address=0.0.0.0:443/tcp')" "entryPoints com host e /tcp"
assert_eq "" "$(entrypoint_https '--entrypoints.alt.address=:4430')" "4430 não é 443"
assert_eq "" "$(entrypoint_https '--entrypoints.web.address=:80')" "sem 443: vazio"
assert_eq tls "$(entrypoint_https 'traefik.entrypoints.tls.address=:443')" "entrypoint em label"

# Valores de fora que entram entre aspas no arquivo da stack.
# shellcheck disable=SC2016 # $ literal
for v in "" abc-123 'http://evolution_api:8080' 'a$b&c'; do
  assert_eq 0 "$(valor_seguro_stack "$v"; echo $?)" "valor [$v] serve na stack"
done
for v in 'a"b' 'a\b' "$(printf 'a\nb')" "$(printf 'a\rb')"; do
  assert_eq 1 "$(valor_seguro_stack "$v"; echo $?)" "valor com aspas, barra ou quebra é recusado"
done
saida="$( (SIM=1; X='chave"ruim'; exigir_valor_seguro X "Chave da API da Evolution") 2>&1)"
# shellcheck disable=SC2034 # lidas dentro de exigir_valor_seguro
assert_eq 1 "$( (SIM=1; X='chave"ruim'; exigir_valor_seguro X "Chave") >/dev/null 2>&1; echo $?)" "SIM com valor ruim: para"
case "$saida" in *"✗ Chave da API da Evolution inválido para a stack. Nada foi alterado."*) r=ok ;; *) r="$saida" ;; esac
assert_eq ok "$r" "mensagem diz qual valor e que nada mudou"
case "$saida" in *ruim*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "mensagem não mostra o valor"

# detectar com o Docker simulado: o que vem do serviço, do Orion e o que sobra.
# shellcheck disable=SC2329,SC2317 # docker simulado, chamado por detectar
docker() {
  local a="$*"
  case "$a" in
    "service ls --format"*) printf '%s\n' "pg_pg postgres:14" "tr_tr traefik:v3" ${EVO:+"evo_evo atendai/evolution-api:v2.3.7"} ;;
    *ContainerSpec.Env*) case "$a" in *pg_pg) printf '%s\n' "${ENV_PG:-}" ;; *evo_evo) printf '%s\n' "${ENV_EVO:-}" ;; esac ;;
    *ContainerSpec.Image*) echo postgres:14 ;;
    *ContainerSpec.Command*) printf '%s\n' --certificatesresolvers.le.acme.email=x --entrypoints.websecure.address=:443 ;;
    *TaskTemplate.Networks*) case "$a" in *pg_pg) [ "$REDES_PG" != FALHA ] || { echo "Error: erro real do docker" >&2; return 1; }; echo "$REDES_PG" ;; *tr_tr) echo "$REDES_TR" ;; *) echo n1 ;; esac ;;
    "network inspect --format {{.Name}} "*) echo "${a##* }" ;;
    "network inspect --format {{.Attachable}} "*) echo "${ATTACH:-true}" ;;
    "ps "*) [ "$PG_CONT" != FALHA ] || return 1; printf '%s\n' ${PG_CONT:+"$PG_CONT"} ;;
    "network inspect "*) case "${a##* }" in n1 | n2 | n3) ;; *) return 1 ;; esac ;;
    *) return 1 ;;
  esac
}
# rodar_detectar: detectar com WAKECRM_SIM numa subshell; imprime as variáveis decididas.
rodar_detectar() {
  (
    # shellcheck disable=SC2034 # lidas dentro de detectar
    SIM=1 CREDENCIAIS="${CRED_TESTE:-$TMP/sem-credenciais.env}" ORION_USADOS=""
    detectar >"$TMP/detectar.log" 2>&1 || exit $?
    printf '%s\n' "pg=$PG_USUARIO/$PG_SENHA ($PG_SENHA_ORIGEM)" "rede=$REDE ($REDE_ORIGEM)" \
      "evo=$EVOLUTION_URL ($EVOLUTION_URL_ORIGEM) chave=$EVOLUTION_API_KEY${EVOLUTION_API_KEY:+ ($EVOLUTION_API_KEY_ORIGEM)}" \
      "portainer=$PORTAINER_DOMINIO token=$PORTAINER_TOKEN" "orion=$ORION_USADOS" "attachable=$REDE_ATTACHABLE"
  )
}
PG_CONT=c1
ORION_DIR="$TMP/orion"
mkdir -p "$ORION_DIR"
printf '%s\n' '[DADOS DA VPS]' 'texto livre' 'Nome do Servidor: vps1' '' 'Rede interna: n2' '' 'Link do Portainer: https://painel.exemplo.com' >"$ORION_DIR/dados_vps"
printf '%s\n' '[ POSTGRES ]' '' 'Host: postgres' '' 'Port: 5432' '' 'Usuario: orion_pg' '' 'Senha: pg-orion' >"$ORION_DIR/dados_postgres"
printf '%s\n' '[ EVOLUTION API ]' '' 'Manager Evolution: https://evo.exemplo.com/manager' '' 'BaseUrl: https://evo.exemplo.com' '' 'Global API Key: chave-orion' >"$ORION_DIR/dados_evolution"
printf '%s\n' '[ EVOLUTION GO ]' '' 'BaseUrl: https://go.exemplo.com' '' 'Global API Key: chave-go' >"$ORION_DIR/dados_evolution_go"
printf '%s\n' '[ PORTAINER ]' 'Dominio do portainer: painel.exemplo.com' '' 'Usuario: dono' '' 'Senha: s1' '' 'Token: ptr_1' >"$ORION_DIR/dados_portainer"

# Serviço sem senha nem chave: Orion cobre; rede ambígua: vale a do Orion.
r="$(EVO=1 ENV_PG='' ENV_EVO='SERVER_PORT=8080' REDES_PG='n1 n2' REDES_TR='n1 n2' rodar_detectar)"
assert_eq "$(printf '%s\n' "pg=orion_pg/pg-orion (lida do Orion)" "rede=n2 (lida do Orion)" \
  "evo=http://evo_evo:8080 (detectada no serviço) chave=chave-orion (lida do Orion)" \
  "portainer=painel.exemplo.com token=ptr_1" "orion=dados_postgres dados_vps dados_evolution dados_portainer" "attachable=1")" "$r" \
  "detectar: Orion cobre senha, chave, rede ambígua e Portainer"
case "$(cat "$TMP/detectar.log")" in *pg-orion* | *chave-orion* | *ptr_1* | *"Senha: s1"*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "detectar não imprime segredo"
# Serviço completo: ele manda; o Orion só entra no que faltar.
r="$(EVO=1 ENV_PG="$(printf 'POSTGRES_USER=pgsvc\nPOSTGRES_PASSWORD=pg-svc')" ENV_EVO='AUTHENTICATION_API_KEY=chave-svc' \
  REDES_PG='n1 n2' REDES_TR='n2' rodar_detectar)"
assert_eq "$(printf '%s\n' "pg=pgsvc/pg-svc (lida do serviço)" "rede=n2 (única comum a Postgres e Traefik)" \
  "evo=http://evo_evo:8080 (detectada no serviço) chave=chave-svc (lida do serviço)" \
  "portainer=painel.exemplo.com token=ptr_1" "orion=dados_portainer" "attachable=1")" "$r" "detectar: o serviço vem antes do Orion"
# Sem serviço da Evolution: BaseUrl e chave do Orion; nunca a Evolution Go.
r="$(ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1' REDES_TR='n1' rodar_detectar | sed -n 3p)"
assert_eq "evo=https://evo.exemplo.com (lida do Orion) chave=chave-orion (lida do Orion)" "$r" "detectar: sem serviço, Evolution do Orion"
mv "$ORION_DIR/dados_evolution" "$TMP/dados_evolution.fora"
r="$(ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1' REDES_TR='n1' rodar_detectar | sed -n 3p)"
assert_eq "evo= (salva) chave=" "$r" "detectar: dados_evolution_go nunca é lido"
mv "$TMP/dados_evolution.fora" "$ORION_DIR/dados_evolution"
# Sem rede comum: para, mesmo com a Rede interna do Orion existindo (o CRM precisa dos dois).
assert_eq 1 "$(ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1' REDES_TR='n3' rodar_detectar >/dev/null; echo $?)" "sem rede comum: para mesmo com Orion"
case "$(cat "$TMP/detectar.log")" in *"não compartilham nenhuma rede"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "sem rede comum: diz por quê"
# Rede ambígua: a salva vem antes da do Orion.
printf 'REDE=n1\n' >"$TMP/cred-rede.env"
r="$(CRED_TESTE="$TMP/cred-rede.env" ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1 n2' REDES_TR='n1 n2' rodar_detectar | sed -n 2p)"
assert_eq "rede=n1 (salva)" "$r" "rede ambígua: a salva antes do Orion"
# Erro do Docker ao ler as redes: para mostrando o erro real.
assert_eq 1 "$(ENV_PG='POSTGRES_PASSWORD=x' REDES_PG=FALHA REDES_TR='n1' rodar_detectar >/dev/null; echo $?)" "redes ilegíveis: para"
case "$(cat "$TMP/detectar.log")" in *"erro real do docker"*"Não consegui ler as redes do serviço pg_pg"*) r=ok ;; *) r="$(cat "$TMP/detectar.log")" ;; esac
assert_eq ok "$r" "redes ilegíveis: erro do Docker aparece"
# Usuário do Postgres com aspas (aqui do Orion): para antes da confirmação.
printf '%s\n' 'Usuario: pg"mau' 'Senha: x' >"$TMP/dados_postgres.mau"
mv "$ORION_DIR/dados_postgres" "$TMP/dados_postgres.bom"
mv "$TMP/dados_postgres.mau" "$ORION_DIR/dados_postgres"
assert_eq 1 "$(ENV_PG='' REDES_PG='n1' REDES_TR='n1' rodar_detectar >/dev/null; echo $?)" "usuário do Postgres com aspas: para"
case "$(cat "$TMP/detectar.log")" in *"Usuário do Postgres inválido para a stack"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "usuário do Postgres inválido: mensagem"
mv "$TMP/dados_postgres.bom" "$ORION_DIR/dados_postgres"
# Sem Orion: como antes (rede ambígua fica com a primeira; sem senha no serviço, para).
ORION_DIR="$TMP/sem-orion"
r="$(ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1 n2' REDES_TR='n1 n2' rodar_detectar)"
assert_eq "$(printf '%s\n' "pg=postgres/x (lida do serviço)" "rede=n1 (escolhida)" "evo= (salva) chave=" "portainer= token=" "orion=" "attachable=1")" "$r" \
  "detectar sem Orion: comportamento antigo"
assert_eq 1 "$(ENV_PG='' REDES_PG='n1' REDES_TR='n1' rodar_detectar >/dev/null; echo $?)" "sem Orion e sem senha no serviço: para"
assert_eq 1 "$(ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1' REDES_TR='n3' rodar_detectar >/dev/null; echo $?)" "sem Orion e sem rede comum: para"
# Rede não attachable (NovaNet do Orion): segue; os contêineres temporários vão pela rede do Postgres.
r="$(ATTACH=false ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1' REDES_TR='n1' rodar_detectar | sed -n '2p;6p' | tr '\n' ' ')"
assert_eq "rede=n1 (única comum a Postgres e Traefik) attachable= " "$r" "rede não attachable: não para"
case "$(cat "$TMP/detectar.log")" in *"rede: n1 (não attachable)"*"jobs temporários: rede do contêiner do Postgres (127.0.0.1)"*) r=ok ;; *) r="$(cat "$TMP/detectar.log")" ;; esac
assert_eq ok "$r" "rede não attachable: diz como os jobs chegam ao Postgres"
# Postgres sem contêiner neste nó: para antes da confirmação.
assert_eq 1 "$(PG_CONT="" ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1' REDES_TR='n1' rodar_detectar >/dev/null; echo $?)" "Postgres em outro nó: para"
case "$(cat "$TMP/detectar.log")" in *"Rode o instalador no nó onde o Postgres roda. Nada foi alterado."*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "Postgres em outro nó: diz por quê"
assert_eq 1 "$(PG_CONT=FALHA ENV_PG='POSTGRES_PASSWORD=x' REDES_PG='n1' REDES_TR='n1' rodar_detectar >/dev/null; echo $?)" "docker ps falhou: para"
case "$(cat "$TMP/detectar.log")" in *"docker ps falhou ao procurar o contêiner do Postgres"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "docker ps falhou: não confunde com Postgres em outro nó"
unset -f docker

# perguntas: sem domínio do Portainer e com REDE não attachable, a API fica de fora.
rodar_perguntas() {
  (
    # shellcheck disable=SC2034 # lidas dentro de perguntas
    SIM=1 WAKECRM_DOMINIO=crm.exemplo.com WAKECRM_INSTANCIA=wakeclub CREDENCIAIS="$TMP/sem-credenciais.env" \
      PORTAINER_DOMINIO="" PORTAINER_SERVICO=portainer_portainer REDE=n1 WAKECRM_PORTAINER_USUARIO=dono WAKECRM_PORTAINER_SENHA=s1
    perguntas >"$TMP/perguntas.log" 2>&1
    # shellcheck disable=SC2031 # definida por perguntas nesta mesma subshell
    printf '%s|%s\n' "$PORTAINER_USUARIO" "$(texto_publicacao)"
  )
}
assert_eq "|docker stack deploy" "$(REDE_ATTACHABLE="" rodar_perguntas)" "rede não attachable sem domínio: docker stack deploy"
case "$(cat "$TMP/perguntas.log")" in *"A rede n1 não é attachable"*"docker stack deploy"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "rede não attachable sem domínio: avisa"
assert_eq "dono|API do Portainer (usuário dono)" "$(REDE_ATTACHABLE=1 rodar_perguntas)" "rede attachable: API do Portainer pela overlay"

# padrao_postgres: com mais de um Postgres, sugere o salvo, depois o do Host do Orion.
assert_eq postgres_postgres "$(padrao_postgres postgres "" pgvector_pgvector postgres_postgres)" "Orion postgres: postgres_postgres"
assert_eq pgvector_pgvector "$(padrao_postgres postgres pgvector_pgvector postgres_postgres pgvector_pgvector)" "salvo vence o Orion"
assert_eq postgres_postgres "$(padrao_postgres postgres "" x_postgres postgres_postgres)" "Host_Host vence um _Host anterior"
assert_eq x "$(padrao_postgres 'pg.*' "" x pg_pg y_pgz)" "Host com curinga casa só literal"
assert_eq 'y_pg.*' "$(padrao_postgres 'pg.*' "" x 'y_pg.*')" "Host com curinga: sufixo literal casa"
assert_eq postgres "$(padrao_postgres postgres "" postgres_postgres postgres)" "nome igual ao Host vem primeiro"
assert_eq banco_postgres "$(padrao_postgres postgres "" pgvector_pgvector banco_postgres)" "serviço terminado em _Host"
assert_eq x "$(padrao_postgres postgres "" x meupostgres)" "sem _ antes do Host não casa: o primeiro"
assert_eq pgvector_pgvector "$(padrao_postgres "" pgvector_pgvector postgres_postgres pgvector_pgvector)" "sem Orion: o salvo"
assert_eq postgres_postgres "$(padrao_postgres "" sumiu postgres_postgres pgvector_pgvector)" "salvo que não é candidato: o primeiro"
assert_eq salvo "$(padrao_postgres postgres salvo)" "sem candidatos: o salvo"
assert_eq postgres "$(padrao_postgres postgres "")" "sem candidatos nem salvo: o Host do Orion"
# detectar com dois Postgres e WAKECRM_SIM: fica com o do Orion.
# shellcheck disable=SC2329,SC2317 # docker simulado, chamado por detectar
docker() {
  case "$*" in
    "service ls --format"*) printf '%s\n' "pgvector_pgvector pgvector/pgvector:pg16" "postgres_postgres postgres:14" "tr_tr traefik:v3" ;;
    *ContainerSpec.Env*) echo POSTGRES_PASSWORD=x ;;
    *) return 1 ;;
  esac
}
mkdir -p "$TMP/orion-pg"
printf 'Host: postgres\n' >"$TMP/orion-pg/dados_postgres"
# O docker simulado para detectar depois do Postgres; a escolha sai na linha do ✓.
# shellcheck disable=SC2034 # lidas dentro de detectar
r="$( (SIM=1 ORION_DIR="$TMP/orion-pg" CREDENCIAIS="$TMP/sem-credenciais.env"; detectar 2>&1) | sed -n 's/^✓ Postgres: //p')"
assert_eq postgres_postgres "$r" "detectar com dois Postgres: o do Orion, não o primeiro"
unset -f docker

# texto_publicacao: o resumo diz por onde a stack sai, sem segredo.
# shellcheck disable=SC2034 # lidas dentro de texto_publicacao
{ PORTAINER_DOMINIO=painel.exemplo.com; PORTAINER_TOKEN=ptr_1; PORTAINER_USUARIO=dono; }
assert_eq "API do Portainer em https://painel.exemplo.com (token do Orion)" "$(texto_publicacao)" "resumo: token do Orion"
# shellcheck disable=SC2034
PORTAINER_TOKEN=""
assert_eq "API do Portainer em https://painel.exemplo.com (usuário dono, do Orion)" "$(texto_publicacao)" "resumo: usuário do Orion"
# shellcheck disable=SC2034
PORTAINER_DOMINIO=""
assert_eq "API do Portainer (usuário dono)" "$(texto_publicacao)" "resumo: usuário digitado"
# shellcheck disable=SC2034
PORTAINER_USUARIO=""
assert_eq "docker stack deploy" "$(texto_publicacao)" "resumo: sem Portainer"

# checar_dependentes: lista os objetos e para; vazio segue; erro na consulta para.
# shellcheck disable=SC2329 # sql_pg chamada por checar_dependentes
saida="$( (sql_pg() { printf 'rule _RETURN on view public.v_leads\nconstraint p_fk on table outro.pedidos\n'; }; checar_dependentes) 2>&1)"
case "$saida" in *"✗ Objetos fora do schema wakeclub dependem dele:"*"    - rule _RETURN on view public.v_leads"*"    - constraint p_fk on table outro.pedidos"*"drop schema wakeclub cascade"*"Nada foi alterado."*) r=ok ;; *) r="$saida" ;; esac
assert_eq ok "$r" "dependentes listados, um por linha, e parada"
# shellcheck disable=SC2329
assert_eq 1 "$( (sql_pg() { printf 'x\n'; }; checar_dependentes) >/dev/null 2>&1; echo $?)" "com dependente: sai 1"
# shellcheck disable=SC2329
r="$( (sql_pg() { printf '%s' "$1"; }; checar_dependentes) 2>&1)"
case "$r" in *pg_identify_object*"deptype in ('n', 'a')"*"is distinct from 'wakeclub'"*) r=ok ;; esac
assert_eq ok "$r" "consulta genérica por pg_depend"
# shellcheck disable=SC2329
assert_eq 0 "$( (sql_pg() { :; }; checar_dependentes) >/dev/null 2>&1; echo $?)" "sem dependentes: segue"
# shellcheck disable=SC2329
assert_eq 1 "$( (sql_pg() { return 2; }; checar_dependentes) >/dev/null 2>&1; echo $?)" "consulta falhou: para"

# Resumo final: URLs sem segredo, scp pronto com backup; sem backup diz nenhum.
# shellcheck disable=SC2034 # lidas dentro de texto_resumo
{ BACKUP=/root/wakecrm/backups/w.dump; CREDENCIAIS=/root/wakecrm/credenciais.env; }
RES="$(texto_resumo 203.0.113.5)"
case "$RES" in *"https://crm.exemplo.com/api/webhooks/evolution"*"scp root@203.0.113.5:/root/wakecrm/backups/w.dump ."*) r=ok ;; *) r="$RES" ;; esac
assert_eq ok "$r" "resumo com webhook e scp"
case "$RES" in *s2* | *s3* | *token*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "resumo sem segredo"
# shellcheck disable=SC2034 # lida dentro de texto_resumo
BACKUP=""
case "$(texto_resumo x)" in *"Backup             nenhum"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "resumo sem backup"
# shellcheck disable=SC2034 # lida dentro de texto_resumo
BACKUP=/b/w.dump
case "$(texto_resumo 2804:389::1)" in *"scp root@[2804:389::1]:/b/w.dump ."*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "IPv6 entre colchetes no scp"

# Guard do main (o trecho real do fim do instalar.sh): roda quando executado,
# inclusive por /dev/fd como em `bash <(curl ...)`, e não quando carregado com `.`.
GUARD="$(tail -n 3 "$AQUI/instalar.sh" | sed 's/main "\$@"/echo main/')"
assert_eq main "$(bash <(printf '%s\n' "$GUARD"))" "bash <(...) roda main"
assert_eq "" "$(GUARD="$GUARD" bash -c '. <(printf "%s\n" "$GUARD")')" "carregado com . não roda main"

echo "todos os $N testes passaram"
