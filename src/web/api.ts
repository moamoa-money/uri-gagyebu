// 서버와 주고받기
export class NeedLogin extends Error {}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gagyebu': '1' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && (data as { error?: string }).error === 'login') throw new NeedLogin();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? '문제가 생겼어요.');
  return data as T;
}
