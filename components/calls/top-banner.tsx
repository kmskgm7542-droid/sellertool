import { logout } from '@/app/calls/actions';
import { kstIso } from '@/lib/calls/format';

export default function TopBanner({ generatedAt, week }: { generatedAt: string; week: string }) {
  return (
    <div className="sticky top-0 z-10 border-b border-destructive/30 bg-destructive/10 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-2 text-xs sm:text-sm">
        <div className="flex flex-col">
          <span className="font-bold text-destructive">⛔ 워크포워드 합격 전 실거래 금지</span>
          <span className="text-muted-foreground">
            생성 {kstIso(generatedAt)} KST · {week} · 다음 자동 갱신 일요일 22:00
          </span>
        </div>
        <form action={logout}>
          <button type="submit" className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">
            잠금
          </button>
        </form>
      </div>
    </div>
  );
}
