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
  const p = parseCall('샘플코인 설명드린대로 다시 회복하는 모양세죠 4시간 종가로 65.8 이탈컷잡고 71~70원 매수 1~2주 단기로는 90원 목표가', RULES);
  ok(p.ok && p.name === '샘플코인' && p.entry === 71 && p.sl === 65.8 && p.tps[0].price === 90, '매수 앞 손절·글머리 종목명');
  ok(p.stopBasis === 'CLOSE' && p.stopHours === 4 && p.horizonDays === 14, '매수 앞 손절: 4시간 종가·기간 2주');
  const q = parseCall('가상종목 다시 폼좋아지네요 96원아래 매수 90손절잡고 스윙으론180노려볼 자리', RULES);
  ok(q.ok && q.name === '가상종목' && q.sl === 90, '서술어("…네요")를 종목명으로 오인하지 않음');
  const r = parseCall('회원 가상헬스 현재가 6450부근 매수 6200이탈마감 컷잡고 8900원 2~4주', RULES);
  ok(r.ok && r.name === '가상헬스', '"현재가"를 종목명("현재")으로 오인하지 않음');
  const s = parseCall('가상토큰 550원매수 530원일봉종가 이탈컷잡고 650원 노려볼수있는자리', RULES);
  ok(s.ok && s.sl === 530 && s.stopBasis === 'CLOSE', '"530원일봉종가 이탈컷" 띄어쓰기 손절');
}
{
  ok(normalizePrices('2만5천원 매수, 1,250원') === '25000원 매수, 1250원', '복합 단위·쉼표 정규화');
  const p = parseCall('테스트 2만5천원 매수 2만3천 손절 3만원 목표 20일선 지지', RULES);
  ok(p.entry === 25000 && p.sl === 23000 && p.tps[0].price === 30000, '복합 단위 가격 인식');
  ok(p.horizonDays === RULES.defaultDays && p.flags.includes('기간 표기 없음(기본값)'), '"20일선"을 기간으로 오인하지 않음');
  ok(p.stopBasis === 'TOUCH' && p.flags.includes('손절 기준 미명시(터치 적용)'), '손절 기준 미명시 → 터치 + 검토 표시');
}
{
  const p = parseCall('샘플코인 51.5~~부근 매수 47.8 손절 80원목표 2주', RULES);
  ok(p.name === '샘플코인' && p.entryMode === 'PRICE' && p.entry === 51.5 && p.sl === 47.8 && p.tps[0]?.price === 80, '겹친 물결("51.5~~부근 매수") → 진입가 인식');
  const q = parseCall('샘플코인 40~42원 매수 38 손절 50 목표', RULES);
  ok(q.entry === 42 && q.sl === 38, '물결 범위 진입("40~42원")은 그대로 범위로 인식');
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

{
  // 자막 자동추출: 비율(0.5%)은 가격이 아니고, "23만 5,000원"은 한 숫자, 방송자가 "추천 안 합니다"라고 밝힌 설명은 뽑지 않는다
  const { normalizeSpeech, extractFromSegments } = await import('./extract_rules.mjs');
  const n = normalizeSpeech('가나다 23만 5,000원까지 가고 0.5% 손절');
  ok(/235000원/.test(n) && !/0\.5/.test(n), '자막: 23만 5,000원 → 235000, 0.5% 제거');
  const re = /(?<![가-힣A-Za-z0-9])(가나다)/g;
  const seg = (t, text) => ({ t, text });
  const said = [seg(0, '추천은 안 합니다 설명만 드리는 거예요'), seg(5, '가나다 여기서 매수 해 볼 수 있는 자리'), seg(10, '손절 1000원 목표 1500원')];
  ok(extractFromSegments(said, re).length === 0, '자막: "추천 안 합니다" 설명은 콜로 뽑지 않음');
  const call = [seg(0, '가나다 지금 매수 괜찮아 보입니다'), seg(5, '손절 1000원 목표 1500원')];
  ok(extractFromSegments(call, re).length === 1, '자막: 일반 콜은 그대로 뽑음');
}

{
  // 관심종목 장부: 명령 해석·가격 판정·알림 중복 방지·봇 처리(가상 종목, 임시 파일)
  const W = await import('./watchlist.mjs');
  const c = W.parseWatchCommand('관심 가나다전자 대기 매수 15만~16만 손절 14.5만 목표 33만 50만');
  ok(c.kind === 'watch-add' && c.name === '가나다전자' && c.tier === '대기' && c.levels.buy.join() === '150000,160000'
    && c.levels.stop.join() === '145000' && c.levels.targets.join() === '330000,500000', '관심: 등록 명령(만 단위·범위·목표 2개)');
  const d = W.parseWatchCommand('관심 가나비전 장투 기준 28,000');
  ok(d.tier === '장투' && d.levels.line === 28000 && !d.levels.buy, '관심: 장투·기준선');
  ok(W.parseWatchCommand('관심 샘플코인 매수 0.95 손절 0.879').levels.buy.join() === '0.95,0.95', '관심: 소수 코인 가격');
  ok(W.parseWatchCommand('관심').kind === 'watch-list' && W.parseWatchCommand('관심 후보').kind === 'watch-cands', '관심: 목록·후보');
  const ap = W.parseWatchCommand('관심 승인 3 매수 35만');
  ok(ap.kind === 'watch-approve' && ap.ids.join() === '3' && ap.levels.buy[0] === 350000, '관심: 승인 번호 + 가격');
  ok(W.parseWatchCommand('관심 승인 전부').ids === 'all' && W.parseWatchCommand('관심 버림 2,4').ids.join() === '2,4', '관심: 전부 승인·여러 개 버림');
  ok(W.parseWatchCommand('관심종목 좋아요') === null && W.parseWatchCommand('가나다 1000 매수 손절 900') === null, '관심: 다른 문장은 무시');

  const it = { name: '가나다전자', tier: '대기', buy: [150000, 160000], stop: [145000], targets: [330000] };
  const keys = (p) => W.evaluate(it, p).map((x) => x.key).join();
  ok(keys(170000) === '' && keys(164000) === 'near-buy' && keys(155000) === 'buy', '관심: 접근(3%)·매수 구간 도달');
  ok(keys(140000) === 'stop:145000' && keys(340000) === 'tp:330000', '관심: 손절 이탈이면 매수 알림 대신 손절, 목표 도달');
  const ln = { name: '가나비전', tier: '장투', line: 28000 };
  ok(W.evaluate(ln, 28500).map((x) => x.key).join() === 'near-line' && W.evaluate(ln, 27900).map((x) => x.key).join() === 'line', '관심: 기준선 접근·이탈');
  const bk = { name: '나나차', tier: '관심', breakout: 310000 };
  ok(W.evaluate(bk, 305000)[0]?.key === 'near-brk' && W.evaluate(bk, 311000)[0]?.key === 'brk', '관심: 돌파 접근·돌파');

  const st = {};
  const on = W.evaluate(it, 155000);
  ok(W.newAlerts(st, 'K', on, '2026-01-05').length === 1, '알림: 처음 켜지면 보냄');
  ok(W.newAlerts(st, 'K', on, '2026-01-05').length === 0, '알림: 켜진 채로면 다시 안 보냄');
  W.newAlerts(st, 'K', [], '2026-01-05');
  ok(W.newAlerts(st, 'K', on, '2026-01-05').length === 0, '알림: 같은 날 꺼졌다 켜져도 하루 한 번');
  W.newAlerts(st, 'K', [], '2026-01-06');
  ok(W.newAlerts(st, 'K', on, '2026-01-06').length === 1, '알림: 다음 날 다시 켜지면 보냄');

  // 봇 처리(handleWatch) — 임시 장부 파일
  const fs = await import('node:fs');
  const os = await import('node:os');
  const pth = await import('node:path');
  const tmp = pth.join(fs.mkdtempSync(pth.join(os.tmpdir(), 'cv-')), 'watchlist.json');
  const { handleWatch, interpret } = await import('./live.mjs');
  const lookup = Object.assign((n) => (n === '가나다전자' ? ['KRX', '000000'] : null), { canonical: (n) => (n === '가나' ? '가나다전자' : n) });
  const ctx = { lookup, watchFile: tmp };
  const r1 = handleWatch(interpret('관심 가나 대기 매수 15만 손절 14만', lookup), ctx);
  const saved = W.loadWatch(tmp);
  ok(/가나다전자/.test(r1) && saved.items.length === 1 && saved.items[0].symbol === '000000' && saved.items[0].buy[0] === 150000, '봇: 별칭으로 등록 → 공식 이름·코드');
  saved.candidates.push({ id: 7, name: '샘플코인', tier: '장투', market: 'UPBIT', symbol: 'KRW-SMP', src: '방송', date: '01-05', count: 2 });
  W.saveWatch(saved, tmp);
  handleWatch(interpret('관심 승인 7 매수 100 손절 90', lookup), ctx);
  const s2 = W.loadWatch(tmp);
  ok(s2.candidates.length === 0 && s2.items.find((x) => x.name === '샘플코인')?.buy?.[0] === 100 && s2.items.find((x) => x.name === '샘플코인').tier === '장투', '봇: 후보 승인 + 가격 지정');
  handleWatch(interpret('관심 삭제 가나', lookup), ctx);
  ok(W.loadWatch(tmp).items.find((x) => x.name === '가나다전자').status === 'closed', '봇: 삭제 = 종료 표시(기록 유지)');

  // 강조 후보 찾기: 장투 표현 + 종목명, 일상어 코인명은 '코인'이 같이 나와야
  const { findEmphasis } = await import('./watch_scan.mjs');
  const re2 = /(?<![가-힣A-Za-z0-9])(가나다전자|보라)/g;
  const segs = [{ t: 0, text: '가나다전자 이런 애들은' }, { t: 5, text: '장투로 가져가도 괜찮을 것 같아요' }, { t: 9, text: '보라 이거 관심 종목에 넣어 두세요' }];
  const f = findEmphasis(segs, re2);
  ok(f.found.length === 1 && f.found[0].name === '가나다전자' && f.found[0].tier === '장투', '강조 후보: 장투 + 종목명, 일상어 "보라"는 제외');
}

{
  // 방송 가격 예측 기록·판정·도달 확률(가상 시세)
  const F = await import('./forecast.mjs');
  ok(F.speechPrices('16만4,000원 정도, 17만 원까지, 2만5천').join() === '164000,170000,25000', '예측: 말투 가격 읽기(만·천·쉼표)');
  ok(F.speechPrices('3시간 뒤 5개, 15% 수익').length === 0, '예측: 단위 없는 숫자·비율은 가격 아님');
  const re = /(?<![가-힣A-Za-z0-9])(가나다전자)/g;
  const segs = [{ t: 0, text: '가나다전자 기준으로 17만 원까지 내려올 수 있어요' }, { t: 5, text: '가나다전자 30만 원 물려 있으면' }, { t: 9, text: '다른 이야기' }];
  const fs2 = F.findForecasts(segs, re, (x) => x, new Set(['가나다전자']));
  ok(fs2.length === 1 && fs2[0].price === 170000, '예측: "까지 내려올" 가격만, "물려 있으면"은 제외');
  const bars = Array.from({ length: 40 }, (_, i) => ({ d: String(20260101 + i), o: 200000, h: 202000, l: i === 10 ? 169000 : 198000, c: 200000 }));
  const j = F.judge({ day: '20260103', price: 170000 }, bars, 20);
  ok(j.status === 'hit' && j.dir === '하락' && j.hit_day === '20260111' && j.exp >= 0 && j.exp <= 1, '예측: 기한 안 저가가 닿으면 적중 + 무작위 기대 확률');
  ok(F.judge({ day: '20260103', price: 150000 }, bars, 20).status === 'miss', '예측: 기한 지나도 안 닿으면 빗나감');
  ok(F.judge({ day: '20260103', price: 201000 }, bars, 20) === null && F.judge({ day: '20260103', price: 3000000 }, bars, 20) === null, '예측: 현재가 언급(2% 안)·동떨어진 숫자는 제외');
  ok(/적중 1\/2\(50%\) · 무작위 기대 0\.8\/2/.test(F.scoreText([{ status: 'hit', exp: 0.5 }, { status: 'miss', exp: 0.3 }, { status: 'pending' }])), '예측: 적중률과 무작위 기대 비교');
  const p = F.hitProb(bars, 190000, [20], true, { n: 500 });
  ok(p && p.mc[20] > 0 && p.mc[20] < 1 && p.emp[20] > 0, '도달 확률: 계산됨(변동성·과거 빈도)');
  ok(/20거래일 \d+(~\d+)?%/.test(F.probText(p, [20], '거래일')), '도달 확률: 범위 문구');
}

console.log(fail ? `\n실패 ${fail}건` : '\n전부 통과');
process.exit(fail ? 1 : 0);
