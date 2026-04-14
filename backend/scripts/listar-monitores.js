const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const monitores = await prisma.user.findMany({
    //include: { subjects: true }
  });

  console.log(JSON.stringify(monitores, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });