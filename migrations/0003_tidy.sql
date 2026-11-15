-- 0003: 확장·유지보수를 위한 정리 (덧붙이기만 — 기존 칸·표는 그대로 둔다)

-- 1) 카테고리 아이콘: 선 아이콘 이름(예: 'shopping-cart')을 담을 제대로 된 칸.
--    예전 emoji 칸은 지우지 않고 남겨 두며(옛 버전 호환), 앱은 icon을 먼저 읽고 비어 있으면 emoji를 읽는다.
ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT '';
UPDATE categories SET icon = emoji WHERE icon = '';

-- 2) 해마다의 목표 (연간 목표 저축 등). 예전엔 settings의 'save_target:연도' 메모에 있었음 → 옮겨 담음.
--    앞으로 연간 결산·로드맵에서 해마다 값이 더 생기면 이 표에 칸을 더한다.
CREATE TABLE IF NOT EXISTS year_goals (
  year TEXT PRIMARY KEY CHECK (length(year) = 4),
  save_target INTEGER NOT NULL DEFAULT 0 CHECK (save_target >= 0),
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO year_goals (year, save_target, updated_at)
  SELECT substr(key, 13), CAST(value AS INTEGER), CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM settings WHERE key LIKE 'save_target:____';

-- 3) 사람마다 다른 화면 취향 (거래 화면에 보일 통장 등). 예전엔 settings의 'tx_balance_accounts:사용자id' → 옮겨 담음.
CREATE TABLE IF NOT EXISTS user_prefs (
  user_id TEXT NOT NULL REFERENCES users(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);
INSERT OR IGNORE INTO user_prefs (user_id, key, value)
  SELECT substr(key, 21), 'balance_accounts', value
  FROM settings WHERE key LIKE 'tx_balance_accounts:%' AND substr(key, 21) IN (SELECT id FROM users);

-- 4) 자주 찾는 길에 색인 (통장별 거래, 달별 예산, 변경 기록)
CREATE INDEX IF NOT EXISTS tx_from ON transactions (from_account, date);
CREATE INDEX IF NOT EXISTS tx_to ON transactions (to_account, date);
CREATE INDEX IF NOT EXISTS budgets_month ON budgets (month);
CREATE INDEX IF NOT EXISTS activity_at ON activity (at);
