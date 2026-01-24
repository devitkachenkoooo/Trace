import * as dotenv from 'dotenv'; 
import { defineConfig } from 'drizzle-kit';


dotenv.config({
  path: '.env.local',
});
console.log("--- DEBUG: Чи знайдено файл? ---", process.env.DATABASE_URL ? "ТАК" : "НІ");

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error('DATABASE_URL is missing in .env.local');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
  },
});