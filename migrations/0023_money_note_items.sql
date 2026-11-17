-- 0023: 머니노트 세부 항목 목록 (덧붙이기만)
-- 선생님 요청(2026-11-17): '엄마 생신'·'명절'처럼 세부 항목 줄을 미리 만들어 두고 금액은 나중에 채우기.
-- 줄 이름만 저장한다. 금액은 지금처럼 money_notes(같은 이름의 줄)에 들어감.
-- 그해(year)마다 따로: 작년 머니노트 불러오기 하면 줄도 함께 넘어감.
CREATE TABLE IF NOT EXISTS money_note_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  year TEXT NOT NULL,                  -- YYYY
  title TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (category_id, year, title)
);
CREATE INDEX IF NOT EXISTS money_note_items_year ON money_note_items (year, category_id);
