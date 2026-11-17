import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

// 금액 칸에 어디서 복사한 값이든 붙여넣기: 기기 기본 붙여넣기는 그대로 두고(삼성 탭 등에서도 되게),
// 붙여넣기 직전에 칸 글자를 모두 골라 둬서 '이어 붙기' 대신 '바꿔치기'가 되게 함. 숫자만 꺼내는 건 칸의 parseAmount가 함
document.documentElement.dataset.theme = localStorage.getItem('gb_theme') ?? 'green';

document.addEventListener('paste', (e) => {
  const el = e.target as HTMLInputElement | null;
  if (!el || el.tagName !== 'INPUT' || !(el.classList.contains('money') || el.inputMode === 'numeric') || e.defaultPrevented) return;
  try {
    el.select();
  } catch {
    /* 고르기 못 해도 그냥 붙여넣기 */
  }
});
import { Accounts } from './Accounts';
import { api, NeedLogin } from './api';
import type { Boot } from './data';
import { Home } from './Home';
import { Review } from './Review';
import { Plan } from './Plan';
import { Roadmap } from './Roadmap';
import { Annual } from './Annual';
import { Quick } from './Quick';
import { Settings } from './Settings';
import { Transactions } from './Transactions';
import './styles.css';

function useRoute() {
  const [hash, setHash] = useState(location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(location.hash || '#/');
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash.slice(1);
}

interface Status {
  setup: boolean;
  user: { name: string } | null;
  names: string[];
}

function Recover({ names, onOk, onBack }: { names: string[]; onOk: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(names[0] ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  async function submit() {
    setErr('');
    if (pw !== pw2) return setErr('새 비밀번호 두 칸이 서로 달라요.');
    try {
      await api('/recover', { code, name, password: pw });
      onOk();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="login">
      <h1>비밀번호 다시 정하기</h1>
      <div className="recover-steps">
        <b>먼저 Cloudflare에서 '복구 열쇠'를 만들어요</b>
        <ol>
          <li><b>dash.cloudflare.com</b>에 로그인해요. (Cloudflare 비밀번호를 잊었으면 거기서 'Forgot password'로 메일을 받아 되찾아요.)</li>
          <li>왼쪽 메뉴 <b>Workers &amp; Pages</b>(또는 Compute)에서 <b>내 가계부 이름</b>을 눌러요.</li>
          <li><b>Settings</b> → <b>Variables and Secrets</b> → <b>+ Add</b></li>
          <li>Type은 <b>Secret</b>, Variable name에는 <code>RESET_CODE</code>, Value에는 <b>아무 낱말 8자 이상</b>을 넣고 <b>Deploy</b>를 눌러요.</li>
          <li>1분쯤 뒤, 그 낱말을 아래 '복구 열쇠' 칸에 넣어요.</li>
        </ol>
        <span className="muted">복구 열쇠는 한 번만 쓸 수 있어요. 다음에 또 필요하면 Value를 새 낱말로 바꿔요.</span>
      </div>
      <div className="vform">
        <label>복구 열쇠</label>
        <input className="text" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" autoComplete="off" />
        <label>이름</label>
        {names.length > 0 ? (
          <div className="chips">
            {names.map((n) => (
              <button key={n} className={`chip ${name === n ? 'on' : ''}`} onClick={() => setName(n)}>
                {n}
              </button>
            ))}
          </div>
        ) : (
          <input className="text" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <label>새 비밀번호</label>
        <input className="text" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="6자 이상" />
        <label>한 번 더</label>
        <input className="text" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <label />
        <button className="btn main" onClick={submit}>
          바꾸고 들어가기
        </button>
        {err && (
          <>
            <label />
            <span className="bad">{err}</span>
          </>
        )}
        <label />
        <button className="linkbtn" onClick={onBack}>
          ← 로그인으로 돌아가기
        </button>
      </div>
    </div>
  );
}

function Login({ status, onOk }: { status: Status; onOk: () => void }) {
  const [name, setName] = useState(status.names[0] ?? '');
  const [password, setPassword] = useState('');
  const [household, setHousehold] = useState('우리집 가계부');
  const [err, setErr] = useState('');
  const [recover, setRecover] = useState(false);
  async function submit() {
    setErr('');
    try {
      await api(status.setup ? '/setup' : '/login', { name, password, household });
      onOk();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  if (recover) return <Recover names={status.names} onOk={onOk} onBack={() => setRecover(false)} />;
  return (
    <div className="login">
      <h1>{status.setup ? '가계부 시작하기' : '우리집 가계부'}</h1>
      {status.setup && <p className="muted">처음 한 번만 이름과 비밀번호를 정해요. 가족은 나중에 설정에서 추가할 수 있어요.</p>}
      <div className="vform">
        {status.setup && (
          <>
            <label>가계부 이름</label>
            <input className="text" value={household} onChange={(e) => setHousehold(e.target.value)} />
          </>
        )}
        <label>이름</label>
        {!status.setup && status.names.length > 0 ? (
          <div className="chips">
            {status.names.map((n) => (
              <button key={n} className={`chip ${name === n ? 'on' : ''}`} onClick={() => setName(n)}>
                {n}
              </button>
            ))}
          </div>
        ) : (
          <input className="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 엄마" />
        )}
        <label>비밀번호</label>
        <input className="text" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder={status.setup ? '6자 이상' : ''} />
        <label />
        <button className="btn main" onClick={submit}>
          {status.setup ? '시작하기' : '들어가기'}
        </button>
        {err && (
          <>
            <label />
            <span className="bad">{err}</span>
          </>
        )}
        {!status.setup && (
          <>
            <label />
            <button className="linkbtn" onClick={() => setRecover(true)}>
              비밀번호를 잊었어요
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  const route = useRoute();
  const [status, setStatus] = useState<Status | null>(null);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [toastMsg, setToastMsg] = useState('');
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(''), 2200);
  }, []);
  const loadStatus = useCallback(() => api<Status>('/status').then(setStatus), []);
  const loadBoot = useCallback(() => {
    api<Boot>('/bootstrap')
      .then((b) => {
        // 꾸미기: 테마 색 (다음에 열 때 깜빡이지 않게 기기에도 기억)
        document.documentElement.dataset.theme = b.theme ?? 'green';
        // 휴대폰 위쪽 막대 색도 테마 색으로
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#3f6e5a');
        localStorage.setItem('gb_theme', b.theme ?? 'green');
        setBoot(b);
      })
      .catch((e) => (e instanceof NeedLogin ? setStatus((s) => (s ? { ...s, user: null } : s)) : toast(String(e))));
  }, [toast]);
  const onError = useCallback(
    (e: unknown) => {
      if (e instanceof NeedLogin) setStatus((s) => (s ? { ...s, user: null } : s));
      else toast(e instanceof Error ? e.message : String(e));
    },
    [toast],
  );
  useEffect(() => void loadStatus(), [loadStatus]);
  useEffect(() => {
    if (status?.user) loadBoot();
  }, [status?.user, loadBoot]);

  if (!status) return null;
  if (!status.user) return <Login status={status} onOk={loadStatus} />;
  if (!boot) return <p className="muted" style={{ padding: 30 }}>불러오는 중…</p>;

  const go = (h: string) => (location.hash = h);
  const [path, qs] = route.split('?');
  const params = new URLSearchParams(qs ?? '');
  let body;
  if (path.startsWith('/tx'))
    body = <Transactions key={qs ?? ''} boot={boot} onError={onError} toast={toast} initial={{ account: params.get('account') ?? undefined, category: params.get('category') ?? undefined, month: params.get('month') ?? undefined, grp: params.get('grp') ?? undefined, day: params.get('day') ?? undefined }} />;
  else if (path.startsWith('/plan') || path.startsWith('/moneynote'))
    body = <Plan key={qs ?? ''} boot={boot} onError={onError} toast={toast} go={go} reloadBoot={loadBoot} tab={path.startsWith('/moneynote') || params.get('tab') !== 'plan' ? 'note' : 'plan'} initial={{ year: params.get('year') ?? undefined, month: params.get('month') ?? undefined, category: params.get('category') ?? undefined }} />;
  else if (path.startsWith('/quick')) body = <Quick boot={boot} onError={onError} toast={toast} go={go} />;
  else if (path.startsWith('/annual')) body = <Annual key={qs ?? ''} boot={boot} onError={onError} toast={toast} go={go} tab={params.get('tab') === 'plan' ? 'plan' : 'review'} initialYear={params.get('year') ?? undefined} />;
  else if (path.startsWith('/roadmap')) body = <Roadmap key={qs ?? ''} boot={boot} onError={onError} toast={toast} go={go} tab={params.get('tab') === 'long' ? 'long' : 'short'} initialYear={params.get('year') ?? undefined} />;
  else if (path.startsWith('/review')) body = <Review key={qs ?? ''} boot={boot} onError={onError} toast={toast} go={go} initialMonth={params.get('month') ?? undefined} />;
  else if (path.startsWith('/accounts')) body = <Accounts boot={boot} onError={onError} toast={toast} go={go} reloadBoot={loadBoot} />;
  else if (path.startsWith('/settings')) body = <Settings boot={boot} onError={onError} toast={toast} reloadBoot={loadBoot} />;
  else body = <Home boot={boot} onError={onError} toast={toast} go={go} />;

  const on = (p: string) => (p === '/' ? path === '/' || path === '' : path.startsWith(p)) ? 'on' : '';
  return (
    <>
      <header className="top">
        <b>{boot.household}</b>
        <a href="#/" className={on('/')}>
          홈
        </a>
        <a href="#/tx" className={on('/tx')}>
          거래
        </a>
        <a href="#/review" className={on('/review')}>
          월말 결산
        </a>
        <a href="#/plan" className={on('/plan') || on('/moneynote')}>
          머니플랜
        </a>
        <a href="#/roadmap" className={on('/roadmap')}>
          로드맵
        </a>
        <a href="#/annual" className={on('/annual')}>
          연간 결산
        </a>
        <a href="#/accounts" className={on('/accounts')}>
          통장·투자
        </a>
        <a href="#/settings" className={on('/settings')}>
          설정
        </a>
        <span className="spacer" />
        <span className="muted small">{boot.user.name}</span>
        <a
          onClick={async () => {
            await api('/logout', {});
            setBoot(null);
            loadStatus();
          }}
        >
          로그아웃
        </a>
      </header>
      <main>{body}</main>
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
