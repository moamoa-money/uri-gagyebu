-- 0008: 머니플랜 (연간 계획) — 달마다 수입·고정·변동은 카테고리 예산에서 자동, 고친 칸만 여기 저장 (덧붙이기만)
-- row: inc(수입) | fix(고정지출) | var(변동지출). 특별지출 = 머니노트 합계, 목표 저축 = 수입 − 고정 − 변동 − 특별 (계산만)
CREATE TABLE IF NOT EXISTS money_plan (
  month TEXT NOT NULL,
  row TEXT NOT NULL CHECK (row IN ('inc', 'fix', 'var')),
  amount INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (month, row)
);
