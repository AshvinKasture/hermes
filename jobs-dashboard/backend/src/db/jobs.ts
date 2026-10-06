import initSqlJs from "sql.js";
import fs from "fs";
import { config } from "../config";

export interface JobListing {
  id: number;
  company: string;
  role: string;
  experience: string | null;
  location: string | null;
  skills: string | null;
  date_posted: string | null;
  job_code: string | null;
  link: string | null;
  source: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface JobsQuery {
  company?: string;
  role?: string;
  location?: string;
  experience?: string;
  skills?: string;
  source?: string;
  search?: string;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface JobsResult {
  jobs: JobListing[];
  total: number;
  page: number;
  totalPages: number;
}

interface DbStmt {
  bind(params: unknown[]): void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

const VALID_SORT_COLUMNS = new Set([
  "company", "role", "experience", "location", "skills",
  "date_posted", "source", "created_at",
]);

const VALID_SORT_ORDERS = new Set(["asc", "desc"]);
const DEFAULT_SORT = { column: "date_posted", order: "desc" as const };

function cleanSortColumn(raw: string): string {
  if (VALID_SORT_COLUMNS.has(raw)) return raw;
  return DEFAULT_SORT.column;
}

function cleanSortOrder(raw: string): "asc" | "desc" {
  if (VALID_SORT_ORDERS.has(raw)) return raw as "asc" | "desc";
  return DEFAULT_SORT.order;
}

let _SQL: unknown = null;

async function getDb() {
  if (!_SQL) {
    _SQL = await initSqlJs();
  }
  const SQL = _SQL as { Database: new (buffer: Buffer) => { close: () => void; prepare: (sql: string) => DbStmt } };
  const buffer = fs.readFileSync(config.dbPath);
  return new SQL.Database(buffer);
}

export async function queryJobs(query: JobsQuery): Promise<JobsResult> {
  const db = await getDb();
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.company) {
      conditions.push("company LIKE ?");
      params.push(`%${query.company}%`);
    }
    if (query.role) {
      conditions.push("role LIKE ?");
      params.push(`%${query.role}%`);
    }
    if (query.location) {
      conditions.push("location LIKE ?");
      params.push(`%${query.location}%`);
    }
    if (query.experience) {
      conditions.push("experience LIKE ?");
      params.push(`%${query.experience}%`);
    }
    if (query.skills) {
      conditions.push("skills LIKE ?");
      params.push(`%${query.skills}%`);
    }
    if (query.source) {
      conditions.push("source LIKE ?");
      params.push(`%${query.source}%`);
    }
    if (query.search) {
      conditions.push("(company LIKE ? OR role LIKE ? OR skills LIKE ? OR notes LIKE ?)");
      const term = `%${query.search}%`;
      params.push(term, term, term, term);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countStmt = db.prepare(`SELECT COUNT(*) as cnt FROM job_listings ${where}`);
    countStmt.bind(params);
    const total = countStmt.step() ? (countStmt.getAsObject().cnt as number) || 0 : 0;

    const sortColumn = cleanSortColumn(query.sort_by || DEFAULT_SORT.column);
    const sortOrder = cleanSortOrder(query.sort_order || DEFAULT_SORT.order);

    const limit = Math.min(Math.max(query.limit || 24, 1), 100);
    const page = Math.max(query.page || 1, 1);
    const offset = (page - 1) * limit;
    const totalPages = Math.max(Math.ceil(total / limit), 1);

    const dataStmt = db.prepare(
      `SELECT * FROM job_listings ${where} ORDER BY ${sortColumn} ${sortOrder} LIMIT ? OFFSET ?`
    );
    dataStmt.bind([...params, limit, offset]);

    const jobs: JobListing[] = [];
    while (dataStmt.step()) {
      const row = dataStmt.getAsObject();
      jobs.push({
        id: row.id as number,
        company: row.company as string,
        role: row.role as string,
        experience: row.experience as string | null,
        location: row.location as string | null,
        skills: row.skills as string | null,
        date_posted: row.date_posted as string | null,
        job_code: row.job_code as string | null,
        link: row.link as string | null,
        source: row.source as string | null,
        notes: row.notes as string | null,
        created_at: row.created_at as string | null,
      });
    }

    return { jobs, total, page, totalPages };
  } finally {
    db.close();
  }
}

export async function getJob(id: number): Promise<JobListing | null> {
  const db = await getDb();
  try {
    const stmt = db.prepare("SELECT * FROM job_listings WHERE id = ?");
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      return {
        id: row.id as number,
        company: row.company as string,
        role: row.role as string,
        experience: row.experience as string | null,
        location: row.location as string | null,
        skills: row.skills as string | null,
        date_posted: row.date_posted as string | null,
        job_code: row.job_code as string | null,
        link: row.link as string | null,
        source: row.source as string | null,
        notes: row.notes as string | null,
        created_at: row.created_at as string | null,
      };
    }
    return null;
  } finally {
    db.close();
  }
}

export async function getFilterOptions() {
  const db = await getDb();
  try {
    const companies = mapStmt(db, "SELECT DISTINCT company FROM job_listings ORDER BY company", "company");
    const locations = mapStmt(db, "SELECT DISTINCT location FROM job_listings WHERE location IS NOT NULL AND location != '' ORDER BY location", "location");
    const sources = mapStmt(db, "SELECT DISTINCT source FROM job_listings ORDER BY source", "source");
    return { companies, locations, sources };
  } finally {
    db.close();
  }
}

function mapStmt(db: { prepare: (sql: string) => DbStmt }, sql: string, col: string): string[] {
  const stmt = db.prepare(sql);
  const results: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row[col] as string);
  }
  return results;
}