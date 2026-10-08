import "dotenv/config";
import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const app = createApp(config);

// Loopback/bridge exposure is controlled by Docker port publishing; bind all in-container.
app.listen(config.port, () => {
  console.log(`Cockpit backend listening on :${config.port} (public ${config.publicUrl})`);
});
