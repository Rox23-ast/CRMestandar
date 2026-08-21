import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const OUTPUT_FILE = resolve(process.cwd(), 'docs', 'db-structure.sql');

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT type, name, sql
     FROM sqlite_master
     WHERE sql IS NOT NULL
       AND name NOT LIKE 'sqlite_%'
       AND name != '_prisma_migrations'
     ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`
  );

  const header = [
    '-- ================================================================',
    '-- Mudanzas Chico - Estructura de la base de datos (SQLite)',
    `-- Generado: ${new Date().toISOString()}`,
    '-- Script: npm run db:schema (scripts/dump-db-schema.mjs)',
    '-- ================================================================',
    '',
  ];

  const body = rows
    .map((row) => `-- ${row.type.toUpperCase()}: ${row.name}\n${row.sql};`)
    .join('\n\n');

  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  writeFileSync(OUTPUT_FILE, header.join('\n') + body + '\n');
  console.log(`Estructura extraida: ${OUTPUT_FILE} (${rows.length} objetos)`);
}

main()
  .catch((error) => {
    console.error('Error extrayendo la estructura:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
