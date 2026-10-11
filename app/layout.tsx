import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import styles from "./layout.module.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Library", template: "%s · Library" },
  description: "Search anime, manga and games and fetch them as profiles with one shared schema.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <header className={styles.header}>
          <Link href="/" className={styles.brand}>
            Library
          </Link>
          <nav className={styles.nav} aria-label="Main">
            <Link href="/">Search</Link>
            <Link href="/docs">Docs</Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
