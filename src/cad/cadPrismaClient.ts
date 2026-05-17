import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

export function getCadPrismaClient() {
  prisma ??= new PrismaClient();
  return prisma;
}

export async function disconnectCadPrismaClient() {
  if (!prisma) {
    return;
  }
  await prisma.$disconnect();
  prisma = null;
}
