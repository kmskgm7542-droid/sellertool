import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VerdictData } from '@/types';
import LoginBlurOverlay from './login-blur-overlay';

interface EntryVerdictProps {
  data: VerdictData;
  isLoggedIn: boolean;
}

const verdictConfig = {
  go: { emoji: '🟢', label: 'GO', desc: '진입 추천', bg: 'bg-green-50', text: 'text-green-700' },
  hold: { emoji: '🟡', label: 'HOLD', desc: '조건부 진입', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  'no-go': { emoji: '🔴', label: 'NO-GO', desc: '진입 비추천', bg: 'bg-red-50', text: 'text-red-700' },
};

export default function EntryVerdict({ data, isLoggedIn }: EntryVerdictProps) {
  const cfg = verdictConfig[data.verdict];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700">
          시장 진입 판정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`rounded-xl p-4 text-center ${cfg.bg}`}>
          <p className="text-4xl font-black">{cfg.emoji}</p>
          <p className={`text-2xl font-black mt-1 ${cfg.text}`}>{cfg.label}</p>
          <p className={`text-sm mt-1 ${cfg.text}`}>{cfg.desc}</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-slate-900">{data.totalScore}점</p>
          <p className="text-xs text-slate-500">종합 점수 (100점 만점)</p>
        </div>
        <LoginBlurOverlay isLoggedIn={isLoggedIn} label="항목별 점수 분석은 로그인 후 확인">
          <div className="space-y-2">
            {[
              { label: '경쟁 강도', score: data.competitionScore, max: 40 },
              { label: '원가율', score: data.costScore, max: 30 },
              { label: '성장성', score: data.growthScore, max: 30 },
            ].map(({ label, score, max }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{label}</span>
                  <span>{score}/{max}점</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${(score / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {data.reasons.length > 0 && (
              <div className="pt-2 space-y-1">
                {data.reasons.map((r) => (
                  <p key={r} className="text-xs text-red-500">&#9888; {r}</p>
                ))}
              </div>
            )}
          </div>
        </LoginBlurOverlay>
      </CardContent>
    </Card>
  );
}
