import { prisma } from './src/lib/db';
prisma.$queryRawUnsafe(`SELECT * FROM pgboss.job WHERE name = 'generate-image-renders' ORDER BY created_on DESC LIMIT 5`).then(res => { console.dir(res, {depth: null}); process.exit(0); });
