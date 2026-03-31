const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const historico = await prisma.attendance.findMany({
    include: {
      modules: true,
      feedback: true,
      monitor: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log(JSON.stringify(historico, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });