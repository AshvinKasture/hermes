import "dotenv/config";
import { createApp, buildAuthMiddleware } from "./app";
import { loadConfig } from "./config";
import { MetricsCollector } from "./metrics/collector";
import { Sampler } from "./metrics/sampler";
import { MetricsStore } from "./metrics/store";
import { SqliteSessionStore } from "./auth/sqliteStore";
import { audit } from "./audit";
import { attachTerminal } from "./terminal/ws";

const config = loadConfig();
const collector = new MetricsCollector();
const metricsStore = new MetricsStore(config.metricsDbPath);
const sampler = new Sampler(collector, metricsStore);
const sessionStore = new SqliteSessionStore(config.sessionDbPath);
const app = createApp(config, { collector, metricsStore, sessionStore });

sampler.start();
const server = app.listen(config.port, () => {
  console.log(`Cockpit backend listening on :${config.port} (public ${config.publicUrl})`);
});

// WS upgrades bypass Express entirely, so the terminal gets its own copy of the session/passport
// middleware (same store, same secret) to authenticate the upgrade request by hand.
const { cookiePath, stack } = buildAuthMiddleware(config, sessionStore);
const terminalPath = (cookiePath === "/" ? "" : cookiePath) + "/api/terminal";
attachTerminal(server, terminalPath, config, stack, audit);

function shutdown() {
  sampler.stop();
  server.close(() => {
    metricsStore.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

