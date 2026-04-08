const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const institutions = await prisma.institution.findMany();
  console.log('Conexão OK. Instituições:', institutions);
}

main()
  .catch((e) => {
    console.error('Erro ao conectar:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });