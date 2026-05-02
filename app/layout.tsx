import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import Providers from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: '셀러툴 — 이커머스 시장조사 무료 툴',
  description: '키워드 하나로 경쟁 분석 + 원가율 + 시장 진입 판정까지. 무료 · 로그인 불필요.',
  openGraph: {
    title: '셀러툴 — 이커머스 시장조사 무료 툴',
    description: '키워드 하나로 경쟁 분석 + 원가율 + 시장 진입 판정까지',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GoogleAnalytics />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
