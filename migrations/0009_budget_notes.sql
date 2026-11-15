-- 0009: 다음 달 예산 메모 (덧붙이기만)
-- 결산하면서 다음 달 예산을 새로 잡거나 바꿀 때 이유를 한 줄 남김 (예: 원래 없던 여행 예산 → '12월 캠핑 계획')
CREATE TABLE IF NOT EXISTS budget_notes (
  category_id TEXT NOT NULL REFERENCES categories(id),
  month TEXT NOT NULL,          -- 예산이 적용되는 달 (YYYY-MM)
  note TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (category_id, month)
);
