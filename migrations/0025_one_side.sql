-- 한쪽만 있는 이체(입금만·출금만): 카테고리 없이 통장 하나만 움직인 기록.
-- 예) 동생 대신 카드 결제(출금만) → 며칠 뒤 동생이 보내 줌(입금만). 수입·지출에는 안 잡히고 잔액만 바뀐다.
-- 0 = 보통 거래, 1 = 한쪽 이체. (카테고리 없고 한쪽 통장만 있는데 0이면 '미분류' — 노션에서 옮긴 확인 필요 기록)
ALTER TABLE transactions ADD COLUMN one_side INTEGER NOT NULL DEFAULT 0 CHECK (one_side IN (0, 1));
