import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { logInAction } from "@/lib/actions/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl mb-1">
          Intent<span className="text-accent">Scout</span>
        </h1>
        <p className="text-muted text-sm mb-6">Log in to your workspace.</p>
        <AuthForm action={logInAction} mode="login" />
        <p className="text-sm text-muted mt-4">
          No account?{" "}
          <Link href="/signup" className="text-accent underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}
