import { PrismaClient, AdminRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Defina SEED_ADMIN_EMAIL com o e-mail real do responsável antes de executar o seed.');
  }
  if (!password || password.length < 16 || Buffer.byteLength(password, 'utf8') > 72 || password === 'trocar-essa-senha') {
    throw new Error('Defina SEED_ADMIN_PASSWORD com pelo menos 16 caracteres e no máximo 72 bytes antes de executar o seed.');
  }
  await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: { name: 'Administrador', email, passwordHash: await bcrypt.hash(password, 10), role: AdminRole.OWNER },
  });

  for (const category of [{ name: 'Camisetas', slug: 'camisetas' }, { name: 'Regatas', slug: 'regatas' }]) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
  }
  console.log('Seed concluído. Conta do responsável criada; cadastre produtos e estoque reais no painel.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
