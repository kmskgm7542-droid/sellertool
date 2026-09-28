import { login } from '@/app/calls/actions';

export default function LoginForm({ error }: { error: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-4">
      <h1 className="text-xl font-bold">콜 검증 성적표</h1>
      <p className="mt-1 text-sm text-muted-foreground">본인 확인용 비공개 페이지입니다.</p>
      <form action={login} className="mt-6 flex flex-col gap-3">
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          required
          className="rounded-md border border-input bg-background px-3 py-2 text-base"
        />
        {error && <p className="text-sm text-destructive">비밀번호가 틀렸습니다.</p>}
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-primary-foreground">
          열기
        </button>
      </form>
    </main>
  );
}
