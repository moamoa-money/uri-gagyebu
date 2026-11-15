-- 0007: 머니노트 '더하기' 방식 (덧붙이기만)
-- 보리처럼 매달 기본 비용(165,000)이 있고 가끔(정기 검진) 큰돈이 얹히는 카테고리:
--   moneynote_add = 1 → 그달 예산 = (그달 예산 또는 기본 예산) + 그달 머니노트 합계
--   moneynote_add = 0 → 그달 예산 = 머니노트 합계 (적은 달), 아니면 그달 예산·기본 예산  (경조사·여행처럼)
ALTER TABLE categories ADD COLUMN moneynote_add INTEGER NOT NULL DEFAULT 0;
