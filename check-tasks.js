const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.task.findMany({ where: { type: 'content' } })
    .then(tasks => console.log('Content tasks statuses:', tasks.map(t => t.status)))
    .catch(console.error)
    .finally(() => prisma.$disconnect());
