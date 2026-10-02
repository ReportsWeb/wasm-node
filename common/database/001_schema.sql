BEGIN;
CREATE TABLE IF NOT EXISTS reports_sample_rows (
  sample_key varchar(40) NOT NULL,
  row_no integer NOT NULL CHECK (row_no >= 1),
  label text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (sample_key, row_no)
);
COMMIT;
