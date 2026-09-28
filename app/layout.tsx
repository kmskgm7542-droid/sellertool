import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import Providers from "@/components/providers";
import Footer from "@/components/footer";
import { config } from "@/lib/config";
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
  metadataBase: new URL(config.siteUrl),
  title: '셀러툴 — 이커머스 시장조사 무료 툴',
  description: '키워드 하나로 경쟁 분석 + 원가율 + 시장 진입 판정까지. 무료 · 로그인 불필요.',
  alternates: {
    canonical: '/',
  },
  verification: {
    other: {
      'naver-site-verification': '4d11f439874cbd4b144ab0eb8931a1269a199c9a',
    },
  },
  openGraph: {
    title: '셀러툴 — 이커머스 시장조사 무료 툴',
    description: '키워드 하나로 경쟁 분석 + 원가율 + 시장 진입 판정까지',
    type: 'website',
    url: '/',
    siteName: '셀러툴',
    locale: 'ko_KR',
  },
};

// 가시 콘텐츠와 동일한 사실만 선언한다 — 화면에 없는 내용을 넣으면 스팸 판정 위험.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${config.siteUrl}/#organization`,
      name: '셀러툴',
      url: config.siteUrl,
    },
    {
      '@type': 'WebApplication',
      '@id': `${config.siteUrl}/#webapp`,
      name: '셀러툴',
      url: config.siteUrl,
      applicationCategory: 'BusinessApplication',
      description:
        '키워드 하나로 경쟁 분석, 시장 규모, 원가율, 진입 판정(GO/HOLD/NO-GO)을 제공하는 이커머스 시장조사 무료 툴',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'KRW',
      },
      publisher: { '@id': `${config.siteUrl}/#organization` },
    },
  ],
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <GoogleAnalytics />
        <Providers>
          {children}
        </Providers>
        <Footer />
      </body>
    </html>
  );
}
