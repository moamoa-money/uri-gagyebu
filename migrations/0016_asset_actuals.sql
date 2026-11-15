-- 0016: 로드맵 '실제' 줄 (덧붙이기만)
-- 1) 실제 자산에 넣을 통장: 1 = 넣기. 처음엔 모아 두는 통장 종류(목돈·적금·청약·증권·투자)만 넣음, 대출·생활 통장은 뺌
ALTER TABLE accounts ADD COLUMN in_assets INTEGER NOT NULL DEFAULT 0 CHECK (in_assets IN (0, 1));
UPDATE accounts SET in_assets = 1 WHERE kind IN ('목돈', '적금', '청약', '증권', '투자');

-- 2) 해마다 실제 연말 자산을 직접 적은 값 (주식 평가금액처럼 통장 잔액으로 안 잡히는 것). 없으면 통장 잔액으로 자동 계산
--    로드맵 버전과 상관없는 사실 기록이라 따로 둠 (원 단위)
CREATE TABLE IF NOT EXISTS asset_actuals (
  y INTEGER PRIMARY KEY CHECK (y BETWEEN 1900 AND 2200),
  amount INTEGER NOT NULL,
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);
