-- 우리집 가계부 첫 표들
-- 규칙: 앞으로 바꿀 때는 "더하기"만 한다 (표·칸 추가). 지우거나 이름 바꾸지 않는다.
-- 금액은 모두 원 단위 정수.

-- 가족 (각자 로그인)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,          -- PBKDF2 결과 (base64)
  pw_salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',   -- owner / member
  created_at INTEGER NOT NULL
);

-- 앱 설정 (로그인 서명 키, 가계부 이름 등)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 로그인 실패 기록 (잠금용)
CREATE TABLE IF NOT EXISTS login_fails (
  at INTEGER NOT NULL
);

-- 카테고리: 대분류(grp)는 고정 5개, 그 아래는 자유
--   grp: var(변동지출) fix(고정지출) inc(수입) sav(저축) inv(투자)
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grp TEXT NOT NULL CHECK (grp IN ('var','fix','inc','sav','inv')),
  emoji TEXT NOT NULL DEFAULT '',
  budget INTEGER NOT NULL DEFAULT 0,   -- 기본 월 예산 (달마다 따로 정하면 budgets 표)
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 달마다 다른 예산 (없으면 categories.budget)
CREATE TABLE IF NOT EXISTS budgets (
  category_id TEXT NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,                 -- YYYY-MM
  amount INTEGER NOT NULL,
  PRIMARY KEY (category_id, month)
);

-- 통장·카드
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- 은행 / 카드 / 적금 / 목돈 / 증권 / 청약 / 대출 / 현금
  start_balance INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 고정지출(·고정수입·정기저축): 매월 1일에 그달 거래를 자동으로 만든다
CREATE TABLE IF NOT EXISTS recurring (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id),
  amount INTEGER NOT NULL,
  day INTEGER NOT NULL DEFAULT 1,      -- 매월 며칠 (말일보다 크면 말일)
  from_account TEXT REFERENCES accounts(id),
  to_account TEXT REFERENCES accounts(id),
  start_month TEXT NOT NULL,           -- 이 달부터
  end_month TEXT,                      -- 이 달까지 (비우면 계속)
  active INTEGER NOT NULL DEFAULT 1,
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

-- 거래: 한 줄 = 돈이 한 번 움직인 것
--   지출: category(var/fix) + from_account
--   수입: category(inc) + to_account
--   저축·투자: category(sav/inv) + from_account (+ to_account: 그 돈이 들어간 통장)
--   이체: category 없음 + from_account + to_account
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,                  -- YYYY-MM-DD
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  category_id TEXT REFERENCES categories(id),
  from_account TEXT REFERENCES accounts(id),
  to_account TEXT REFERENCES accounts(id),
  memo TEXT NOT NULL DEFAULT '',
  unnecessary INTEGER NOT NULL DEFAULT 0,   -- "불필요" 표시
  recurring_id TEXT REFERENCES recurring(id),
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tx_date ON transactions (date);
CREATE INDEX IF NOT EXISTS tx_category ON transactions (category_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS tx_recurring_once ON transactions (recurring_id, date) WHERE recurring_id IS NOT NULL;

-- 투자 목록
CREATE TABLE IF NOT EXISTS investments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '주식',   -- 주식 / 딜투자 / 기타
  status TEXT NOT NULL DEFAULT '투자중', -- 투자중 / 재투자 / 만기완료
  account_id TEXT REFERENCES accounts(id),
  amount INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  maturity TEXT,
  returned INTEGER,                    -- 만기 때 돌려받은 금액
  memo TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 변경 기록 (누가 무엇을 바꿨는지)
CREATE TABLE IF NOT EXISTS activity (
  at INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL
);
