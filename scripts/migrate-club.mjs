import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error(
    'DATABASE_URL is not set.\nProvision Neon from the Vercel Marketplace, then run:\n  DATABASE_URL="postgres://…" npm run db:migrate',
  )
  process.exit(1)
}

const file = join(dirname(fileURLToPath(import.meta.url)), '../db/migrations/001_club.sql')
const text = readFileSync(file, 'utf8')
const statements = text
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .split(';')
  .map((part) => part.trim())
  .filter(Boolean)

const sql = neon(url)
for (const statement of statements) {
  await sql.query(statement)
}

console.log(`Applied ${statements.length} statements from db/migrations/001_club.sql`)
