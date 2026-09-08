import pg from 'pg';

const { Pool, types } = pg;

// DATE columns (OID 1082) come back as JS Date objects by default,
// parsed at local midnight and then serialized to UTC — a 2026-09-10
// row can round-trip as "2026-09-09T21:00:00.000Z". Financial dates
// must not shift, so keep them as the raw "YYYY-MM-DD" string instead.
types.setTypeParser(1082, (val) => val);

export const pool = new Pool({
  database: 'saldovio_dev',
});
