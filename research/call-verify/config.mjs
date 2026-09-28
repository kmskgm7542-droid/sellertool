// 사전 확정 설정 — 검증을 돌린 뒤에는 바꾸지 않는다. 바꿀 경우 README의 변경 기록에 남긴다.

export const RULES = {
  // 진입: 게시 직전 가격과 진입가의 거리가 이 비율 이내면 "즉시 매수"(다음 봉 시가)
  nearPct: 0.01,
  // 지정가·돌파 진입을 기다리는 최대 기간(게시 시각부터)
  entryWindowDays: 5,
  // 목표가 범위("19천~2만")는 하단을 적용(보수적). 'low' | 'mid'
  rangePick: 'low',
  // 기간 기본값(일)
  shortDays: 7, // "단기"
  midDays: 30, // "중기"
  longDays: 90, // "장기"
  eventDays: 14, // "추석이후" 등 이벤트 기준
  defaultDays: 14, // 기간 표기가 전혀 없을 때
  // 종가 손절 발동 시 청산 가격: 'nextOpen'(다음 봉 시가) | 'close'(해당 봉 종가)
  closeStopExit: 'nextOpen',
  // 일봉(국내주식): 게시 시각이 그날 KST 이 시각(15:20) 이후면 그날 체결 불가 → 다음 거래일 시가부터. (봉 시작 = KST 00:00 기준 경과 시간)
  dailyFillCutoffHours: 15 + 20 / 60,
};

// 편도 비용(비율). 슬리피지는 소형 종목 기준의 보수적 가정.
export const COSTS = {
  UPBIT: { buy: 0.0005 + 0.001, sell: 0.0005 + 0.001 },
  // 증권거래세는 매도에만 부과. 세율은 연도별로 바뀔 수 있으니 실행 전 확인.
  KRX: { buy: 0.00015 + 0.002, sell: 0.00015 + 0.002 + 0.002 },
};

// 사전 합격 기준
export const CRITERIA = {
  minFilled: 50, // 체결된 콜 수
  minT: 2, // 기대값(R)의 t값
  minPF: 1.3, // 수익 팩터(R 기준)
  maxDD: -0.15, // 건당 리스크 1% 복리 곡선의 최대낙폭
  riskPerTrade: 0.01, // 손절 시 계좌 손실 비율
};
