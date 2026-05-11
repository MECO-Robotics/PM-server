import "dotenv/config";

import { buildApp } from "./app";
import { cadPersistenceConfig, cadStepParserConfig, env } from "./config/env";

async function start() {
  console.info(
    `[startup] CAD_STORE_DRIVER=${cadPersistenceConfig.storeDriver} CAD_STEP_PARSER_MODE=${cadStepParserConfig.mode} placeholderMode=${cadStepParserConfig.mode === "placeholder"}`,
  );
  if (cadStepParserConfig.mode === "placeholder") {
    console.warn(
      "[startup] WARNING: CAD_STEP_PARSER_MODE=placeholder is enabled. STEP uploads will not be treated as real CAD parses.",
    );
  }

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
