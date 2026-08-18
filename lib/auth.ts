import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "intentscout_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Auth cannot issue or verify sessions without it."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

async function getUserIdFromSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.userId === "string" ? payload.userId : null;
  } catch {
    return null;
  }
}

/** Returns the logged-in user with their company, or null. Never throws for "not logged in". */
export async function getCurrentUser() {
  const userId = await getUserIdFromSession();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    include: { company: { include: { offer: true } } },
  });
}

/** For server components/route handlers that require a logged-in user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthRequiredError();
  }
  return user;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Authentication required");
    this.name = "AuthRequiredError";
  }
}

/**
 * The one authorization check for the internal Admin Panel
 * (app/admin/*). Deliberately re-verifies role from the database on every
 * call (via requireUser -> getCurrentUser -> prisma.user.findUnique)
 * rather than trusting anything cached client-side — every admin page,
 * server action, and API route must call this itself; app/admin/layout.tsx
 * calling it does NOT make it safe to skip elsewhere, since a layout only
 * guards page navigation, not direct server-action/API invocation.
 *
 * Authorization is solely User.role === "admin", a persistent DB column —
 * never an email comparison. See prisma/schema.prisma's User.role comment.
 */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new AdminRequiredError();
  }
  return user;
}

export class AdminRequiredError extends Error {
  constructor() {
    super("Admin access required");
    this.name = "AdminRequiredError";
  }
}
