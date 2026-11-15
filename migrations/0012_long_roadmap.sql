-- 0012: 중장기로드맵 (3단계, 덧붙이기만). 금액은 다른 표와 같이 원 단위 정수, 화면에선 만 원.
-- 로드맵은 해마다 새로 만든다 (plan_year = 2026로드맵, 2027로드맵 …)
CREATE TABLE IF NOT EXISTS long_roadmaps (
  plan_year TEXT PRIMARY KEY CHECK (length(plan_year) = 4),
  span INTEGER NOT NULL DEFAULT 30 CHECK (span BETWEEN 5 AND 60),   -- 몇 해를 볼지
  age_start INTEGER NOT NULL CHECK (age_start BETWEEN 0 AND 120),    -- 첫해 나이 (나이 계산 방식은 사람마다 달라서 직접 적음)
  start_invest INTEGER NOT NULL DEFAULT 0,                            -- 첫해 투자자산 (원)
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

-- 해마다 저축액·수익률. 비어 있는 해는 앞 해 값을 이어 씀 (엑셀처럼 한 번 적으면 쭉)
CREATE TABLE IF NOT EXISTS long_roadmap_years (
  plan_year TEXT NOT NULL REFERENCES long_roadmaps (plan_year),
  y INTEGER NOT NULL,                                                  -- 달력 연도 (2026, 2027 …)
  saving INTEGER,                                                      -- 그해 저축액 (원), NULL = 앞 해와 같음
  rate_bp INTEGER CHECK (rate_bp IS NULL OR rate_bp BETWEEN -10000 AND 10000), -- 수익률 (만분율: 1000 = 10%), NULL = 앞 해와 같음
  updated_by TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (plan_year, y)
);

-- 이정표 (예: 2억·3억·6억·10억·20억) — 합계가 처음 넘는 해에 표시
CREATE TABLE IF NOT EXISTS long_roadmap_milestones (
  plan_year TEXT NOT NULL REFERENCES long_roadmaps (plan_year),
  amount INTEGER NOT NULL CHECK (amount > 0),
  PRIMARY KEY (plan_year, amount)
);
