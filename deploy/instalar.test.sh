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

# Publicação: modelo real preenchido, sem segredo do superusuário e com $ dobrado.
# shellcheck disable=SC2034,SC2016 # lidas por nome em arquivo_env; $ literal de propósito
{
  IMAGEM=img:1 DOMINIO=crm.exemplo.com REDE=rede CERTRESOLVER=le DATABASE_URL=u1 DATABASE_URL_RW=u2
  DATABASE_URL_MOTOR=u3 VITE_VAPID_PUBLIC_KEY=p VAPID_PRIVATE_KEY=v PUSH_DISPATCH_SECRET=s1
  WEBHOOK_EVOLUTION_SECRET=s2 WEBHOOK_VENDAS_SECRET=s3 EVOLUTION_INSTANCIA=wakeclub EVOLUTION_URL=http://evo:8080
  EVOLUTION_API_KEY='a$b' ADMIN_DATABASE_URL=postgres://postgres:superu@pg/wakeclub
}
# shellcheck disable=SC2086
ENV_STACK="$(arquivo_env $CHAVES_STACK)"
PUB="$(stack_publicavel "$AQUI/wakecrm-stack.yml" "$ENV_STACK")"
assert_eq 0 "$?" "modelo real preenche com CHAVES_STACK"
case "$PUB" in *superu* | *ADMIN_DATABASE_URL*) r=vazou ;; *) r=ok ;; esac
assert_eq ok "$r" "stack sem a URL do superusuário"
case "$PUB" in *"image: img:1"*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "stack usa IMAGEM"
# shellcheck disable=SC2016 # $ literal
case "$PUB" in *'EVOLUTION_API_KEY=a$$b"'*) r=ok ;; *) r=nao ;; esac
assert_eq ok "$r" "\$ do valor vira \$\$ (docker stack deploy interpola)"
# shellcheck disable=SC2016 # $ literal
assert_eq "" "$(printf '%s\n' "$PUB" | grep -o '\${[A-Za-z_]*}')" "nenhum marcador sobra"

# json_texto: escapes de string JSON.
assert_eq '"a\"b\\c\td\nl2"' "$(printf 'a"b\\c\td\nl2\n' | json_texto)" "json_texto escapa aspas, barra, tab e linha"
assert_eq '""' "$(printf '' | json_texto)" "json_texto vazio"

# Respostas da API do Portainer.
assert_eq tok.x-y "$(jwt_portainer '{"jwt":"tok.x-y"}')" "jwt da resposta de /api/auth"
assert_eq 3 "$(primeiro_id '[{"Id":3,"Name":"primary","Snapshots":[{"Id":9}]},{"Id":4}]')" "primeiro endpoint"
assert_eq "" "$(primeiro_id '[]')" "sem endpoint: vazio"
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
