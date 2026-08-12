import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { HomePage } from "@/components/HomePage";

export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) return <HomePage />;
  if (!user.company?.offer) redirect("/onboarding");
  redirect("/opportunities");
}
