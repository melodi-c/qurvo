import type { ClickHouseClient, ClickHouseSettings } from '@clickhouse/client';
import type { QueryNode } from '@qurvo/ch-query';
import { compile } from '@qurvo/ch-query';

/**
 * Thin wrapper around `ClickHouseClient` that accepts `QueryNode` ASTs
 * and eliminates the repetitive compile -> query -> json boilerplate.
 *
 * Every query uses `JSONEachRow` format (the only format used in production).
 */
export class ChQueryExecutor {
  constructor(private readonly ch: ClickHouseClient) {}

  /**
   * Execute a query and return all rows.
   *
   * Compiles the AST, sends a parameterised query to ClickHouse,
   * and deserialises the response as `T[]`.
   */
  async rows<T>(node: QueryNode): Promise<T[]> {
    const { sql, params } = compile(node);
    const result = await this.ch.query({
      query: sql,
      query_params: params,
      format: 'JSONEachRow',
    });
    return result.json<T>();
  }

  /**
   * Execute a query and return the first row, or `null` when the result
   * set is empty.
   */
  async one<T>(node: QueryNode): Promise<T | null> {
    const rows = await this.rows<T>(node);
    return rows[0] ?? null;
  }

  /**
   * Execute a query that returns a single numeric aggregate.
   *
   * @param node  - The query AST.
   * @param field - Column name that holds the count (default `"cnt"`).
   * @returns The numeric value, or `0` when the result set is empty.
   */
  async count(node: QueryNode, field = 'cnt'): Promise<number> {
    const row = await this.one<Record<string, string>>(node);
    return row ? Number(row[field]) : 0;
  }

  /**
   * Execute `INSERT INTO <table> (<columns>) SELECT ...` from an AST node.
   *
   * Compiles the SELECT node, prepends the INSERT clause, and runs via
   * `ch.command()`. Accepts optional ClickHouse settings (e.g. timeouts).
   */
  async insertFromSelect(
    table: string,
    columns: string[],
    selectNode: QueryNode,
    settings?: ClickHouseSettings,
  ): Promise<void> {
    const { sql, params } = compile(selectNode);
    const insertSql = `INSERT INTO ${table} (${columns.join(', ')}) ${sql}`;
    await this.ch.command({
      query: insertSql,
      query_params: params,
      clickhouse_settings: settings,
    });
  }
}
