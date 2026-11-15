-- 월말 결산 (2단계). 기존 표는 건드리지 않고 새 표만 더한다 (업데이트해도 데이터 안전).

-- 구역별 피드백 글: section = var | fix | inc | sav | asset | roadmap
CREATE TABLE IF NOT EXISTS review_notes (
  month TEXT NOT NULL,
  section TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (month, section)
);

-- 예산을 넘긴(또는 아낀) 카테고리마다 원인 하나 + 한 줄 메모
-- cause = small_budget(예산이 작음) | yearly(해마다 옴) | new_fixed(새 고정비) | once(이번만) | reducible(줄일 수 있었음) | good(잘함)
CREATE TABLE IF NOT EXISTS review_causes (
  month TEXT NOT NULL,
  category_id TEXT NOT NULL,
  cause TEXT,
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (month, category_id)
);

-- 다짐: month = 지켜야 하는 달. kind num = 카테고리 금액 이하(앱이 자동 판정), text = 글 다짐(직접 지킴/못 지킴)
CREATE TABLE IF NOT EXISTS pledges (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('num', 'text')),
  category_id TEXT,
  limit_amount INTEGER,
  body TEXT NOT NULL DEFAULT '',
  result TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pledges_month ON pledges (month);
