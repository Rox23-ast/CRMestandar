import { PrismaClient } from '@prisma/client';

// A shared client avoids opening one SQLite connection per controller/service.
export const prisma = new PrismaClient();
