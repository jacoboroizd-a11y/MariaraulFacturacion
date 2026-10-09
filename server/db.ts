import { PrismaClient, Prisma } from "@prisma/client";
const globalDb = globalThis as unknown as { prisma: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
export async function transaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  retryUnique = false,
): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      });
    } catch (e) {
      if (
        !(
          e instanceof Prisma.PrismaClientKnownRequestError &&
          (e.code === "P2034" ||
            (retryUnique && e.code === "P2002") ||
            (e.code === "P2010" &&
              ["40001", "40P01"].includes(String(e.meta?.code))))
        ) ||
        attempt === 9
      )
        throw e;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(1000, 20 * 2 ** attempt) + Math.random() * 40,
        ),
      );
    }
  }
  throw new Error("No se pudo completar la transacción.");
}
