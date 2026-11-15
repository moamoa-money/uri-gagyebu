// 비밀번호 다시 정하기 (맥에서만): 화면에 입력 창을 띄워 새 비밀번호를 받고, 앱과 같은 방식(PBKDF2)으로 바꿔 올린 DB에 넣는다.
// 비밀번호 원문은 화면 입력 창 → 이 프로그램 안에서만 쓰이고, 어디에도 적지 않는다.
// 쓰는 법: node scripts/reset-password.mjs 엄마
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';

const name = process.argv[2];
if (!name) throw new Error('이름을 넣어 주세요');
const ask = (msg) =>
  execFileSync('osascript', ['-e', `text returned of (display dialog "${msg}" default answer "" with hidden answer with title "우리집 가계부 · 비밀번호" buttons {"취소", "확인"} default button "확인")`], { encoding: 'utf8' }).trim();
const p1 = ask(`${name} 님의 새 비밀번호 (6자 이상)`);
const p2 = ask('한 번 더 입력해 주세요');
if (p1 !== p2) throw new Error('두 번 입력한 비밀번호가 달라요');
if (p1.length < 6) throw new Error('6자 이상으로 해 주세요');

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(p1), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 20000 }, key, 256);
const hash = b64(bits);
const q = (s) => `'${s.replace(/'/g, "''")}'`;
const sql = `UPDATE users SET pw_hash = ${q(hash)}, pw_salt = ${q(salt)} WHERE name = ${q(name)}; DELETE FROM login_fails; SELECT changes() AS n;`;
const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
console.log(out.includes('"rows_written"') ? `${name} 님 비밀번호를 바꿨어요` : out);
