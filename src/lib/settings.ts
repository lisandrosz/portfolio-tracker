import type { Db } from "./db";
import type { Asset } from "@/types";

export async function getSetting(db: Db, key: string): Promise<string | null> {
  const row = (await db.prepare("SELECT value FROM settings WHERE key = ?").get(key)) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export async function setSetting(db: Db, key: string, value: string) {
  await db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?"
    )
    .run(key, value, value);
}

export async function deleteSetting(db: Db, key: string) {
  await db.prepare("DELETE FROM settings WHERE key = ?").run(key);
}

/** Which managed account BingX's equity is written into. */
export const BINGX_ASSET_KEY = "bingx_asset_id";
/** Stored instead of an id when no account should ever be synced. */
export const BINGX_ASSET_NONE = "none";

export async function listManagedAccounts(db: Db): Promise<Asset[]> {
  return (await db
    .prepare("SELECT * FROM assets WHERE type = 'managed' ORDER BY name")
    .all()) as Asset[];
}

/**
 * The managed account BingX's equity belongs to, or null if it can't be decided.
 *
 * BingX reports one account-wide equity with no per-strategy breakdown, so it
 * can only be written somewhere specific — spreading it across accounts would
 * multiply the balance instead of splitting it. The target is therefore pinned
 * in settings.
 *
 * When nothing is pinned and there is exactly one managed account, that one is
 * the only possible answer, so it gets pinned right there. That matters: without
 * it, adding a second account for a different exchange would silently stop the
 * sync, and the balance would just quietly stop moving.
 *
 * `none` is the deliberate opt-out — the right setting when BingX itself is
 * split across several strategy rows, where no single one owns the total.
 */
export async function resolveBingxAccount(
  db: Db,
  accounts?: Asset[]
): Promise<Asset | null> {
  const managed = accounts ?? (await listManagedAccounts(db));
  const pinned = await getSetting(db, BINGX_ASSET_KEY);

  if (pinned === BINGX_ASSET_NONE) return null;
  if (pinned) {
    // A pinned account that no longer exists falls through to the auto-pick, so
    // deleting and recreating the account repairs itself.
    const hit = managed.find((a) => a.id === Number(pinned));
    if (hit) return hit;
  }

  if (managed.length === 1) {
    await setSetting(db, BINGX_ASSET_KEY, String(managed[0].id));
    return managed[0];
  }
  return null;
}
