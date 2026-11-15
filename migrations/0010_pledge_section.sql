-- 0010: 다짐을 구역별로 (덧붙이기만). section = var | fix | inc | sav ('' = 예전처럼 구역 없음)
ALTER TABLE pledges ADD COLUMN section TEXT NOT NULL DEFAULT '';
