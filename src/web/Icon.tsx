// 미니멀 선 아이콘 (Lucide, 앱 안에 함께 묶여 들어감 — 인터넷에서 따로 안 불러옴)
// 카테고리의 emoji 칸에는 아이콘 이름(예: 'shopping-cart')을 저장한다.
// 예전 이모지가 남아 있어도 EMOJI_MAP으로 비슷한 아이콘을 골라 보여 준다.
import {
  ArrowLeftRight, Baby, Banknote, BookOpen, Briefcase, Building2, Bus, Cake, Car, Cat, ChartColumn, Circle, CircleCheck, Coffee, Coins, CreditCard,
  Dog, Dumbbell, Film, Flame, Flower2, Fuel, Gamepad2, Gift, GraduationCap, HandCoins, Heart, HeartPulse, House, KeyRound, Landmark, Lightbulb,
  Luggage, Music, Package, Palette, PawPrint, Pencil, PiggyBank, Pill, Pin, Plane, Plus, Receipt, Repeat, School, Scissors, Search, Shield, Shirt,
  ShoppingBag, ShoppingCart, Siren, Smartphone, Sparkles, SprayCan, Sprout, Star, Stethoscope, Tag, Target, Tent, Ticket, TrendingDown, TrendingUp,
  TriangleAlert, Tv, Umbrella, User, Users, Utensils, Wallet, Wifi, Wrench, createLucideIcon, type LucideIcon,
} from 'lucide-react';
import { GROUPS } from '../shared/types';

// Lucide에 없는 휴지 모양: 🧻처럼 세워 둔 휴지 + 앞으로 풀려 내려온 한 칸 (같은 선 굵기로 직접 그림)
const ToiletRoll = createLucideIcon('toilet-roll', [
  ['ellipse', { cx: '12', cy: '5', rx: '7', ry: '2.5', key: 'top' }],
  ['ellipse', { cx: '12', cy: '5', rx: '2', ry: '0.9', key: 'hole' }],
  ['path', { d: 'M5 5v12a7 2.5 0 0 0 3 2.05', key: 'left' }],
  ['path', { d: 'M19 5v12a7 2.5 0 0 1-3 2.05', key: 'right' }],
  ['path', { d: 'M8 7.3V21l1.33-1 1.33 1 1.34-1 1.33 1 1.34-1 1.33 1V7.3', key: 'sheet' }],
]);

export const ICONS: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart, utensils: Utensils, coffee: Coffee, 'toilet-roll': ToiletRoll, 'spray-can': SprayCan, 'shopping-bag': ShoppingBag, shirt: Shirt, sparkles: Sparkles,
  scissors: Scissors, stethoscope: Stethoscope, pill: Pill, 'heart-pulse': HeartPulse, baby: Baby, user: User, users: Users, palette: Palette, film: Film,
  music: Music, 'gamepad-2': Gamepad2, ticket: Ticket, dumbbell: Dumbbell, repeat: Repeat, package: Package, cake: Cake, gift: Gift, 'flower-2': Flower2,
  luggage: Luggage, tent: Tent, plane: Plane, 'graduation-cap': GraduationCap, school: School, pencil: Pencil, 'book-open': BookOpen, landmark: Landmark,
  receipt: Receipt, house: House, 'key-round': KeyRound, 'building-2': Building2, lightbulb: Lightbulb, flame: Flame, wrench: Wrench, smartphone: Smartphone,
  wifi: Wifi, tv: Tv, shield: Shield, umbrella: Umbrella, car: Car, fuel: Fuel, bus: Bus, 'paw-print': PawPrint, cat: Cat, dog: Dog, heart: Heart,
  wallet: Wallet, banknote: Banknote, briefcase: Briefcase, coins: Coins, 'hand-coins': HandCoins, 'credit-card': CreditCard, 'piggy-bank': PiggyBank,
  'trending-up': TrendingUp, 'trending-down': TrendingDown, sprout: Sprout, 'chart-column': ChartColumn, star: Star, tag: Tag, circle: Circle,
};
// 화면 장식용 (카테고리 고르기 목록에는 안 나옴)
export const UI_ICONS = { target: Target, pin: Pin, search: Search, plus: Plus, alert: TriangleAlert, check: CircleCheck, siren: Siren, transfer: ArrowLeftRight, chart: ChartColumn, coins: Coins };

const EMOJI_MAP: Record<string, string> = {
  '🛒': 'shopping-cart', '🍽️': 'utensils', '🧻': 'toilet-roll', '💄': 'sparkles', '🏥': 'stethoscope', '👧🏻': 'baby', '🎬': 'film', '🔁': 'repeat',
  '📦': 'package', '🍰': 'cake', '🧳': 'luggage', '👚': 'shirt', '✏️': 'pencil', '🏦': 'landmark', '🏠': 'house', '📱': 'smartphone', '🚸': 'shield',
  '🚗': 'car', '📤': 'receipt', '🐈': 'paw-print', '💸': 'wallet', '🏧': 'banknote', '💼': 'briefcase', '👶🏻': 'baby', '💰': 'coins', '📈': 'trending-up',
  '😶‍🌫️': 'umbrella', '🗽': 'chart-column', '🌱': 'sprout', '💲': 'hand-coins', '🏡': 'key-round', '🐥': 'piggy-bank', '📉': 'trending-down',
};
// 대분류 아이콘
export const GROUP_ICON: Record<string, string> = Object.fromEntries(GROUPS.map((g) => [g.key, g.icon]));

export function iconKey(v: string | null | undefined) {
  if (v && ICONS[v]) return v;
  if (v && EMOJI_MAP[v]) return EMOJI_MAP[v];
  return 'circle';
}

export function Icon({ name, size = 16, className = '' }: { name?: string | null; size?: number; className?: string }) {
  const C = ICONS[iconKey(name)];
  return <C size={size} strokeWidth={1.75} className={`ico ${className}`} aria-hidden />;
}

export function UiIcon({ name, size = 16 }: { name: keyof typeof UI_ICONS; size?: number }) {
  const C = UI_ICONS[name];
  return <C size={size} strokeWidth={1.75} className="ico" aria-hidden />;
}
