-- 0017: 대출 상환표 (원하는 사람만 — 설정에서 켜기, settings.feature_loan). 덧붙이기만.
-- 은행 상환계획표를 달마다 한 줄씩: 그달 원금·이자가 1~2원씩 달라지는 원리금균등 대출용
CREATE TABLE IF NOT EXISTS loan_schedule (
  account_id TEXT NOT NULL REFERENCES accounts (id),  -- 대출 통장 (예: 주담대)
  month TEXT NOT NULL CHECK (length(month) = 7),       -- 2026-11
  payment INTEGER NOT NULL DEFAULT 0,                  -- 월 납부금
  principal INTEGER NOT NULL DEFAULT 0,                -- 원금 납부액
  interest INTEGER NOT NULL DEFAULT 0,                 -- 이자 납부액
  balance INTEGER,                                     -- 남은 대출금 (그달 낸 뒤)
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, month)
);

-- 상환표 금액을 예산에 더할 카테고리 (원금 → 상환, 이자 → 대출이자). 비워 두면 안 더함
CREATE TABLE IF NOT EXISTS loan_links (
  account_id TEXT PRIMARY KEY REFERENCES accounts (id),
  principal_category TEXT REFERENCES categories (id),
  interest_category TEXT REFERENCES categories (id),
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
