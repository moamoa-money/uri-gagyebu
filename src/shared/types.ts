// 가계부 데이터 모양 (서버·화면·테스트가 함께 씀). 금액은 원 단위 정수.

// spc는 DB가 허용만 함(0005) — 화면에선 안 씀. 해마다 오는 돈은 변동지출 + 머니노트 표시(0006)
export type Group = 'var' | 'fix' | 'spc' | 'inc' | 'sav' | 'inv';
export const GROUPS: { key: Group; name: string; icon: string }[] = [
  { key: 'var', name: '변동지출', icon: 'shopping-bag' },
  { key: 'fix', name: '고정지출', icon: 'house' },
  { key: 'inc', name: '수입', icon: 'wallet' },
  { key: 'sav', name: '저축', icon: 'piggy-bank' },
  { key: 'inv', name: '투자', icon: 'trending-up' },
];
export const groupName = (g: Group) => GROUPS.find((x) => x.key === g)?.name ?? g;
export const isSpending = (g: Group | string | null | undefined) => g === 'var' || g === 'fix' || g === 'spc';

// 투자 = 실제 계좌가 아닌 '돈이 묶여 있는 곳' 바구니 (예: 딜 투자). 넣을 때 통장→바구니, 만기에 바구니→통장
export const ACCOUNT_KINDS = ['은행', '카드', '적금', '목돈', '증권', '청약', '투자', '대출', '현금'] as const;

export interface Category {
  id: string;
  name: string;
  grp: Group;
  icon: string; // 선 아이콘 이름 (DB icon 칸, 옛 emoji 칸은 호환용)
  moneynote: boolean; // 머니노트로 예산 잡는 카테고리 (명절·생일·재산세·여행…)
  moneynoteAdd: boolean; // true면 기본 예산 + 머니노트 (보리 정기 검진처럼)
  inRoadmap: boolean; // 저축·투자: 단기로드맵에 넣기 (0011, 기본 넣기)
  budget: number;
  sort: number;
  hidden: boolean;
}

export interface Account {
  id: string;
  name: string;
  kind: string;
  startBalance: number;
  sort: number;
  hidden: boolean;
}

export interface Tx {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  amount: number;
  categoryId: string | null;
  fromAccount: string | null;
  toAccount: string | null;
  memo: string;
  unnecessary: boolean;
  recurringId: string | null;
  createdBy: string | null;
}

export interface Recurring {
  id: string;
  title: string;
  categoryId: string | null;
  amount: number;
  day: number;
  fromAccount: string | null;
  toAccount: string | null;
  startMonth: string;
  endMonth: string | null;
  active: boolean;
  memo: string;
  mode?: 'auto' | 'batch'; // 0020: auto = 매달 자동, batch = 버튼으로 한꺼번에
  loanAccount?: string | null; // 0020: 대출 상환표 연결
  loanPart?: 'principal' | 'interest' | null;
  sort?: number;
}

export interface Investment {
  id: string;
  name: string;
  kind: string;
  status: string;
  accountId: string | null;
  amount: number;
  startDate: string | null;
  maturity: string | null;
  returned: number | null;
  memo: string;
}

export interface User {
  id: string;
  name: string;
  role: 'owner' | 'member';
}
