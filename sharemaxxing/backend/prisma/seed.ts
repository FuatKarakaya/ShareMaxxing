import { hashPassword } from '../src/lib/passwords';
import { prisma } from '../src/lib/prisma';

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo accounts cannot be seeded in production.');
  }
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error('Set SEED_PASSWORD to a local demo password of 8–128 characters.');
  }
  const passwordHash = await hashPassword(password);
  for (const verified of [true, false]) {
    const email = verified ? 'demo.verified@itu.edu.tr' : 'demo.unverified@itu.edu.tr';
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        displayName: verified ? 'Doğrulanmış Demo' : 'Doğrulanmamış Demo',
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
  }
  console.log('Demo accounts are ready; existing accounts were left unchanged.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
