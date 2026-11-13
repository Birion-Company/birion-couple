import type mysql from "mysql2/promise";

/** Opções que o app espera do driver (iguais no app, nas migrações e nos scripts). */
export function mysqlPoolOptions(url: string, max = 5): mysql.PoolOptions {
  return {
    uri: url,
    connectionLimit: max,
    charset: "utf8mb4",
    timezone: "Z",
    // Datas chegam como texto "AAAA-MM-DD" / "AAAA-MM-DD hh:mm:ss.mmm" (UTC); o Drizzle converte.
    dateStrings: true,
    // SUM/AVG voltam como DECIMAL; queremos número, não texto.
    decimalNumbers: true,
    // Várias consultas por requisição em paralelo: sem fila artificial.
    waitForConnections: true,
  };
}

/** Prepara cada conexão nova: horário UTC e aspas duplas como nome de coluna (o SQL do app usa "coluna"). */
export function prepareConnection(pool: mysql.Pool) {
  pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00', sql_mode = CONCAT(@@sql_mode, ',ANSI_QUOTES')");
  });
}

