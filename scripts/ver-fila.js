const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const fila = await prisma.queueEntry.findMany({
    include: { modules: true }
  });
  console.log(JSON.stringify(fila, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });