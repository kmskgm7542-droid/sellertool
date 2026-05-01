import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';
import type { VerdictData } from '@/types';
import LoginBlurOverlay from './login-blur-overlay';

interface EntryVerdictProps {
  data: VerdictData;
}

const verdictConfig = {
  go: {
    emoji: '🟢',
    label: 'GO',
    desc: '진입 추천',
    gradientClass: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    borderClass: 'border-t-emerald-500',
    barClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
  hold: {
    emoji: '🟡',
    label: 'HOLD',
    desc: '조건부 진입',
    gradientClass: 'bg-gradient-to-br from-amber-400 to-amber-500',
    borderClass: 'border-t-amber-400',
    barClass: 'bg-amber-500',
    textClass: 'text-amber-700',
  },
  'no-go': {
    emoji: '🔴',
    label: 'NO-GO',
    desc: '진입 비추천',
    gradientClass: 'bg-gradient-to-br from-rose-500 to-rose-600',
    borderClass: 'border-t-rose-500',
    barClass: 'bg-rose-500',
    textClass: 'text-rose-700',
  },
};

export default function EntryVerdict({ data }: EntryVerdictProps) {
  const cfg = verdictConfig[data.verdict];

  return (
    <Card className={`border-t-4 ${cfg.borderClass}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold text-slate-700 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-slate-500" />
          시장 진입 판정
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`rounded-xl p-4 text-center text-white ${cfg.gradientClass} shadow-sm`}>
          <p className="text-4xl">{cfg.emoji}</p>
          <p className="text-2xl font-black mt-1 tracking-wide">{cfg.label}</p>
          <p className="text-sm mt-1 opacity-90">{cfg.desc}</p>
        </div>

        <div className="text-center py-1">
          <p className="text-3xl font-black text-slate-900">
            {data.totalScore}
            <span className="text-base font-normal text-slate-500 ml-1">점</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">종합 점수 (100점 만점)</p>
        </div>

        <LoginBlurOverlay>
          <div className="space-y-3">
            {[
              { label: '경쟁 강도', score: data.competitionScore, max: 40 },
              { label: '원가율', score: data.costScore, max: 30 },
              { label: '성장성', score: data.growthScore, max: 30 },
            ].map(({ label, score, max }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-500">{label}</span>
                  <span className={`font-semibold ${cfg.textClass}`}>{score}/{max}점</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${cfg.barClass}`}
                    style={{ width: `${(score / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}

            {data.reasons.length > 0 && (
              <div className="pt-2 space-y-1 border-t border-slate-100">
                {data.reasons.map((r) => (
                  <p key={r} className="text-xs text-red-500 flex items-start gap-1">
                    <span>⚠</span>
                    <span>{r}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </LoginBlurOverlay>
      </CardContent>
    </Card>
  );
}
