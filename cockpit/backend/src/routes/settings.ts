import { Router } from "express";
import { MAX_RETENTION_DAYS, MIN_RETENTION_DAYS, type MetricsStore } from "../metrics/store";

export function settingsRouter(store: MetricsStore): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ retentionDays: store.getRetentionDays(), limits: { min: MIN_RETENTION_DAYS, max: MAX_RETENTION_DAYS } });
  });

  router.put("/", (req, res) => {
    const days = req.body?.retentionDays;
    if (typeof days !== "number" || !Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
      res.status(400).json({ error: `retentionDays must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS}` });
      return;
    }
    store.setRetentionDays(days);
    const pruned = store.prune(); // shrinking retention takes effect immediately
    res.json({ retentionDays: store.getRetentionDays(), pruned });
  });

  return router;
}
