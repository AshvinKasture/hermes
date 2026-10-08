import { Router } from "express";
import type { MetricsCollector } from "../metrics/collector";
import { MAX_POINTS, type MetricsStore } from "../metrics/store";

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

export function metricsRouter(collector: MetricsCollector, store: MetricsStore): Router {
  const router = Router();

  router.get("/current", (_req, res) => {
    res.json(collector.current());
  });

  router.get("/", (req, res) => {
    const now = Date.now();
    const to = req.query.to === undefined ? now : Number(req.query.to);
    const from = req.query.from === undefined ? to - 24 * 60 * 60 * 1000 : Number(req.query.from);
    const points = req.query.points === undefined ? MAX_POINTS : Number(req.query.points);

    if (![from, to, points].every(Number.isFinite)) {
      res.status(400).json({ error: "from, to and points must be numbers" });
      return;
    }
    if (from >= to) {
      res.status(400).json({ error: "from must be before to" });
      return;
    }
    if (to - from > MAX_RANGE_MS) {
      res.status(400).json({ error: "Range too large (max 366 days)" });
      return;
    }
    res.json({ from, to, points: store.range(from, to, points) });
  });

  return router;
}
