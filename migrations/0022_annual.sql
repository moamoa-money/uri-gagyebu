-- 0022: 연간 결산 (4단계, 덧붙이기만)
-- 1) 해마다 비교표용 숫자. 앱 기록이 없는 해(2024·2025)는 직접 적고, 앱 기록이 있는 해도 수익률·메모는 여기 적음.
--    비워 둔 칸은 앱이 계산 (앱 기록이 있는 해만). 금액은 원 단위.
CREATE TABLE IF NOT EXISTS year_records (
  year TEXT PRIMARY KEY CHECK (length(year) = 4),
  save_target INTEGER,      -- 그해 저축 목표
  save_actual INTEGER,      -- 그해 실제 저축
  return_bp INTEGER CHECK (return_bp IS NULL OR return_bp BETWEEN -10000 AND 100000), -- 투자 수익률 (만분율: 1000 = 10%)
  end_assets INTEGER,       -- 연말 자산
  memo TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

-- 2) 연간 회고 글 (section: review = 한 해 회고, plan = 새해 다짐 등)
CREATE TABLE IF NOT EXISTS year_notes (
  year TEXT NOT NULL CHECK (length(year) = 4),
  section TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (year, section)
);
