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

/** Plain-language hints for the most common first-time MongoDB Atlas problems. */
function dbHint(err: unknown): string | undefined {
  const e = err as { code?: string | number; name?: string; message?: string };
  const msg = String(e?.message ?? "");
  if (e?.code === "EBADNAME") return "Your MONGODB_URI contains an invalid host name. Re-copy the connection string from Atlas.";
  if (e?.code === "ENOTFOUND" || e?.code === "ENODATA")
    return "The cluster host name could not be found. Check the cluster part of MONGODB_URI, and your internet/DNS connection.";
  if (e?.code === 18 || e?.code === 8000 || /bad auth|authentication failed/i.test(msg))
    return "Atlas rejected the username or password. Check the database user's password (special characters must be URL-encoded).";
  if (e?.name === "MongoServerSelectionError")
    return "Could not reach the database. In Atlas open Network Access and add your current IP address (or 0.0.0.0/0 for development).";
  return undefined;
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  const hint = dbHint(err);
  if (hint) console.error(`\nHint: ${hint}`);
  process.exit(1);
});
