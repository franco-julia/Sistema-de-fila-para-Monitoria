const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const inst = await prisma.institution.create({
    data: {
      name: 'Instituição Demo',
      slug: 'instituicao-demo'
    }
  });

  console.log(inst);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });