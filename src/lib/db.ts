import Database from "better-sqlite3";
import path from "path";
import { initializeSchema } from "./db-schema";

const DB_PATH = path.join(process.cwd(), "data", "portfolio.db");

let db: Database.Database | null = null;

export default function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initializeSchema(db);
  }
  return db;
}
