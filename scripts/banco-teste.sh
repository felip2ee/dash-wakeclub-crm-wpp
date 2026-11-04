#!/usr/bin/env bash
# Sobe um Postgres 14 descartável para os testes de banco (bun run test:db).
#
# Contêiner `wakecrm-teste` na porta 54339 (NOME e PORTA pelo ambiente), banco `wakeclub`, senha `teste` em todas as
# roles. Recria do zero a cada execução. Nunca aponte isto para produção.
set -euo pipefail

cd "$(dirname "$0")/.."
NOME=${NOME:-wakecrm-teste}
PORTA=${PORTA:-54339}

docker rm -f "$NOME" >/dev/null 2>&1 || true
docker run -d --name "$NOME" -p "127.0.0.1:$PORTA:5432" \
  -e POSTGRES_PASSWORD=teste -e POSTGRES_DB=wakeclub postgres:14-alpine >/dev/null

for _ in $(seq 1 30); do
  docker exec "$NOME" pg_isready -U postgres -d wakeclub >/dev/null 2>&1 && break
  sleep 1
done

# A role de leitura e a limitada de escrita do painel, com os grants mínimos que os
# testes usam para preparar dados (espelham scripts/painel-db.mjs).
docker exec -i "$NOME" psql -q -v ON_ERROR_STOP=1 -U postgres -d wakeclub <<'SQL'
create role painel_ro login password 'teste';
create role painel_rw login password 'teste';
SQL

migrar() {
  ADMIN_DATABASE_URL="postgres://postgres:teste@localhost:$PORTA/wakeclub" \
    WAKECRM_MOTOR_PASSWORD=teste node scripts/migrar.mjs "$@"
}

# v_followups_fila vive só em produção; o stub (só as colunas que o push do motor lê)
# precisa existir antes da 0002 para ela conceder o select à wakecrm_motor.
migrar --ate 0001
docker exec -i "$NOME" psql -q -v ON_ERROR_STOP=1 -U postgres -d wakeclub <<'SQL'
create view wakeclub.v_followups_fila as
select f.id as followup_id, l.atendente_id
  from wakeclub.followups f
  join wakeclub.leads l on l.id = f.lead_id
 where f.status = 'pendente';
SQL
migrar

# 0001 e 0002 precisam ser idempotentes: reaplicar por cima do banco migrado não pode falhar.
for arquivo in db/migrations/0001_base.sql db/migrations/0002_motor.sql; do
  docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$NOME" psql -q -v ON_ERROR_STOP=1 -U postgres -d wakeclub \
    -c "set search_path to wakeclub, public" -f - <"$arquivo" >/dev/null
done

# Sem a role do motor, a 0002 tem de falhar alto (senão fica registrada sem grant).
# Tudo numa transação revertida: a role volta ao nome original.
if saida=$( { echo "alter role wakecrm_motor rename to wakecrm_motor_ausente;"; cat db/migrations/0002_motor.sql; } |
  docker exec -i "$NOME" psql -q -1 -v ON_ERROR_STOP=1 -U postgres -d wakeclub \
    -c "set search_path to wakeclub, public" -f - 2>&1); then
  echo "0002 aplicou sem a role wakecrm_motor; esperava erro" >&2
  exit 1
fi
grep -q "Crie a role wakecrm_motor antes" <<<"$saida" || { echo "$saida" >&2; exit 1; }

docker exec -i "$NOME" psql -q -v ON_ERROR_STOP=1 -U postgres -d wakeclub <<'SQL'
grant usage on schema wakeclub to painel_ro, painel_rw;
grant select on wakeclub.usuarios to painel_rw;
grant insert (nome, usuario, senha_hash, label_id) on wakeclub.usuarios to painel_rw;
grant update (ativo, ultimo_acesso_em) on wakeclub.usuarios to painel_rw;
grant insert on wakeclub.followup_toques to painel_rw;
SQL

echo "banco de teste pronto em localhost:$PORTA"
