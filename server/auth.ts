import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "node:crypto";
import { compare } from "bcryptjs";
import { db } from "./db";
import type { Role } from "@prisma/client";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type Context = {
  userId: string;
  companyId: string;
  role: Role;
  name: string;
  companyName: string;
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32)
    throw new Error("AUTH_SECRET debe tener al menos 32 caracteres.");
  return new TextEncoder().encode(value);
}
export async function context(): Promise<Context> {
  const token = (await cookies()).get("mf_session")?.value;
  if (!token) throw new AppError("Inicia sesión para continuar.", 401);
  let sessionId: string, companyId: string;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      algorithms: ["HS256"],
      issuer: "mariaraul",
      audience: "mariaraul-web",
    });
    sessionId = String(payload.sid);
    companyId = String(payload.cid);
  } catch {
    throw new AppError("La sesión expiró.", 401);
  }
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      user: { include: { memberships: { include: { company: true } } } },
    },
  });
  if (
    !session ||
    session.expiresAt < new Date() ||
    !session.user.active ||
    session.tokenHash !== hash(token)
  )
    throw new AppError("La sesión expiró.", 401);
  const membership = session.user.memberships.find(
    (m) => m.companyId === companyId,
  );
  if (!membership) throw new AppError("Sin acceso a la empresa.", 403);
  return {
    userId: session.userId,
    companyId,
    role: membership.role,
    name: session.user.name,
    companyName: membership.company.tradeName || membership.company.name,
  };
}
export function authorize(ctx: Context, admin = false) {
  if (ctx.role === "VIEWER" || (admin && ctx.role !== "ADMIN"))
    throw new AppError("No tienes permiso para realizar esta operación.", 403);
}
export async function login(email: string, password: string) {
  const identifier = email.trim().toLowerCase();
  const key = hash(identifier);
  const now = new Date();
  const attempt = await db.loginAttempt.upsert({
    where: { key },
    create: { key, count: 1, resetAt: new Date(now.getTime() + 15 * 60000) },
    update: { count: { increment: 1 } },
  });
  if (attempt.resetAt < now)
    await db.loginAttempt.update({
      where: { key },
      data: { count: 1, resetAt: new Date(now.getTime() + 15 * 60000) },
    });
  else if (attempt.count > 10)
    throw new AppError("Demasiados intentos. Espera 15 minutos.", 429);
  const user = await db.user.findUnique({
    where: identifier.includes("@")
      ? { email: identifier }
      : { username: identifier },
    include: { memberships: { orderBy: { id: "asc" } } },
  });
  // Use a valid cost-12 dummy hash to avoid skipping password work for unknown accounts.
  const valid = await compare(
    password,
    user?.passwordHash ??
      "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5zQF6C7vQeQcSWlxIxVSIIJMHRQFSFi",
  );
  if (!user || !valid || !user.active || !user.memberships.length)
    throw new AppError("Usuario o PIN incorrectos.", 401);
  await db.loginAttempt.deleteMany({ where: { key } });
  const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const session = await db.session.create({
    data: {
      userId: user.id,
      tokenHash: randomBytes(32).toString("hex"),
      expiresAt,
    },
  });
  const token = await new SignJWT({
    sid: session.id,
    cid: user.memberships[0].companyId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .setIssuer("mariaraul")
    .setAudience("mariaraul-web")
    .sign(secret());
  await db.session.update({
    where: { id: session.id },
    data: { tokenHash: hash(token) },
  });
  (await cookies()).set("mf_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { name: user.name };
}
export async function logout() {
  const token = (await cookies()).get("mf_session")?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hash(token) } });
  (await cookies()).delete("mf_session");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_URL;
  const expected = configured
    ? new URL(configured).origin
    : new URL(request.url).origin;
  if (!origin || origin !== expected)
    throw new AppError("Origen de solicitud no permitido.", 403);
}

export async function pageContext(): Promise<Context> {
  try {
    return await context();
  } catch (error) {
    if (error instanceof AppError) redirect("/login");
    throw error;
  }
}
