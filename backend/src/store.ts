import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Pool } from "pg";

type Entry = { id: string; userId?: string };
export class Store {
  readonly pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL })
    : null;
  private db: DatabaseSync | null = null;
  async init() {
    if (this.pool) {
      await this.pool.query(`CREATE TABLE IF NOT EXISTS civic_records (
        kind text NOT NULL, id text NOT NULL, user_id text, record jsonb NOT NULL,
        PRIMARY KEY(kind,id)); CREATE UNIQUE INDEX IF NOT EXISTS civic_records_email ON civic_records(lower(record->>'email')) WHERE kind='user'; CREATE INDEX IF NOT EXISTS civic_records_owner ON civic_records(kind,user_id);`);
      // Import records from the original schema once; never overwrite newer records.
      for (const [table, kind, expression, owner] of [
        [
          "civic_users",
          "user",
          "jsonb_build_object('id',id,'name',name,'email',email,'passwordHash',password_hash,'role',role)",
          "id",
        ],
        ["civic_applications", "application", "payload", "user_id"],
      ]) {
        const exists = await this.pool.query("SELECT to_regclass($1) AS name", [
          table,
        ]);
        if (exists.rows[0].name)
          await this.pool.query(
            `INSERT INTO civic_records(kind,id,user_id,record) SELECT $1,id,${owner},${expression} FROM ${table} ON CONFLICT DO NOTHING`,
            [kind],
          );
      }
    } else {
      const path = resolve(process.env.DATA_DIR || "data", "civicflow.sqlite");
      mkdirSync(dirname(path), { recursive: true });
      this.db = new DatabaseSync(path);
      this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
        CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,user_id TEXT,record TEXT NOT NULL,PRIMARY KEY(kind,id));
        CREATE UNIQUE INDEX IF NOT EXISTS records_email ON records(lower(json_extract(record,'$.email'))) WHERE kind='user';
        CREATE INDEX IF NOT EXISTS records_owner ON records(kind,user_id);`);
    }
  }
  async list<T>(kind: string, userId?: string): Promise<T[]> {
    if (this.pool) {
      const result = await this.pool.query(
        `SELECT record FROM civic_records WHERE kind=$1${userId ? " AND user_id=$2" : ""}`,
        userId ? [kind, userId] : [kind],
      );
      return result.rows.map((row) => row.record as T);
    }
    const rows = userId
      ? this.db!.prepare(
          "SELECT record FROM records WHERE kind=? AND user_id=?",
        ).all(kind, userId)
      : this.db!.prepare("SELECT record FROM records WHERE kind=?").all(kind);
    return rows.map((row) => JSON.parse(row.record as string) as T);
  }
  async get<T>(kind: string, id: string): Promise<T | undefined> {
    if (this.pool)
      return (
        await this.pool.query(
          "SELECT record FROM civic_records WHERE kind=$1 AND id=$2",
          [kind, id],
        )
      ).rows[0]?.record;
    const row = this.db!.prepare(
      "SELECT record FROM records WHERE kind=? AND id=?",
    ).get(kind, id);
    return row ? (JSON.parse(row.record as string) as T) : undefined;
  }
  async put<T extends Entry>(kind: string, record: T) {
    if (this.pool)
      await this.pool.query(
        `INSERT INTO civic_records(kind,id,user_id,record) VALUES($1,$2,$3,$4)
      ON CONFLICT(kind,id) DO UPDATE SET user_id=excluded.user_id,record=excluded.record`,
        [kind, record.id, record.userId || record.id, record],
      );
    else
      this.db!.prepare(
        `INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET user_id=excluded.user_id,record=excluded.record`,
      ).run(
        kind,
        record.id,
        record.userId || record.id,
        JSON.stringify(record),
      );
  }
  async close() {
    this.db?.close();
    await this.pool?.end();
  }
}
