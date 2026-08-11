import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IntentScout",
  description: "AI that finds people already looking for what you sell.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
