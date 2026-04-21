import "dotenv/config";

import { buildApp } from "./app";
import { env } from "./config/env";

async function start() {
  const app = await buildApp();

  await app.listen({
    host: "0.0.0.0",
    port: env.PORT,
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
