import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { signUpAction } from "@/lib/actions/auth";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl mb-1">
          Intent<span className="text-accent">Scout</span>
        </h1>
        <p className="text-muted text-sm mb-6">
          Find people already looking for what you sell.
        </p>
        <AuthForm action={signUpAction} mode="signup" />
        <p className="text-sm text-muted mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-accent underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
