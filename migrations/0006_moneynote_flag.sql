-- 0006: 머니노트 표시 (덧붙이기만)
-- 선생님 결정(2026-11-14): '특별지출'을 따로 떼니 결산이 나빠 보임(계획 없는 여행 등) → 노션처럼 변동지출 안에 두고,
-- 머니노트로 예산을 잡는 카테고리에만 표시를 단다.
-- 그달 예산 = 그달 머니노트 합계(적어 둔 게 있으면) → 아니면 그달 따로 정한 예산 → 아니면 기본 월 예산.
-- (0005에서 대분류 spc를 허용해 두었지만 화면에서는 쓰지 않는다 — 지우지 않고 남겨 둠)
ALTER TABLE categories ADD COLUMN moneynote INTEGER NOT NULL DEFAULT 0;
UPDATE categories SET moneynote = 1, grp = 'var' WHERE grp = 'spc';
