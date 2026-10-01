#!/bin/sh
set -eu

if [ -z "${WAYLOOM_APP_PASSWORD:-}" ]; then
  echo "WAYLOOM_APP_PASSWORD is required to create the application role." >&2
  exit 1
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_password="$WAYLOOM_APP_PASSWORD" <<'SQL'
CREATE ROLE wayloom_app
  LOGIN
  PASSWORD :'app_password'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT;
CREATE DATABASE wayloom_development OWNER wayloom_app;
CREATE DATABASE wayloom_test OWNER wayloom_app;
REVOKE ALL ON DATABASE wayloom_development FROM PUBLIC;
REVOKE ALL ON DATABASE wayloom_test FROM PUBLIC;
GRANT CONNECT, TEMP ON DATABASE wayloom_development TO wayloom_app;
GRANT CONNECT, TEMP ON DATABASE wayloom_test TO wayloom_app;
SQL
