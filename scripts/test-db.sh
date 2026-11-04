#!/usr/bin/env bash
# Roda os testes de banco contra o Postgres de scripts/banco-teste.sh (mesma PORTA).
set -euo pipefail
cd "$(dirname "$0")/.."
PORTA=${PORTA:-54339}
H="localhost:$PORTA/wakeclub"
TESTE_BANCO=1 \
ADMIN_DATABASE_URL="postgres://postgres:teste@$H" \
DATABASE_URL="postgres://painel_ro:teste@$H" \
DATABASE_URL_RW="postgres://painel_rw:teste@$H" \
DATABASE_URL_MOTOR="postgres://wakecrm_motor:teste@$H" \
bun test "$@"
