-- 0011: 단기로드맵에 넣을 저축·투자 카테고리 고르기 (덧붙이기만). 1 = 넣기(기본), 0 = 빼기 (예: 딜 투자처럼 목돈을 잠깐 묶어 두는 곳)
ALTER TABLE categories ADD COLUMN in_roadmap INTEGER NOT NULL DEFAULT 1 CHECK (in_roadmap IN (0, 1));
