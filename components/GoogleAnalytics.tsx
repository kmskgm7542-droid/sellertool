'use client';

import Script from 'next/script';
import { config } from '@/lib/config';

export default function GoogleAnalytics() {
  if (!config.gaId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${config.gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${config.gaId}', { page_path: window.location.pathname });
        `}
      </Script>
    </>
  );
}
