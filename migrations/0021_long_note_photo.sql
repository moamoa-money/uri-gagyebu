-- 0021: 로드맵 글 칸에 사진 (버킷리스트 등). 화면에서 작게 줄인 JPEG를 data URL 글자로 저장 (덧붙이기만)
ALTER TABLE long_roadmap_notes ADD COLUMN photo TEXT;
