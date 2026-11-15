-- 0005: 특별지출(머니노트) 대분류 + 머니노트 표
--
-- 대분류에 spc(특별지출: 재산세·명절·생일처럼 매달은 아니지만 언제 얼마 나갈지 아는 돈)를 더한다.
-- SQLite는 CHECK(grp IN ...) 규칙을 고칠 수 없어서, categories 표만 같은 칸·같은 데이터로 다시 만든다.
-- (칸 이름·순서·값은 하나도 바꾸지 않고 그대로 옮김 — '덧붙이기만' 원칙의 유일한 예외, 데이터 손실 없음)
-- 다른 표가 categories(id)를 가리키므로, 옮기는 동안만 외래키 검사를 미룬다.
PRAGMA defer_foreign_keys = on;

CREATE TABLE categories_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  grp TEXT NOT NULL CHECK (grp IN ('var','fix','spc','inc','sav','inv')),
  emoji TEXT NOT NULL DEFAULT '',      -- 옛 칸 (호환용, 0003 참고)
  budget INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  icon TEXT NOT NULL DEFAULT ''
);
INSERT INTO categories_new (id, name, grp, emoji, budget, sort, hidden, created_at, icon)
  SELECT id, name, grp, emoji, budget, sort, hidden, created_at, icon FROM categories;
DROP TABLE categories;
ALTER TABLE categories_new RENAME TO categories;

PRAGMA defer_foreign_keys = off;

-- 머니노트: 해마다 오는 특별지출을 달마다 미리 적어 두는 곳. 한 칸(카테고리×달)에 여러 줄 가능.
--   예) 2026-09 · 경조사 생일 명절 · '추석 양가' 400,000 / '엄마 생일' 100,000
-- 특별지출 카테고리의 그달 예산 = 그달 머니노트 합계 (적어 둔 게 없으면 달별 예산·기본 예산)
CREATE TABLE IF NOT EXISTS money_notes (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,                 -- YYYY-MM
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  memo TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS money_notes_month ON money_notes (month, category_id);
