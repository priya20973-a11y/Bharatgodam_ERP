import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import NextAuthSessionProvider from '@/components/providers/session-provider';
import { WarehouseProvider } from '@/contexts/WarehouseContext';
import OfflineRuntime from '@/components/providers/offline-runtime';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Warehouse Management System",
  description: "Production WMS built with Next.js 14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextAuthSessionProvider>
          <WarehouseProvider>
            {children}
            <OfflineRuntime />
          </WarehouseProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
