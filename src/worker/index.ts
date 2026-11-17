// 우리집 가계부 서버 입구: /api/* 는 여기서, 나머지는 화면 파일

import { clearCookie, currentUser, hasUsers, login, recoverPassword, sessionCookie } from './auth';
import { UserError, all, getUsers, type Env } from './db';
import {
  accountsView,
  addUser,
  bootstrap,
  changePassword,
  deleteRecurring,
  deleteTx,
  listInvestments,
  listTx,
  monthView,
  moveCategory,
  orderCategories,
  categoryUsage,
  deleteCategory,
  runRecurring,
  saveAccount,
  saveCategory,
  nospendView,
  setTheme,
  pickHomeImage,
  listStickers,
  addSticker,
  deleteSticker,
  setLookImage,
  getLookImage,
  setNospendCal,
  saveInvestment,
  deleteInvestment,
  accountUsage,
  deleteAccount,
  saveRecurring,
  saveTx,
  setMonthBudget,
  setup, setBalanceAccounts, setSaveBasis, setYearTarget, yearView, reviewView, saveReviewNote, saveReviewCause, pledgesFor, savePledge, deletePledge, setPledgeResult, assetsView, undoMonthBudget, listMoneyNotes, saveMoneyNote,
  addMoneyItem,
  saveMoneyItem,
  renameMoneyItem,
  deleteMoneyItem, deleteMoneyNote, planView, setPlanCell, copyMoneyNotes, saveBudgetNote, shortRoadmap, setRoadmapInclude, longRoadmap, setupLongRoadmap, setLongYears, setLongMilestones, saveLongRow, saveLongNote, saveLongVersion, getLongVersion, setAssetActual, setAccountInAssets, loansView, setFeatureLoan, saveLoanSchedule, saveLoanLink, valuationsView, setValuation, batchView, saveBatch, carryLongRoadmap, annualView, saveYearRecord, saveYearNote, setHousehold, resetMemberPassword, setAssetTrendExclude, notionImportStatus, clearNotionImport } from './ops';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });

async function api(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api/, '');
  const method = request.method;
  if (method !== 'GET' && request.headers.get('X-Gagyebu') !== '1') return json({ error: '잘못된 요청이에요.' }, 403);
  const body = method === 'GET' ? {} : ((await request.json().catch(() => ({}))) as Record<string, unknown>);

  try {
    if (path === '/status') {
      const user = await currentUser(env, request);
      return json({ setup: !(await hasUsers(env)), user, names: user ? [] : (await getUsers(env)).map((u) => u.name) });
    }
    if (path === '/setup' && method === 'POST') {
      if (await hasUsers(env)) return json({ error: '이미 시작한 가계부예요. 로그인해 주세요.' }, 400);
      const user = await setup(env, body as never);
      return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(env, user.id) });
    }
    if (path === '/login' && method === 'POST') {
      const r = await login(env, String(body.name ?? ''), String(body.password ?? ''));
      if (r.ok) return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(env, r.user.id) });
      return json({ error: r.reason === 'locked' ? '여러 번 틀려서 15분 동안 잠겼어요.' : '이름이나 비밀번호가 달라요.' }, r.reason === 'locked' ? 429 : 401);
    }
    if (path === '/recover' && method === 'POST') {
      const u = await recoverPassword(env, String(body.code ?? ''), String(body.name ?? ''), String(body.password ?? ''));
      return json({ ok: true }, 200, { 'Set-Cookie': await sessionCookie(env, u.id) });
    }
    if (path === '/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': clearCookie });

    const user = await currentUser(env, request);
    if (!user) return json({ error: 'login' }, 401);
    const q = url.searchParams;
    let m: RegExpMatchArray | null;

    if (path === '/bootstrap') return json(await bootstrap(env, user));
    if (path === '/tx' && method === 'GET')
      return json(
        await listTx(env, {
          from: q.get('from') ?? undefined,
          to: q.get('to') ?? undefined,
          q: q.get('q') ?? undefined,
          account: q.get('account') ?? undefined,
          grp: q.get('grp') ?? undefined,
          category: q.get('category') ?? undefined,
          limit: q.get('limit') ? Number(q.get('limit')) : undefined,
        }),
      );
    if (path === '/tx' && method === 'POST') return json(await saveTx(env, user, body as never));
    if ((m = path.match(/^\/tx\/([\w-]+)\/delete$/)) && method === 'POST') return json(await deleteTx(env, user, m[1]));
    if (path === '/year') return json(await yearView(env, q.get('year') ?? ''));
    if (path === '/assets/exclude' && method === 'POST') return json(await setAssetTrendExclude(env, user, body));
    if (path === '/assets') return json(await assetsView(env, q.get('upto') ?? ''));
    if (path === '/budgets/undo' && method === 'POST') return json(await undoMonthBudget(env, user, body));
    if (path === '/roadmap/short/include' && method === 'POST') return json(await setRoadmapInclude(env, user, body));
    if (path === '/roadmap/long') return json(await longRoadmap(env, q.get('year') ?? ''));
    if (path === '/roadmap/long/carry' && method === 'POST') return json(await carryLongRoadmap(env, user, body));
    if (path === '/roadmap/long/setup' && method === 'POST') return json(await setupLongRoadmap(env, user, body));
    if (path === '/roadmap/long/years' && method === 'POST') return json(await setLongYears(env, user, body));
    if (path === '/roadmap/long/milestones' && method === 'POST') return json(await setLongMilestones(env, user, body));
    if (path === '/roadmap/long/row' && method === 'POST') return json(await saveLongRow(env, user, body));
    if (path === '/roadmap/long/note' && method === 'POST') return json(await saveLongNote(env, user, body));
    if (path === '/roadmap/long/version' && method === 'POST') return json(await saveLongVersion(env, user, body));
    if (path === '/roadmap/long/version') return json(await getLongVersion(env, q.get('year') ?? '', q.get('month') ?? ''));
    if (path === '/roadmap/long/actual' && method === 'POST') return json(await setAssetActual(env, user, body));
    if (path === '/roadmap/long/asset-account' && method === 'POST') return json(await setAccountInAssets(env, user, body));
    if (path === '/recurring/batch' && method === 'POST') return json(await saveBatch(env, user, body));
    if (path === '/recurring/batch') return json(await batchView(env, q.get('month') ?? ''));
    if (path === '/users/reset' && method === 'POST') return json(await resetMemberPassword(env, user, body));
    if (path === '/household' && method === 'POST') return json(await setHousehold(env, user, body.name));
    if (path === '/annual') return json(await annualView(env, q.get('year') ?? ''));
    if (path === '/annual/record' && method === 'POST') return json(await saveYearRecord(env, user, body));
    if (path === '/annual/note' && method === 'POST') return json(await saveYearNote(env, user, body));
    if (path === '/valuations') return json(await valuationsView(env, q.get('year') ?? ''));
    if (path === '/valuation' && method === 'POST') return json(await setValuation(env, user, body));
    if (path === '/loans') return json(await loansView(env));
    if (path === '/loans/feature' && method === 'POST') return json(await setFeatureLoan(env, user, body.on));
    if (path === '/loans/schedule' && method === 'POST') return json(await saveLoanSchedule(env, user, body));
    if (path === '/loans/link' && method === 'POST') return json(await saveLoanLink(env, user, body));
    if (path === '/roadmap/short') return json(await shortRoadmap(env, q.get('year') ?? ''));
    if (path === '/plan') return json(await planView(env, q.get('year') ?? ''));
    if (path === '/plan/cell' && method === 'POST') return json(await setPlanCell(env, user, body));
    if (path === '/money-notes/copy' && method === 'POST') return json(await copyMoneyNotes(env, user, body.year));
    if (path === '/money-notes') return json(await listMoneyNotes(env, q.get('year') ?? ''));
    if (path === '/money-item/save' && method === 'POST') return json(await saveMoneyItem(env, user, body));
    if (path === '/money-item/add' && method === 'POST') return json(await addMoneyItem(env, user, body));
    if (path === '/money-item/rename' && method === 'POST') return json(await renameMoneyItem(env, user, body));
    if (path === '/money-item/delete' && method === 'POST') return json(await deleteMoneyItem(env, user, body));
    if (path === '/money-note' && method === 'POST') return json(await saveMoneyNote(env, user, body));
    const mn = path.match(/^\/money-note\/([\w-]+)\/delete$/);
    if (mn && method === 'POST') return json(await deleteMoneyNote(env, user, mn[1]));
    if (path === '/budget-note' && method === 'POST') return json(await saveBudgetNote(env, user, body));
    if (path === '/review') return json(await reviewView(env, q.get('month') ?? ''));
    if (path === '/review/note' && method === 'POST') return json(await saveReviewNote(env, user, body));
    if (path === '/review/cause' && method === 'POST') return json(await saveReviewCause(env, user, body));
    if (path === '/pledges') return json(await pledgesFor(env, q.get('month') ?? ''));
    if (path === '/pledge' && method === 'POST') return json(await savePledge(env, user, body));
    const pm = path.match(/^\/pledge\/([\w-]+)\/(delete|result)$/);
    if (pm && method === 'POST') return json(pm[2] === 'delete' ? await deletePledge(env, pm[1]) : await setPledgeResult(env, pm[1], body.result));
    if (path === '/save-basis' && method === 'POST') return json(await setSaveBasis(env, user, body.basis, body.year));
    if (path === '/year-target' && method === 'POST') return json(await setYearTarget(env, user, body.year, body.amount));
    if (path === '/month') return json(await monthView(env, q.get('month') ?? ''));
    if (path === '/look/stickers') return json(method === 'POST' ? await addSticker(env, user, body.data) : await listStickers(env));
    const sd = path.match(/^\/look\/stickers\/([\w-]+)\/delete$/);
    if (sd && method === 'POST') return json(await deleteSticker(env, user, sd[1]));
    if (path === '/look/home' && method === 'POST') return json(await pickHomeImage(env, user, body.id));
    if (path === '/look/theme' && method === 'POST') return json(await setTheme(env, user, body.name));
    const lk = path.match(/^\/look\/(cover|sticker)$/);
    if (lk) return json(method === 'POST' ? await setLookImage(env, user, lk[1], body.data) : await getLookImage(env, lk[1]));
    if (path === '/nospend') return json(await nospendView(env, q.get('month') ?? ''));
    if (path === '/prefs/nospend' && method === 'POST') return json(await setNospendCal(env, user, body.on));
    if (path === '/categories' && method === 'POST') return json(await saveCategory(env, user, body as never));
    if (path === '/categories/order' && method === 'POST') return json(await orderCategories(env, body.ids));
    if (path === '/categories/usage') return json(await categoryUsage(env, q.get('id') ?? ''));
    if (path === '/categories/delete' && method === 'POST') return json(await deleteCategory(env, user, String(body.id), body.moveTo ? String(body.moveTo) : null));
    if (path === '/categories/move' && method === 'POST') return json(await moveCategory(env, String(body.id), body.dir === -1 ? -1 : 1));
    if (path === '/budgets' && method === 'POST') return json(await setMonthBudget(env, user, body as never));
    if (path === '/import/notion' && method === 'GET') return json(await notionImportStatus(env));
    if (path === '/import/notion/clear' && method === 'POST') return json(await clearNotionImport(env, user));
    if (path === '/accounts' && method === 'GET') return json(await accountsView(env));
    if (path === '/balance-accounts' && method === 'POST') return json(await setBalanceAccounts(env, user, body.ids));
    if (path === '/accounts' && method === 'POST') return json(await saveAccount(env, user, body as never));
    if (path === '/recurring' && method === 'POST') return json(await saveRecurring(env, user, body as never));
    if ((m = path.match(/^\/recurring\/([\w-]+)\/stop$/)) && method === 'POST') return json(await deleteRecurring(env, user, m[1]));
    if (path === '/investments' && method === 'GET') return json(await listInvestments(env));
    if (path === '/investments/delete' && method === 'POST') return json(await deleteInvestment(env, user, String(body.id)));
    if (path === '/accounts/usage') return json(await accountUsage(env, q.get('id') ?? ''));
    if (path === '/accounts/delete' && method === 'POST') return json(await deleteAccount(env, user, String(body.id), body.moveTo ? String(body.moveTo) : null));
    if (path === '/investments' && method === 'POST') return json(await saveInvestment(env, user, body));
    if (path === '/users' && method === 'POST') return json(await addUser(env, user, body as never));
    if (path === '/password' && method === 'POST') return json(await changePassword(env, user, body as never));
    if (path === '/activity') return json(await all(env, 'SELECT * FROM activity ORDER BY at DESC LIMIT 200', [], (r) => r));
    return json({ error: '없는 주소예요.' }, 404);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: '서버에서 문제가 생겼어요.' }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env);
    const res = await env.ASSETS.fetch(request);
    const h = new Headers(res.headers);
    h.set('X-Robots-Tag', 'noindex, nofollow');
    h.set('Referrer-Policy', 'no-referrer');
    return new Response(res.body, { status: res.status, headers: h });
  },
  // 매일 한 번(한국 시간 자정): 새 달이 시작됐으면 고정지출 거래를 만든다
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    if (await (await import('./auth')).hasUsers(env)) await runRecurring(env);
  },
} satisfies ExportedHandler<Env>;
