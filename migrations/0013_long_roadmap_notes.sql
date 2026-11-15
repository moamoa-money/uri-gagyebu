-- 0013: 중장기로드맵 글 줄 (일·가족·투자공부·성장·버킷리스트…) — 사람마다 다르게 이름·순서 바꾸고 더하기 (덧붙이기만)
CREATE TABLE IF NOT EXISTS long_roadmap_rows (
  id TEXT PRIMARY KEY,
  plan_year TEXT NOT NULL REFERENCES long_roadmaps (plan_year),
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_long_rows_plan ON long_roadmap_rows (plan_year, sort);

-- 그 줄의 그해 칸 글
CREATE TABLE IF NOT EXISTS long_roadmap_notes (
  row_id TEXT NOT NULL REFERENCES long_roadmap_rows (id),
  y INTEGER NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (row_id, y)
);
