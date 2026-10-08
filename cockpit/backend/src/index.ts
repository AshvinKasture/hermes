import "dotenv/config";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { MetricsCollector } from "./metrics/collector";
import { Sampler } from "./metrics/sampler";
import { MetricsStore } from "./metrics/store";

const config = loadConfig();
const collector = new MetricsCollector();
const metricsStore = new MetricsStore(config.metricsDbPath);
const sampler = new Sampler(collector, metricsStore);
const app = createApp(config, { collector, metricsStore });

sampler.start();
const server = app.listen(config.port, () => {
  console.log(`Cockpit backend listening on :${config.port} (public ${config.publicUrl})`);
});

function shutdown() {
  sampler.stop();
  server.close(() => {
    metricsStore.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
