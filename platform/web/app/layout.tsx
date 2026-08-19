import type { Metadata } from "next";
import { AppProviders } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "PyTorch FIT Career Intelligence",
  description: "The canonical PyTorch FIT frontend for career evidence, job-market analytics, and chapter operations."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <body><AppProviders>{children}</AppProviders></body>
    </html>
  );
}
