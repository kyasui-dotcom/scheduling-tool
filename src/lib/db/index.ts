import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

// Allow build to succeed without DATABASE_URL (env var set at runtime in Vercel)
const sql = databaseUrl
  ? neon(databaseUrl)
  : neon("postgresql://placeholder:placeholder@placeholder.neon.tech/placeholder");

export const db = drizzle({ client: sql, schema });
