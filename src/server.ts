import { env } from "./config/env";
import { closeDb, connectDb, ensureIndexes } from "./config/db";
import { createApp } from "./app";

async function main() {
  await connectDb();
  await ensureIndexes();
  const server = createApp().listen(env.PORT, () => {
    console.log(`StudioSpace API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
