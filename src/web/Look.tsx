// 꾸미기: 테마 색 · 홈 그림(제목 옆 동그라미) · 카페 이미지 스티커 (가족 공용)
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Boot, Toast } from './data';

export const THEMES: { key: string; name: string; color: string }[] = [
  { key: 'green', name: '초록', color: '#3f6e5a' },
  { key: 'pink', name: '분홍', color: '#a8506a' },
  { key: 'sky', name: '하늘', color: '#3b6a90' },
  { key: 'violet', name: '보라', color: '#66589a' },
  { key: 'brown', name: '갈색', color: '#85603f' },
  { key: 'charcoal', name: '먹색', color: '#474c54' },
];

/** 스티커 보관함 불러오기 (바뀐 때 표시가 같으면 기기에 저장해 둔 것 사용) */
export function useStickers(ver: string | null | undefined) {
  const [list, setList] = useState<{ id: string; data: string }[]>([]);
  const load = (force = false) => {
    if (!ver) return setList([]);
    try {
      const saved = JSON.parse(sessionStorage.getItem('gb_stickers') ?? 'null') as { ver: string; list: { id: string; data: string }[] } | null;
      if (!force && saved?.ver === ver) return setList(saved.list);
    } catch {
      /* 무시 */
    }
    api<{ id: string; data: string }[]>('/look/stickers')
      .then((l) => {
        setList(l);
        try {
          sessionStorage.setItem('gb_stickers', JSON.stringify({ ver, list: l }));
        } catch {
          /* 저장 공간 모자라면 매번 불러옴 */
        }
      })
      .catch(() => setList([]));
  };
  useEffect(() => load(), [ver]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
}

/** 표지·스티커 그림 불러오기 (바뀐 때 번호가 같으면 기기에 저장해 둔 것 사용) */
export function useLookImage(kind: 'cover' | 'sticker', ver: string | null | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!ver) return setSrc(null);
    const key = `gb_look_${kind}`;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { ver: string; data: string } | null;
      if (saved?.ver === ver) return setSrc(saved.data);
    } catch {
      /* 무시 */
    }
    api<{ data: string | null }>(`/look/${kind}`)
      .then((r) => {
        setSrc(r.data);
        try {
          if (r.data) sessionStorage.setItem(key, JSON.stringify({ ver, data: r.data }));
        } catch {
          /* 저장 공간 모자라면 그냥 매번 불러옴 */
        }
      })
      .catch(() => setSrc(null));
  }, [kind, ver]);
  return src;
}

export function LookSettings({ boot, onError, toast, reloadBoot }: { boot: Boot; onError: (e: unknown) => void; toast: Toast; reloadBoot: () => void }) {
  const stickers = useStickers(boot.stickerVer);
  const [busy, setBusy] = useState(false);
  // 카페 이미지 기본 스티커 (결산 카페 이미지에서 달마다 다시 고를 수 있음)
  const [cafeId, setCafeId] = useState(() => localStorage.getItem('gb_cafe_sticker_last') ?? '');
  function pickCafe(id: string) {
    localStorage.setItem('gb_cafe_sticker_last', id);
    setCafeId(id);
    toast(id ? '카페 이미지 스티커를 골랐어요' : '카페 이미지 스티커를 뺐어요');
  }
  async function pickHome(id: string) {
    try {
      await api('/look/home', { id });
      sessionStorage.removeItem('gb_look_cover');
      toast(id ? '홈 그림을 바꿨어요' : '홈 그림을 뺐어요');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  async function delSticker(id: string) {
    if (!confirm('이 스티커를 지울까요?')) return;
    try {
      await api(`/look/stickers/${id}/delete`, {});
      sessionStorage.removeItem('gb_stickers');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  async function theme(key: string) {
    try {
      document.documentElement.dataset.theme = key;
      await api('/look/theme', { name: key });
      toast('색을 바꿨어요');
      reloadBoot();
    } catch (e) {
      onError(e);
    }
  }
  const [cropFile, setCropFile] = useState<{ f: File; kind: 'cover' | 'sticker' } | null>(null);
  async function save(kind: 'cover' | 'sticker', data: string) {
    setBusy(true);
    try {
      if (kind === 'sticker') {
        await api('/look/stickers', { data });
        sessionStorage.removeItem('gb_stickers');
      } else await api(`/look/${kind}`, { data });
      toast(kind === 'cover' ? '홈 그림을 넣었어요' : '스티커를 넣었어요');
      reloadBoot();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  async function upload(kind: 'cover' | 'sticker', f: File | undefined) {
    if (!f) return;
    setCropFile({ f, kind }); // 먼저 보일 부분 고르기 (홈 그림 동그라미 / 스티커 네모)
  }
  return (
    <div className="card" style={{ maxWidth: 720 }}>
      {cropFile && <Cropper file={cropFile.f} round={false} onCancel={() => setCropFile(null)} onDone={(data) => (setCropFile(null), save(cropFile.kind, data))} />}
      <h3>테마 색</h3>
      <div className="theme-chips">
        {THEMES.map((t) => (
          <button key={t.key} className={`theme-chip ${(boot.theme ?? 'green') === t.key ? 'on' : ''}`} onClick={() => theme(t.key)}>
            <span className="theme-dot" style={{ background: t.color }} />
            {t.name}
          </button>
        ))}
      </div>

      <h3 style={{ marginTop: 22 }}>내 그림 보관함 <span className="muted small">{stickers.length}/6</span></h3>
      <div className="sticker-grid">
        {stickers.map((st) => (
          <div key={st.id} className="sticker-cell">
            <img src={st.data} alt="" />
            <button className="sticker-x" title="지우기" onClick={() => delSticker(st.id)}>
              ×
            </button>
          </div>
        ))}
        {stickers.length < 6 && (
          <label className="sticker-cell add" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            ＋
            <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => (upload('sticker', e.target.files?.[0]), (e.target.value = ''))} />
          </label>
        )}
      </div>
      <h3 style={{ marginTop: 22 }}>홈 그림</h3>
      {stickers.length === 0 ? (
        <p className="muted small">보관함에 그림을 넣으면 여기서 고를 수 있어요.</p>
      ) : (
        <div className="sticker-pick">
          {stickers.map((st) => (
            <button key={st.id} className={`round ${boot.homeId === st.id ? 'on' : ''}`} onClick={() => pickHome(st.id)}>
              <img src={st.data} alt="" />
            </button>
          ))}
          <button className={`none ${!boot.coverVer ? 'on' : ''}`} onClick={() => pickHome('')}>
            없음
          </button>
        </div>
      )}
      <h3 style={{ marginTop: 22 }}>카페 이미지 스티커</h3>
      {stickers.length === 0 ? (
        <p className="muted small">보관함에 그림을 넣으면 여기서 고를 수 있어요.</p>
      ) : (
        <div className="sticker-pick">
          {stickers.map((st) => (
            <button key={st.id} className={cafeId === st.id ? 'on' : ''} onClick={() => pickCafe(st.id)}>
              <img src={st.data} alt="" />
            </button>
          ))}
          <button className={`none ${!cafeId ? 'on' : ''}`} onClick={() => pickCafe('')}>
            없음
          </button>
        </div>
      )}
      <details className="help">
        <summary>꾸미기란?</summary>
        <ul>
          <li>가족 모두에게 같이 적용</li>
          <li>보관함: 그림 6장까지, 넣을 때 보일 부분 자르기</li>
          <li>홈 그림: 보관함에서 골라 홈 제목 옆에 동그랗게 표시</li>
          <li>카페 이미지 스티커: 결산 카페 이미지 제목 옆에 작게 표시 (결산에서 달마다 바꾸기 가능)</li>
          <li>그림은 올릴 때 자동으로 작게 줄여 저장</li>
        </ul>
      </details>
    </div>
  );
}

/** 홈 그림 자르기: 동그라미 안에 보일 부분을 끌어서 옮기고, 막대로 확대 → 400×400으로 잘라 냄 */
function Cropper({ file, onDone, onCancel, round = true }: { file: File; onDone: (dataUrl: string) => void; onCancel: () => void; round?: boolean }) {
  const B = 260; // 자르는 상자 크기 (화면)
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [z, setZ] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!img) return null;
  // 홈 그림은 동그라미를 꽉 채우기, 스티커는 그림 전체가 들어가는 크기부터 시작
  const s = (round ? Math.max(B / img.width, B / img.height) : Math.min(B / img.width, B / img.height)) * z;
  const lim = (p: { x: number; y: number }) => {
    const mx = Math.abs((img.width * s - B) / 2), my = Math.abs((img.height * s - B) / 2);
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) };
  };
  const p = lim(pos);
  const left = B / 2 + p.x - (img.width * s) / 2, top = B / 2 + p.y - (img.height * s) / 2;
  function done() {
    const out = round ? 400 : 320; // 홈 그림 400 JPEG / 스티커 320 PNG(투명 배경 유지)
    const c = document.createElement('canvas');
    c.width = c.height = out;
    c.getContext('2d')!.drawImage(img!, -left / s, -top / s, B / s, B / s, 0, 0, out, out);
    onDone(round ? c.toDataURL('image/jpeg', 0.85) : c.toDataURL('image/png'));
  }
  return (
    <div className="pop-bg" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="card pop" style={{ width: 'min(340px, 100%)' }}>
        <h3>보일 부분 고르기</h3>
        <div
          className="crop-box"
          style={{ width: B, height: B }}
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
          }}
          onPointerMove={(e) => drag.current && setPos(lim({ x: drag.current.x + e.clientX - drag.current.px, y: drag.current.y + e.clientY - drag.current.py }))}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <img src={img.src} alt="" draggable={false} style={{ position: 'absolute', left, top, width: img.width * s, height: img.height * s }} />
          <div className={`crop-ring ${round ? '' : 'square'}`} />
        </div>
        <input type="range" min={round ? 1 : 0.5} max={4} step={0.01} value={z} onChange={(e) => setZ(Number(e.target.value))} style={{ width: B, marginTop: 10 }} />
        <p className="muted small" style={{ margin: '4px 0 10px' }}>끌어서 위치 · 막대로 확대</p>
        <div className="row pop-actions">
          <span className="spacer" />
          <button className="btn" onClick={onCancel}>
            닫기
          </button>
          <button className="btn main" onClick={done}>
            넣기
          </button>
        </div>
      </div>
    </div>
  );
}
