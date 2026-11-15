-- 0018: 상환표 금액을 예산에 더하기 시작하는 달 (그 전 달 결산은 그대로 두려고). 덧붙이기만.
ALTER TABLE loan_links ADD COLUMN start_month TEXT CHECK (start_month IS NULL OR length(start_month) = 7);
