"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";

export type AuthFormState = { error?: string } | undefined;

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const name = String(formData.get("name") || "").trim();
  const companyName = String(formData.get("companyName") || "").trim();

  if (!email || !email.includes("@")) return { error: "Enter a valid email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (!companyName) return { error: "Enter your business name." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await hashPassword(password);

  // Account (subscription owner) is created first, then the signup's
  // business (Company) beneath it, then the user — linked to both the
  // account and, as their initial active business, the new company. See
  // prisma/schema.prisma's Account doc comment for why this three-level
  // shape exists (multi-business support).
  const user = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({ data: {} });
    const company = await tx.company.create({ data: { name: companyName, accountId: account.id } });
    return tx.user.create({
      data: { email, passwordHash, name: name || null, accountId: account.id, companyId: company.id },
    });
  });

  await createSession(user.id);
  redirect("/onboarding");
}

export async function logInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: "Invalid email or password." };

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return { error: "Invalid email or password." };

  await createSession(user.id);
  redirect("/");
}

export async function logOutAction() {
  await destroySession();
  redirect("/login");
}
