import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClaimLens",
  description: "Human-led annotation layer for stored encyclopedia article snapshots"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NEXT_PUBLIC_E2E_AUTH_ROLE) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
