-- 0004: 달별 예산 바꾼 기록 (되돌리기용). 덧붙이기만.
-- old_amount가 NULL이면 '그달 따로 정한 예산이 없었음'(카테고리 기본 예산을 쓰던 상태) → 되돌리면 그 줄을 지운다.
-- reason: review(월말 결산에서 올림) | settings(설정에서 고침)
CREATE TABLE IF NOT EXISTS budget_changes (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,
  old_amount INTEGER,
  new_amount INTEGER,
  reason TEXT NOT NULL DEFAULT 'settings',
  changed_by TEXT,
  changed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS budget_changes_cat_month ON budget_changes (category_id, month, changed_at);
