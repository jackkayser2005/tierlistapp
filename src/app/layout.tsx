import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ranked — the group chat, ranked",
  description: "Private tier lists for your favorite people.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
