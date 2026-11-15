-- 0015: 중장기로드맵 매달 버전 (덧붙이기만). 그 순간의 로드맵을 통째로 보관 → 지난달과 비교, 카페 이미지.
-- snapshot = { plan, years, milestones, rows, notes } JSON (보관용이라 고치지 않음, 같은 달에 다시 저장하면 덮어씀)
CREATE TABLE IF NOT EXISTS long_roadmap_versions (
  plan_year TEXT NOT NULL REFERENCES long_roadmaps (plan_year),
  month TEXT NOT NULL CHECK (length(month) = 7),  -- 2026-11
  snapshot TEXT NOT NULL,
  saved_by TEXT,
  saved_at INTEGER NOT NULL,
  PRIMARY KEY (plan_year, month)
);
