import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import initSqlJs from "sql.js";

export async function createJobFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jobs-dashboard-tests-"));
  const dbPath = path.join(directory, "jobs.sqlite");
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE job_listings (
    id INTEGER PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    experience TEXT,
    location TEXT,
    skills TEXT,
    date_posted TEXT,
    job_code TEXT,
    link TEXT,
    source TEXT,
    notes TEXT,
    created_at TEXT
  )`);

  const insert = `INSERT INTO job_listings
    (id, company, role, experience, location, skills, date_posted, job_code, link, source, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const rows = [
    [1, "Acme", "Senior Engineer", "3-5 years", "Pune", ".NET, React", "2026-03-03", "A1", "https://jobs.example/1", "careers.acme.com", "urgent opening", "2026-03-03"],
    [2, "Beta", "Data Engineer", "5-7 years", "Mumbai", "Python, SQL", "2026-03-02", "B2", "https://jobs.example/2", "jobs.beta.com", "remote role", "2026-03-02"],
    [3, "Acme", "Engineer II", "1-3 years", null, "React", "2026-03-01", "A3", "https://jobs.example/3", "careers.acme.com", null, "2026-03-01"],
    [4, "Gamma", "Analyst", null, "", null, "2026-02-28", null, null, "gamma.example", "", null],
  ];
  for (const row of rows) {
    db.run(insert, row);
  }
  fs.writeFileSync(dbPath, Buffer.from(db.export()));
  db.close();

  return {
    dbPath,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}
