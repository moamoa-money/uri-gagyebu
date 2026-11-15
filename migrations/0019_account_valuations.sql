-- 0019: 주식 같은 통장의 월말 평가금액 (덧붙이기만). 거래(넣은 돈)는 그대로 두고 평가금액만 따로 적음.
-- 평가금액을 안 적은 달 = 가장 최근 평가금액 + 그 뒤에 넣은(뺀) 돈
CREATE TABLE IF NOT EXISTS account_valuations (
  account_id TEXT NOT NULL REFERENCES accounts (id),
  month TEXT NOT NULL CHECK (length(month) = 7),  -- 2026-10 (그달 말 기준)
  amount INTEGER NOT NULL,                         -- 평가금액 (원)
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, month)
);
