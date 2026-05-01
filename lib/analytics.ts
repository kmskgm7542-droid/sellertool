declare global {
  interface Window {
    gtag: (command: string, ...args: unknown[]) => void;
  }
}

export function trackEvent(
  action: string,
  category: string,
  label?: string,
  value?: number
) {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', action, {
    event_category: category,
    event_label: label,
    value,
  });
}

export const events = {
  search: (keyword: string) => trackEvent('search', 'keyword', keyword),
  saveReport: (keyword: string) => trackEvent('save_report', 'report', keyword),
  login: (provider: string) => trackEvent('login', 'auth', provider),
  viewResult: (verdict: string) => trackEvent('view_result', 'analysis', verdict),
} as const;
