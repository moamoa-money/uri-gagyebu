-- 0024: 꾸미기 그림 보관함 (덧붙이기만)
-- 선생님 요청(2026-11-17): 스티커를 여러 장 올려 두고, 결산 카페 이미지 만들 때 골라 쓰기.
-- 그림은 화면에서 작게 줄인 data URL(문자열)로 저장. 가족 공용.
CREATE TABLE IF NOT EXISTS look_images (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('sticker')),
  data TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS look_images_kind ON look_images (kind, sort);
-- 예전에 하나만 올려 둔 스티커가 있으면 보관함 첫 장으로 옮겨 둠 (원래 칸은 그대로 남김)
INSERT INTO look_images (id, kind, data, sort, created_by, created_at)
  SELECT lower(hex(randomblob(16))), 'sticker', value, 0, NULL, CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM settings WHERE key = 'look_sticker' AND NOT EXISTS (SELECT 1 FROM look_images WHERE kind = 'sticker');
