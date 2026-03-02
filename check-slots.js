const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.weekPlan.findMany({ include: { postSlots: true } })
    .then(plans => {
        plans.forEach(p => {
            console.log(`Plan ${p.id}: ${p.postSlots.length} slots. Contents:`, p.postSlots.map(s => s.selectedContent ? "Yes" : "No"));
        })
    })
    .catch(console.error)
    .finally(() => prisma.$disconnect());
