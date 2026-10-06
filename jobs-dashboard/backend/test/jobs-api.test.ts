import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import express from "express";
import { createJobFixture } from "./support/job-fixture";

let fixture: Awaited<ReturnType<typeof createJobFixture>>;
let queryJobs: typeof import("../src/db/jobs").queryJobs;
let getJob: typeof import("../src/db/jobs").getJob;
let getFilterOptions: typeof import("../src/db/jobs").getFilterOptions;
let server: ReturnType<typeof createServer>;
let baseUrl: string;

before(async () => {
  fixture = await createJobFixture();
  process.env.DB_PATH = fixture.dbPath;
  ({ queryJobs, getJob, getFilterOptions } = await import("../src/db/jobs"));
  const { default: jobsRoutes } = await import("../src/routes/jobs");
  const app = express();
  app.use("/api/jobs", jobsRoutes);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test API did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  fixture?.cleanup();
});

test("job query defaults to descending date order and paginates", async () => {
  const result = await queryJobs({});
  assert.equal(result.total, 4);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.deepEqual(result.jobs.map((job) => job.id), [1, 2, 3, 4]);

  const page = await queryJobs({ limit: 2, page: 2 });
  assert.equal(page.totalPages, 2);
  assert.deepEqual(page.jobs.map((job) => job.id), [3, 4]);
});

test("job query applies every filter and free-text search together", async () => {
  const result = await queryJobs({
    company: "Acme",
    role: "Senior",
    location: "Pune",
    experience: "3-5",
    skills: "React",
    source: "acme.com",
    search: "urgent",
  });
  assert.equal(result.total, 1);
  assert.equal(result.jobs[0].id, 1);

  const searchBySkill = await queryJobs({ search: "Python" });
  assert.deepEqual(searchBySkill.jobs.map((job) => job.id), [2]);
});

test("sort validation and page/limit bounds are applied", async () => {
  const sorted = await queryJobs({ sort_by: "company", sort_order: "asc", limit: 2, page: 2 });
  assert.deepEqual(sorted.jobs.map((job) => job.id), [2, 4]);

  const byRole = await queryJobs({ sort_by: "role", sort_order: "asc" });
  assert.equal(byRole.jobs[0].role, "Analyst");

  const invalidQuery = { sort_by: "role; DROP TABLE job_listings", sort_order: "sideways", limit: 500, page: -5 } as unknown as Parameters<typeof queryJobs>[0];
  const invalidSort = await queryJobs(invalidQuery);
  assert.equal(invalidSort.page, 1);
  assert.equal(invalidSort.totalPages, 1);
  assert.equal(invalidSort.jobs[0].id, 1);

  const minimumLimit = await queryJobs({ limit: -1, page: 0 });
  assert.equal(minimumLimit.page, 1);
  assert.equal(minimumLimit.jobs.length, 1);

  const empty = await queryJobs({ company: "missing" });
  assert.equal(empty.total, 0);
  assert.equal(empty.totalPages, 1);
  assert.deepEqual(empty.jobs, []);
});

test("job lookup returns rows and null for a missing id", async () => {
  const job = await getJob(3);
  assert.equal(job?.company, "Acme");
  assert.equal(job?.location, null);
  assert.equal(job?.notes, null);
  assert.equal(await getJob(999), null);
});

test("filter options are distinct, sorted, and omit blank locations", async () => {
  const options = await getFilterOptions();
  assert.deepEqual(options.companies, ["Acme", "Beta", "Gamma"]);
  assert.deepEqual(options.locations, ["Mumbai", "Pune"]);
  assert.deepEqual(options.sources, ["careers.acme.com", "gamma.example", "jobs.beta.com"]);
});

test("jobs API routes return results and map invalid or missing IDs", async () => {
  const listResponse = await fetch(`${baseUrl}/api/jobs?company=Acme`);
  assert.equal(listResponse.status, 200);
  assert.equal((await listResponse.json() as { total: number }).total, 2);

  const filterResponse = await fetch(`${baseUrl}/api/jobs/filters`);
  assert.equal(filterResponse.status, 200);
  assert.deepEqual((await filterResponse.json() as { locations: string[] }).locations, ["Mumbai", "Pune"]);

  const foundResponse = await fetch(`${baseUrl}/api/jobs/1`);
  assert.equal(foundResponse.status, 200);
  assert.equal((await foundResponse.json() as { id: number }).id, 1);

  const invalidResponse = await fetch(`${baseUrl}/api/jobs/not-a-number`);
  assert.equal(invalidResponse.status, 400);
  const missingResponse = await fetch(`${baseUrl}/api/jobs/999`);
  assert.equal(missingResponse.status, 404);
});

test("jobs API routes convert database failures to 500 responses", async () => {
  const backupPath = `${fixture.dbPath}.backup`;
  const originalConsoleError = console.error;
  console.error = () => undefined;
  fs.renameSync(fixture.dbPath, backupPath);
  try {
    for (const path of ["/api/jobs", "/api/jobs/filters", "/api/jobs/1"]) {
      const response = await fetch(`${baseUrl}${path}`);
      assert.equal(response.status, 500, path);
    }
  } finally {
    fs.renameSync(backupPath, fixture.dbPath);
    console.error = originalConsoleError;
  }
});
