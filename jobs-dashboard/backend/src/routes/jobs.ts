import { Router, Request, Response } from "express";
import { queryJobs, getJob, getFilterOptions } from "../db/jobs";

const router = Router();

// GET /api/jobs — list with filters, sort, pagination
router.get("/", async (req: Request, res: Response) => {
  try {
    const result = await queryJobs({
      company: req.query.company as string | undefined,
      role: req.query.role as string | undefined,
      location: req.query.location as string | undefined,
      experience: req.query.experience as string | undefined,
      skills: req.query.skills as string | undefined,
      source: req.query.source as string | undefined,
      search: req.query.search as string | undefined,
      sort_by: req.query.sort_by as string | undefined,
      sort_order: req.query.sort_order as "asc" | "desc" | undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    console.error("Error querying jobs:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/filters — available filter options
router.get("/filters", async (_req: Request, res: Response) => {
  try {
    const options = await getFilterOptions();
    res.json(options);
  } catch (err) {
    console.error("Error fetching filter options:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/jobs/:id — single job detail
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid job ID" });
      return;
    }
    const job = await getJob(id);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(job);
  } catch (err) {
    console.error("Error fetching job:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;