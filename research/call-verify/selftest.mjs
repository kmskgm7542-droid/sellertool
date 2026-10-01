// 자체 검증 — 가상의 종목명·가격으로 파서와 시뮬레이터 규칙을 확인한다(실제 콜 원문 사용 금지).
//   node selftest.mjs
import { RULES, COSTS, CRITERIA } from './config.mjs';
import { parseCall, simulate, stats, HOUR, normalizePrices } from './lib.mjs';

let fail = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) fail++;
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ───────── 파서 ─────────
{
  const p = parseCall('샘플코인 1000원매수 950컷잡고 1시간 종가기준 단기 1300원 2주 1800원 노려볼자리', RULES);
  ok(p.ok && p.name === '샘플코인' && p.entryMode === 'PRICE' && p.entry === 1000 && p.sl === 950, '코인형: 종목·진입·손절');
  ok(p.tps.map((t) => t.price).join() === '1300,1800' && near(p.tps[0].weight, 0.5), '코인형: 목표 2개, 비중 50:50');
  ok(p.horizonDays === 14 && p.stopBasis === 'CLOSE' && p.stopHours === 1, '코인형: 기간 2주, 1시간 종가 손절');
}
{
  const p = parseCall('#가상전자 현재가 매수가능 8천 칼손절 잡고 일봉 종가 기준 일봉아랫꼬리공략 단기 추석이후 11천~1.2만도달 가능해보이는 위치', RULES);
  ok(p.ok && p.name === '가상전자' && p.entryMode === 'MARKET' && p.entry === null && p.sl === 8000, '주식형: 해시태그 종목·현재가 진입·천 단위 손절');
  ok(p.tps.length === 1 && p.tps[0].price === 11000, '주식형: 범위 목표 하단(11,000) 적용');
  ok(p.horizonDays === 14 && p.flags.includes('기간이 이벤트 기준'), '주식형: 이벤트 기간 → 14일 + 검토 표시');
  ok(p.stopBasis === 'CLOSE' && p.stopHours === 24, '주식형: 일봉 종가 손절');
}
{
  ok(normalizePrices('2만5천원 매수, 1,250원') === '25000원 매수, 1250원', '복합 단위·쉼표 정규화');
  const p = parseCall('테스트 2만5천원 매수 2만3천 손절 3만원 목표 20일선 지지', RULES);
  ok(p.entry === 25000 && p.sl === 23000 && p.tps[0].price === 30000, '복합 단위 가격 인식');
  ok(p.horizonDays === RULES.defaultDays && p.flags.includes('기간 표기 없음(기본값)'), '"20일선"을 기간으로 오인하지 않음');
  ok(p.stopBasis === 'TOUCH' && p.flags.includes('손절 기준 미명시(터치 적용)'), '손절 기준 미명시 → 터치 + 검토 표시');
}

// ───────── 시뮬레이터 (1시간봉, 비용 0) ─────────
const T0 = Date.UTC(2025, 0, 6, 0, 0) / 1000; // UTC 00시 정렬(업비트 일봉 마감과 일치)
const zero = { buy: 0, sell: 0 };
const mk = (n, fn) => Array.from({ length: n }, (_, i) => [T0 + i * HOUR, ...(fn(i) ?? [1000, 1000, 1000, 1000])]);
const call = (over = {}) => ({
  id: 't', market: 'UPBIT', tPost: T0 + 10 * HOUR, entryMode: 'PRICE', entry: 1000, sl: 950,
  tps: [{ price: 1300, weight: 0.5 }, { price: 1800, weight: 0.5 }], horizonDays: 14,
  stopBasis: 'TOUCH', stopHours: null, ...over,
});
const N = 24 * 20;

{
  const r = simulate(call(), mk(N, (i) => (i === 12 ? [1000, 1000, 940, 990] : null)), HOUR, RULES, zero);
  ok(r.mode === 'MARKET' && r.pf === 1000 && r.lastReason === 'SL' && near(r.R, -1), '터치 손절 → −1R');
}
{
  const r = simulate(call(), mk(N, (i) => (i === 12 ? [1000, 1310, 1000, 1200] : i > 12 ? [1200, 1200, 1200, 1200] : null)), HOUR, RULES, zero);
  ok(r.exits[0].reason === 'TP1' && r.lastReason === 'EXPIRY' && near(r.R, 5), '1차 익절 후 기간 만료 → +5R');
}
{
  const r = simulate(call(), mk(N, (i) => (i === 12 ? [1000, 1310, 940, 1000] : null)), HOUR, RULES, zero);
  ok(r.lastReason === 'SL' && near(r.R, -1), '터치: 같은 봉 목표·손절 동시 → 손절 우선');
}
{
  const r = simulate(call(), mk(N, (i) => (i === 12 ? [900, 910, 890, 900] : null)), HOUR, RULES, zero);
  ok(r.lastReason === 'SL_GAP' && near(r.R, -2), '갭 하락 → 시가 청산(−2R)');
}
{
  const r = simulate(call({ entry: 900 }), mk(N, () => null), HOUR, RULES, zero);
  ok(r.status === 'UNFILLED' && r.mode === 'LIMIT', '진입가 −10% 지정가, 미도달 → 미체결');
}
{
  const bars = mk(N, (i) => (i === 12 ? [1000, 1000, 940, 960] : i === 13 ? [960, 960, 935, 940] : i === 14 ? [945, 950, 940, 945] : null));
  const r = simulate(call({ stopBasis: 'CLOSE', stopHours: 1 }), bars, HOUR, RULES, zero);
  ok(r.lastReason === 'SL_CLOSE' && r.exits[0].t === T0 + 14 * HOUR && near(r.R, -1.1), '1시간 종가 손절: 꼬리 무시, 종가 이탈 후 다음 봉 시가 청산');
}
{
  const bars = mk(N, (i) => (i === 12 ? [1000, 1000, 930, 940] : i === 47 ? [960, 960, 925, 930] : i === 48 ? [930, 935, 925, 930] : null));
  const r = simulate(call({ stopBasis: 'CLOSE', stopHours: 24 }), bars, HOUR, RULES, zero);
  ok(r.lastReason === 'SL_CLOSE' && r.exits[0].t === T0 + 48 * HOUR && near(r.R, -1.4), '일봉 종가 손절: 시간봉 이탈은 무시, 일 마감(KST 09시) 이탈만 판정');
}
{
  const bars = mk(N, (i) => (i === 12 ? [1000, 1310, 940, 1000] : null));
  const r = simulate(call({ stopBasis: 'CLOSE', stopHours: 1 }), bars, HOUR, RULES, zero);
  ok(r.exits[0].reason === 'TP1', '종가 손절에서는 봉 중간 익절이 종가 판정보다 먼저');
}
{
  const r = simulate(call({ entryMode: 'MARKET', entry: null }), mk(N, (i) => (i === 12 ? [1000, 1000, 940, 990] : null)), HOUR, RULES, zero);
  ok(r.pf === 1000 && near(r.risk, 0.05) && near(r.R, -1), '현재가 진입 → 다음 봉 시가, 리스크는 체결가 기준');
}
{
  const r = simulate(call(), mk(N, (i) => (i === 12 ? [1000, 1000, 940, 990] : null)), HOUR, RULES, COSTS.UPBIT);
  ok(r.R < -1 && near(r.R, ((950 * (1 - COSTS.UPBIT.sell)) / (1000 * (1 + COSTS.UPBIT.buy)) - 1) / 0.05, 1e-9), '비용 반영 시 손절은 −1R보다 나쁨');
}
{
  const bars = mk(N, (i) => (i === 12 ? [1000, 1310, 1000, 1200] : i === 14 ? [1100, 1100, 990, 1000] : i > 12 ? [1100, 1100, 1100, 1100] : null));
  const a = simulate(call(), bars, HOUR, RULES, zero);
  const b = simulate(call(), bars, HOUR, RULES, zero, { breakevenAfterTp1: true });
  ok(b.lastReason === 'SL' && near(b.R, 3), 'B안: 1차 익절 후 본절 손절 → +3R');
  ok(a.lastReason === 'EXPIRY' && near(a.R, 3 + 0.5 * 0.1 / 0.05), 'A안: 처음 손절가 유지 → 만료 청산');
}
{
  const tps = [{ price: 1300, weight: 1 }];
  const r = simulate(call({ entry: 1100, sl: 1050, tps }), mk(N, (i) => (i === 12 ? [1000, 1150, 1000, 1120] : i > 12 ? [1120, 1310, 1110, 1300] : null)), HOUR, RULES, zero);
  ok(r.mode === 'BREAKOUT' && r.pf === 1100 && r.exits[0].t === T0 + 13 * HOUR && near(r.R, 4), '돌파 진입: 진입가 체결, 체결 봉에서는 익절 불인정, 다음 봉 익절 → +4R');
  const s = simulate(call({ entry: 1200, sl: 1150, tps: [{ price: 1250, weight: 1 }] }), mk(N, (i) => (i >= 11 ? [1260, 1270, 1255, 1265] : null)), HOUR, RULES, zero);
  ok(s.status === 'SKIPPED' && s.reason === '진입 시점에 이미 1차 목표 도달', '진입가를 넘어 목표까지 갭 → 매매 제외');
}

{
  // 일봉 + 장중 게시 현재가 매수 → 당일 종가 체결, 다음 날 시가 갭 손절
  const D = 86400;
  const T1 = Date.UTC(2025, 0, 6) / 1000 - 9 * 3600; // KST 00:00
  const bars = Array.from({ length: 10 }, (_, i) => [T1 + i * D, 1000, 1010, 990, 1000]);
  bars[3] = [T1 + 3 * D, 1000, 1050, 995, 1020]; // 게시일: 종가 1020
  bars[4] = [T1 + 4 * D, 940, 960, 930, 950]; // 다음 날 갭 하락 시가 940 < 손절 960
  const r = simulate(
    { id: 't', market: 'KRX', tPost: T1 + 3 * D + 12 * 3600, entryMode: 'MARKET', entry: null, sl: 960, tps: [{ price: 1200, weight: 1 }], horizonDays: 14, stopBasis: 'TOUCH', stopHours: null },
    bars, D, RULES, zero,
  );
  ok(r.mode === 'MARKET_CLOSE' && r.pf === 1020 && r.lastReason === 'SL_GAP' && near(r.R, (940 / 1020 - 1) / ((1020 - 960) / 1020)), '일봉·장중 현재가 매수 → 당일 종가 체결 후 다음 날 갭 손절');
}

// ───────── 통계 ─────────
{
  const res = [5, -1, -1, 3, -1].map((R, i) => ({ status: 'FILLED', R, tFill: i, tExit: i + 0.5, holdDays: 1, lastReason: 'x', incomplete: false }));
  const s = stats(res, CRITERIA);
  ok(near(s.meanR, 1) && near(s.pf, 8 / 3) && near(s.winRate, 0.4), '통계: 평균 R·PF·승률');
  ok(s.verdict === '판정 불가(표본 부족)', '통계: 50건 미만이면 판정 불가');
  const expectMdd = 0.99 * 0.99 - 1; // 두 번째·세 번째 연속 손실
  ok(near(s.mdd, expectMdd, 1e-9), '통계: 최대낙폭(건당 1% 복리)');
}

// ───────── 방송 직접 기록(live.mjs) 형식 ─────────
{
  const p = parseCall('9500만 아래 매수 손절 9000만 목표 1억 1주', RULES);
  ok(p.ok && p.entry === 95000000 && p.sl === 90000000 && p.tps[0].price === 100000000 && p.horizonDays === 7, '억 단위 가격("1억")');
  ok(normalizePrices('1억2천만 목표') === '120000000원 목표', '"1억2천만" 정규화');
  const q = parseCall('지금 매수 손절 3만 목표 3.5만 일봉종가', RULES);
  ok(q.ok && q.entryMode === 'MARKET' && q.sl === 30000 && q.tps[0].price === 35000 && q.stopBasis === 'CLOSE' && q.stopHours === 24, '"지금 매수" = 현재가 진입, "3.5만 일봉종가"의 일봉은 기간 아님');
  const { interpret } = await import('./live.mjs');
  const r = interpret('샘플전자 7만 매수 손절 6.8만 목표 7.5만 8만 2주', (n) => (n === '샘플전자' ? ['KRX', '000000'] : null));
  ok(r.kind === 'call' && r.name === '샘플전자' && r.parsed.ok && r.hit[1] === '000000' && /✅ 기록/.test(r.reply), 'live: 첫 단어 = 종목명, 확인 답장');
  ok(interpret('취소 샘플전자').kind === 'cancel' && interpret('취소').name === null, 'live: 취소 명령');
  ok(interpret('안녕하세요 오늘 방송').kind === 'ignore' && interpret('샘플전자 매수').kind === 'ignore', 'live: 콜 형식이 아니면 무시');
  ok(interpret('샘플전자 매수 손절 없음').kind === 'call' && !interpret('샘플전자 매수 손절 없음').parsed.ok, 'live: 손절·목표 없으면 기록하되 검증 제외');
}

{
  // 일봉: 장 마감(15:20 KST) 이후 게시된 현재가 매수 → 그날 종가 체결 불가, 다음 거래일 시가 체결
  const D = 86400;
  const T1 = Date.UTC(2025, 0, 6) / 1000 - 9 * 3600; // KST 00:00
  const bars = Array.from({ length: 10 }, (_, i) => [T1 + i * D, 1000, 1010, 990, 1000]);
  bars[3] = [T1 + 3 * D, 1000, 1050, 995, 1020]; // 게시일 종가 1020
  bars[4] = [T1 + 4 * D, 1030, 1100, 1025, 1090]; // 다음 날 시가 1030
  const call = { id: 't', market: 'KRX', entryMode: 'MARKET', entry: null, sl: 960, tps: [{ price: 1200, weight: 1 }], horizonDays: 14, stopBasis: 'TOUCH', stopHours: null };
  const late = simulate({ ...call, tPost: T1 + 3 * D + 16 * 3600 }, bars, D, RULES, zero); // 16:00 KST
  ok(late.status === 'FILLED' && late.mode === 'MARKET' && late.pf === 1030 && late.tFill === T1 + 4 * D, '일봉·장 마감 후 현재가 매수 → 다음 날 시가 체결');
  const early = simulate({ ...call, tPost: T1 + 3 * D + 14 * 3600 }, bars, D, RULES, zero); // 14:00 KST
  ok(early.mode === 'MARKET_CLOSE' && early.pf === 1020, '일봉·장중 현재가 매수 → 당일 종가 체결(기존 규칙 유지)');
  // 마감 후 지정가: 기준가는 그날 종가(1020) → 1000 은 아래(LIMIT). 다음 날 저가 1025 미도달, 그다음 날 저가 990 → 체결
  const lim = simulate({ ...call, entryMode: 'PRICE', entry: 1000, tPost: T1 + 3 * D + 16 * 3600 }, bars, D, RULES, zero);
  ok(lim.mode === 'LIMIT' && lim.pf === 1000 && lim.tFill === T1 + 5 * D, '일봉·장 마감 후 지정가 → 기준가는 그날 종가, 이틀 뒤 체결');
}

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
