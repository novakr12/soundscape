import postgres, { type Sql } from "postgres";

export function createPostgres() {
  return postgres(process.env.DATABASE_URL ?? "postgres://soundscape:soundscape@localhost:5432/soundscape", {
    max: 8,
    idle_timeout: 20,
    max_lifetime: 900,
    onnotice: () => {},
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (value: number) => String(value),
        parse: (value: string) => Number(value),
      },
    },
  });
}

export type JSONValue = Parameters<Sql["json"]>[0];

const globalForPostgres = globalThis as unknown as { sql?: Sql };

export const sql = globalForPostgres.sql ?? createPostgres();

if (process.env.NODE_ENV !== "production") globalForPostgres.sql = sql;
