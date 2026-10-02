#!/usr/bin/env sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE reports_sample_print_documents (
  sample_key text PRIMARY KEY,
  print_data jsonb NOT NULL
);
SQL

for source in /sample-print-data/*.json; do
  key=$(basename "$source" .json)
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
    --set=sample_key="$key" --set=source_path="$source" <<'SQL'
INSERT INTO reports_sample_print_documents(sample_key, print_data)
VALUES (:'sample_key', pg_read_file(:'source_path')::jsonb);
SQL
done
