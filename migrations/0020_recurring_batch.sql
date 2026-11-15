-- 0020: 고정지출 넣는 방식 (덧붙이기만)
-- mode: auto = 매달 정한 날 저절로 (기본, 처음 설치하는 분들) / batch = '이번 달 고정지출 넣기' 버튼으로 확인하고 한꺼번에 (선생님 방식: 노션 목록 복사·붙여넣기를 옮김)
ALTER TABLE recurring ADD COLUMN mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto', 'batch'));
-- 대출 상환표와 연결: 이 항목 금액을 그달 상환표의 원금(principal) 또는 이자(interest)로 (대출 상환표 기능 켠 분만)
ALTER TABLE recurring ADD COLUMN loan_account TEXT REFERENCES accounts (id);
ALTER TABLE recurring ADD COLUMN loan_part TEXT CHECK (loan_part IS NULL OR loan_part IN ('principal', 'interest'));
-- 목록 순서
ALTER TABLE recurring ADD COLUMN sort INTEGER NOT NULL DEFAULT 0;
