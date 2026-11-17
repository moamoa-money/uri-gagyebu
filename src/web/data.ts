import type { Account, Category, Group, Recurring, Tx, User } from '../shared/types';

export interface Boot {
  user: User;
  users: User[];
  household: string;
  today: string;
  categories: Category[];
  accounts: Account[];
  recurring: Recurring[];
  groups: { key: Group; name: string; icon: string }[];
  accountKinds: string[];
  balanceAccounts: string[] | null;
  featureLoan: boolean;
  nospendCal?: boolean;
  theme?: string;
  coverVer?: string | null;
  stickerVer?: string | null;
  homeId?: string | null;
}
export type AccountWithBalance = Account & { balance: number };
export interface TxList {
  rows: Tx[];
  total: number;
  count: number;
  more?: boolean;
}
export type Toast = (msg: string) => void;

// 거래 화면 위 잔액 칸에 보일 통장: 고른 적 없으면 생활 통장(은행·카드·적금·목돈·현금)
export const DAILY_KINDS = ['은행', '카드', '적금', '목돈', '현금'];
export const isPinned = (boot: Boot, a: { id: string; kind: string }) => (boot.balanceAccounts ? boot.balanceAccounts.includes(a.id) : DAILY_KINDS.includes(a.kind));
