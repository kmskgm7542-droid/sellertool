import type { Snapshot } from '@/types/calls';

const RULE_LABEL: Record<string, string> = {
  nearPct: '즉시 매수 판정 거리',
  entryWindowDays: '진입 대기 최대(일)',
  rangePick: '목표 범위 적용',
  shortDays: '"단기"(일)',
  midDays: '"중기"(일)',
  longDays: '"장기"(일)',
  eventDays: '이벤트 기준(일)',
  defaultDays: '기간 미표기(일)',
  closeStopExit: '종가 손절 청산가',
  minFilled: '최소 체결 수',
  minT: '최소 t값',
  minPF: '최소 PF',
  maxDD: '최대낙폭 한도',
  riskPerTrade: '건당 위험',
};

function Rows({ obj }: { obj: Record<string, unknown> }) {
  return (
    <>
      {Object.entries(obj).map(([k, v]) => (
        <tr key={k} className="border-t border-border">
          <td className="py-1 pr-2 text-muted-foreground">{RULE_LABEL[k] ?? k}</td>
          <td className="py-1 font-mono">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
        </tr>
      ))}
    </>
  );
}

export default function RulesPanel({ rules }: { rules: Snapshot['rules'] }) {
  return (
    <details className="rounded-lg border border-border p-3 text-xs">
      <summary className="cursor-pointer text-sm font-medium">규칙·비용·합격 기준 (사전 확정, 편집 불가)</summary>
      <table className="mt-2 w-full">
        <tbody>
          <Rows obj={rules.RULES} />
          <Rows obj={rules.CRITERIA} />
          <Rows obj={rules.COSTS} />
        </tbody>
      </table>
      <p className="mt-2 text-muted-foreground">규칙 변경은 config.mjs 와 README 변경 기록으로만 한다. 결과를 본 뒤 바꾸지 않는다.</p>
    </details>
  );
}
