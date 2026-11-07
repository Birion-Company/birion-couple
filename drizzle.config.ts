import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  // A Netlify aplica sozinha, no deploy, as migrações desta pasta.
  out: "netlify/database/migrations",
});
