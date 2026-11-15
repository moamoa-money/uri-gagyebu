-- 0014: 위기 연도 표시 (덧붙이기만). 수익률과 따로 — 위기에 기회를 잡아 +50%를 노릴 수도 있으니까. 1 = 위기 연도(번개 표시)
ALTER TABLE long_roadmap_years ADD COLUMN crisis INTEGER NOT NULL DEFAULT 0 CHECK (crisis IN (0, 1));
