// One-off repair: give the history back the gains earlier rebuilds wiped.
//
// Before snapshots recorded each holding's gain, every rebuild valued managed
// accounts, plazos, FCI and cash at contributed capital on every past day, so
// all their earnings collapsed onto "today". Those daily values are gone; this
// estimates them by growing each holding's current gain in a straight line from
// its first transaction to today, then rebuilds so the chart picks them up.
//
// Only portfolio_snapshots is touched. Assets and transactions are read, never
// written. Before anything changes, the whole table is copied to
// portfolio_snapshots_backup, and `--undo` puts that copy back verbatim.
//
// Usage (from the project root; the target DB comes from TURSO_DATABASE_URL /
// TURSO_AUTH_TOKEN, and --local is required to run on data/portfolio.db):
//   npx tsx --env-file=.env.production.local scripts/estimate-past-gains.ts         # backup + estimate
//   npx tsx --env-file=.env.production.local scripts/estimate-past-gains.ts --undo  # restore the backup

import getDb from "../src/lib/db";
import { today } from "../src/lib/dates";
import { autoSnapshot } from "../src/lib/snapshot";
import { rebuildHistory } from "../src/lib/backfill";

const BACKUP = "portfolio_snapshots_backup";

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
}

async function tableExists(name: string): Promise<boolean> {
  const db = await getDb();
  const row = await db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return row != null;
}

async function undo() {
  const db = await getDb();
  if (!(await tableExists(BACKUP))) {
    console.log("No hay respaldo para restaurar. Nada que hacer.");
    return;
  }
  const { n } = (await db.prepare(`SELECT COUNT(*) AS n FROM ${BACKUP}`).get()) as { n: number };
  await db.batch([
    { sql: "DELETE FROM portfolio_snapshots" },
    { sql: `INSERT INTO portfolio_snapshots SELECT * FROM ${BACKUP}` },
  ]);
  console.log(`Restaurados ${n} puntos del gráfico desde el respaldo.`);
  console.log(`El respaldo (${BACKUP}) se deja en la base por si hace falta otra vez.`);
}

async function estimate() {
  const db = await getDb();

  // 1) Backup. Never overwritten: a second run must not replace the original
  //    copy with an already-estimated one.
  if (await tableExists(BACKUP)) {
    console.log(`Ya existe ${BACKUP}: se conserva el respaldo original.`);
  } else {
    await db.prepare(`CREATE TABLE ${BACKUP} AS SELECT * FROM portfolio_snapshots`).run();
    const { n } = (await db.prepare(`SELECT COUNT(*) AS n FROM ${BACKUP}`).get()) as { n: number };
    console.log(`Respaldo creado: ${n} puntos copiados a ${BACKUP}.`);
  }

  // 2) Today's live snapshot is the anchor: it holds each holding's real gain.
  await autoSnapshot();
  const day = today();
  const anchor = (await db
    .prepare("SELECT asset_gains FROM portfolio_snapshots WHERE date = ?")
    .get(day)) as { asset_gains: string | null } | undefined;
  if (!anchor?.asset_gains) {
    throw new Error("No se pudo tomar el snapshot de hoy; no se cambió nada salvo el respaldo.");
  }
  const current: Record<string, number> = JSON.parse(anchor.asset_gains);

  // 3) First transaction per holding: where its gain starts from zero.
  const firsts = (await db
    .prepare("SELECT asset_id, MIN(date) AS first FROM transactions GROUP BY asset_id")
    .all()) as Array<{ asset_id: number; first: string }>;
  const firstOf = new Map(firsts.map((r) => [String(r.asset_id), r.first.split("T")[0]]));

  // 4) Interpolate into every earlier day. A gain already on record for a day
  //    is real and wins over the estimate.
  const rows = (await db
    .prepare("SELECT date, asset_gains FROM portfolio_snapshots WHERE date < ? ORDER BY date")
    .all(day)) as Array<{ date: string; asset_gains: string | null }>;

  const stmts: { sql: string; args: (string | number)[] }[] = [];
  for (const row of rows) {
    const recorded: Record<string, number> = row.asset_gains ? JSON.parse(row.asset_gains) : {};
    const gains: Record<string, number> = {};
    for (const [id, g] of Object.entries(current)) {
      const first = firstOf.get(id);
      if (!first || row.date < first) continue;
      const span = daysBetween(first, day);
      gains[id] = span > 0 ? Math.round((g * daysBetween(first, row.date)) / span) : g;
    }
    Object.assign(gains, recorded);
    stmts.push({
      sql: "UPDATE portfolio_snapshots SET asset_gains = ? WHERE date = ?",
      args: [JSON.stringify(gains), row.date],
    });
  }
  await db.batch(stmts);
  console.log(`Ganancia estimada en ${stmts.length} días.`);

  // 5) Rebuild so values and costs pick the gains up.
  const { days } = await rebuildHistory();
  console.log(`Historial reconstruido: ${days} días.`);
  console.log("Si no te convence: npx tsx scripts/estimate-past-gains.ts --undo");
}

// Without Turso settings getDb() silently falls back to the local file, so an
// env file that came back empty would "succeed" against the wrong database.
const target = process.env.TURSO_DATABASE_URL;
if (!target && !process.argv.includes("--local")) {
  console.error("TURSO_DATABASE_URL está vacío. Abortando (usá --local para la base local).");
  process.exit(1);
}
console.log("Base:", target ?? "local (data/portfolio.db)");

(process.argv.includes("--undo") ? undo() : estimate()).catch((err) => {
  console.error(err);
  process.exit(1);
});
