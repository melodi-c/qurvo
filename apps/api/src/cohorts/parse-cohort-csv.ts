import { parse } from 'csv-parse/sync';

interface ParsedCohortCsv {
  idType: 'distinct_id' | 'email';
  ids: string[];
}

const DISTINCT_ID_HEADERS = /^(distinct_id|id|person_id|user_id)$/i;
const EMAIL_HEADERS = /^(email|e-mail)$/i;

export function parseCohortCsv(content: string): ParsedCohortCsv {
  const records: string[][] = parse(content, {
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });

  if (records.length === 0) {
    return { idType: 'distinct_id', ids: [] };
  }

  const firstValue = records[0][0];
  let idType: 'distinct_id' | 'email' = 'distinct_id';
  let startRow = 0;

  if (DISTINCT_ID_HEADERS.test(firstValue)) {
    idType = 'distinct_id';
    startRow = 1;
  } else if (EMAIL_HEADERS.test(firstValue)) {
    idType = 'email';
    startRow = 1;
  }

  const ids = records
    .slice(startRow)
    .map((row) => row[0])
    .filter(Boolean);

  return { idType, ids };
}
