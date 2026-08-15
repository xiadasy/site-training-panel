/* 恐怖黎明套装助手 v3 — 含职业筛选 */
const LS_BUILDS = 'gd_set_builds_v1';
const LS_COMPARE = 'gd_set_compare_v1';

const state = {
  meta: null,
  index: [],
  sets: new Map(),
  setsLoaded: false,
  classGuide: null,
  activeStat: '',
  compare: [],
  builds: {},
  currentBuildId: null,
  classIds: [], // selected mastery ids for class tab
  classSub: 'sets',
};

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function ensureSets() {
  if (state.setsLoaded) return;
  for (const s of window.GD_DATA_SETS || []) state.sets.set(s.id, s);
  state.setsLoaded = true;
}
function getSet(id) {
  ensureSets();
  return state.sets.get(id);
}

function loadBuilds() {
  try {
    state.builds = JSON.parse(localStorage.getItem(LS_BUILDS) || '{}') || {};
  } catch {
    state.builds = {};
  }
  const ids = Object.keys(state.builds);
  if (!ids.length) {
    const id = 'build_' + Date.now();
    state.builds[id] = { id, name: '默认方案', notes: '', setIds: [], tags: {}, updatedAt: Date.now() };
    saveBuilds();
  }
  state.currentBuildId = ids[0] || Object.keys(state.builds)[0];
  try {
    state.compare = JSON.parse(localStorage.getItem(LS_COMPARE) || '[]') || [];
  } catch {
    state.compare = [];
  }
}
function saveBuilds() {
  localStorage.setItem(LS_BUILDS, JSON.stringify(state.builds));
}
function saveCompare() {
  localStorage.setItem(LS_COMPARE, JSON.stringify(state.compare));
}
function currentBuild() {
  return state.builds[state.currentBuildId];
}

function rarityClass(r) {
  if (r === 'Legendary') return 'legend';
  if (r === 'Epic') return 'epic';
  if (r === 'Rare') return 'rare';
  return '';
}
function rarityZh(r) {
  return ({ Legendary: '传奇', Epic: '史诗', Rare: '稀有', Magical: '魔法', Common: '普通' }[r] || r || '');
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function bitmapClass(bitmap) {
  if (!bitmap) return '';
  let a = String(bitmap).replace(/\//g, '_').replace(/[()]/g, '');
  if (a.endsWith('.png')) a = a.slice(0, -4);
  return 'itemdb-' + a;
}
function rarityBgClass(rarity) {
  const r = String(rarity || '').toLowerCase();
  if (r === 'epic') return 'bg-epic';
  if (r === 'rare') return 'bg-rare';
  if (r === 'magical') return 'bg-magical';
  if (r === 'common') return 'bg-common';
  if (r === 'quest') return 'bg-quest';
  return 'bg-legendary';
}
function iconMeta(bitmap) {
  const cls = bitmapClass(bitmap);
  const meta = (window.GD_ICON_META || {})[cls];
  return meta || { w: 64, h: 64, x: 0, y: 0 };
}
/** size: sm|md|lg ; clickable item id optional */
function iconHTML(bitmap, rarity, size = 'md', itemId = null) {
  if (!bitmap) {
    return `<span class="gd-icon ${size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : ''} gd-icon-empty"></span>`;
  }
  const cls = bitmapClass(bitmap);
  const bg = rarityBgClass(rarity);
  const meta = iconMeta(bitmap);
  const tall = meta.h > meta.w * 1.25;
  // fit sprite into box
  const box = size === 'lg' ? (tall ? 88 : 64) : size === 'sm' ? (tall ? 64 : 44) : tall ? 72 : 52;
  const boxW = size === 'lg' ? (tall ? 52 : 64) : size === 'sm' ? (tall ? 40 : 44) : tall ? 44 : 52;
  const scale = Math.min(boxW / meta.w, box / meta.h) * 0.92;
  const szCls = `${size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : ''}${tall ? ' tall' : ''}`;
  const click = itemId
    ? ` data-item-id="${itemId}" role="button" tabindex="0" title="点击查看属性"`
    : '';
  return `<span class="gd-icon ${szCls} ${itemId ? 'item-clickable' : ''}"${click} style="width:${boxW}px;height:${box}px;flex-basis:${boxW}px">
    <span class="item-bitmap-background ${bg}"></span>
    <span class="item-bitmap itemdb ${cls}" style="width:${meta.w}px;height:${meta.h}px;--gd-s:${scale}"></span>
  </span>`;
}
function iconsRowHTML(list, size = 'sm', vertical = true) {
  if (!list || !list.length) return '';
  const cls = vertical ? 'gd-icon-stack' : 'gd-icon-stack horizontal';
  return `<div class="${cls}">${list
    .filter((x) => x && (x.bitmap || typeof x === 'string'))
    .slice(0, 6)
    .map((x) =>
      typeof x === 'string'
        ? iconHTML(x, 'Legendary', size)
        : iconHTML(x.bitmap, x.rarity, size, x.id || null)
    )
    .join('')}</div>`;
}
function getItemDetail(id) {
  return (window.GD_DATA_ITEM_DETAILS || {})[id] || null;
}
function getItemSources(itemId) {
  if (!itemId) return null;
  if (window.GD_DATA_SOURCES && window.GD_DATA_SOURCES[itemId]) return window.GD_DATA_SOURCES[itemId];
  const d = getItemDetail(itemId);
  return d?.sources || null;
}
function sourcesBlockHTML(src, {compact=false}={}) {
  if (!src) return '';
  if (compact) {
    const lines = src.lines || src.sourceLines || [];
    if (!lines.length && src.sourceLabel) return `<div class="source-line">📍 ${escapeHtml(src.sourceLabel)}</div>`;
    if (!lines.length) return '';
    return `<div class="source-line">📍 ${lines.map(escapeHtml).join(' · ')}</div>`;
  }
  const groups = src.groups || [];
  if (!groups.length) return '';
  return `<div class="section source-section"><h4>获取来源</h4>${groups.map(g => {
    const items = (g.items||[]).map(it => {
      const sub = it.sub ? ` <span class="src-sub">(${escapeHtml(it.sub)})</span>` : '';
      const link = it.mapUrl ? ` <a class="src-map" href="${escapeHtml(it.mapUrl)}" target="_blank" rel="noopener">地图</a>` : '';
      return `<div class="source-item">• ${escapeHtml(it.text)}${sub}${link}</div>`;
    }).join('');
    const more = g.more ? `<div class="src-sub">…另有 ${g.more} 条</div>` : '';
    return `<div class="source-group"><div class="source-title">${escapeHtml(g.titleZh||'')}</div>${items}${more}</div>`;
  }).join('')}</div>`;
}


function matchLevel(level, key) {
  if (!key || key === '1-94') return true;
  const lv = level || 0;
  if (key === '94+') return lv >= 94;
  if (key === '90-93') return lv >= 90 && lv <= 93;
  if (key === '70-89') return lv >= 70 && lv <= 89;
  if (key === '50-69') return lv >= 50 && lv <= 69;
  if (key === '1-49') return lv >= 1 && lv <= 49;
  return true;
}
function matchDlc(item, key) {
  if (!key) return true;
  const ids = item.dlcIds || [];
  if (key === 'base') return !ids.length;
  return ids.includes(key);
}
function matchPieces(n, key) {
  if (!key) return true;
  if (key === '6+') return n >= 6;
  return String(n) === key;
}

function className(id) {
  const c = state.classGuide?.classes?.find((x) => x.id === +id);
  return c?.nameZh || String(id);
}

function setClassScore(it, classIds) {
  if (!classIds?.length) return 0;
  const sc = it.classScores || {};
  return classIds.reduce((sum, id) => sum + (sc[id] || sc[String(id)] || 0), 0);
}

/* ---------- resolve class query ---------- */
function resolveClassQuery(text) {
  const g = state.classGuide;
  if (!g) return [];
  const raw = (text || '').trim().toLowerCase();
  if (!raw) return [];

  // separators: + / 空格 、 ， 与 & 
  const parts = raw.split(/[+／/|,，、&\s]+/).filter(Boolean);
  const ids = [];
  for (const p of parts) {
    // exact / includes against resolveIndex
    let hit = g.resolveIndex.find((x) => x.q === p);
    if (!hit) hit = g.resolveIndex.find((x) => x.q.includes(p) || p.includes(x.q));
    // also match class list names
    if (!hit) {
      const c = g.classes.find(
        (cl) =>
          cl.nameZh.toLowerCase() === p ||
          cl.nameEn.toLowerCase() === p ||
          cl.key === p ||
          (cl.aliases || []).some((a) => String(a).toLowerCase() === p)
      );
      if (c) hit = { id: c.id };
    }
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids.slice(0, 2);
}

/* ---------- browse filter ---------- */
function filterIndex() {
  const q = ($('#q').value || '').trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const level = $('#fLevel').value;
  const dlc = $('#fDlc').value;
  const pieces = $('#fPieces').value;
  const rarity = $('#fRarity').value;
  const hideBlack = $('#fHideBlack').checked;
  const stat = state.activeStat;
  const sort = $('#fSort').value;
  const fClass = $('#fClass')?.value ? +$('#fClass').value : 0;
  const fClassScore = +($('#fClassScore')?.value || 0);
  const fMyth = $('#fMyth')?.value || '';

  let list = state.index.filter((it) => {
    if (hideBlack && it.blacklisted) return false;
    if (!matchLevel(it.level, level)) return false;
    if (!matchDlc(it, dlc)) return false;
    if (!matchPieces(it.pieceCount, pieces)) return false;
    if (rarity && it.rarity !== rarity) return false;
    if (fMyth === 'myth' && !it.mythical) return false;
    if (fMyth === 'nonmyth' && it.mythical) return false;
    if (fClass) {
      const sc = setClassScore(it, [fClass]);
      if (sc < fClassScore) return false;
    }
    if (stat) {
      const hit =
        (it.bonusLabels || []).includes(stat) ||
        (it.search || '').includes(stat.toLowerCase()) ||
        (it.tags || []).includes(stat);
      if (!hit) return false;
    }
    if (tokens.length) {
      const hay = it.search || '';
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    if (sort === 'class' && fClass) {
      return setClassScore(b, [fClass]) - setClassScore(a, [fClass]) || (b.level || 0) - (a.level || 0);
    }
    if (sort === 'level-asc') return (a.level || 0) - (b.level || 0) || a.nameZh.localeCompare(b.nameZh, 'zh');
    if (sort === 'name') return a.nameZh.localeCompare(b.nameZh, 'zh');
    if (sort === 'pieces') return (b.pieceCount || 0) - (a.pieceCount || 0);
    return (b.level || 0) - (a.level || 0) || a.nameZh.localeCompare(b.nameZh, 'zh');
  });
  return list;
}

function tierPreviewHTML(full) {
  if (full?.bonusTiers?.length) {
    return full.bonusTiers
      .map((tier) => {
        const lines = tier.lines || [];
        const short = lines.slice(0, 3).join('；');
        const more = lines.length > 3 ? ` 等${lines.length}条` : '';
        return `<div><b>(${tier.pieces})件</b>${escapeHtml(short)}${more}</div>`;
      })
      .join('');
  }
  if (!full?.tierSummary) return '';
  return Object.keys(full.tierSummary)
    .sort((a, b) => a - b)
    .map((pcs) => {
      const lines = full.tierSummary[pcs] || [];
      const short = lines.slice(0, 3).join('；');
      const more = lines.length > 3 ? ` 等${lines.length}条` : '';
      return `<div><b>(${pcs})件</b>${escapeHtml(short)}${more}</div>`;
    })
    .join('');
}
function bonusTiersHTML(full) {
  const tiers = full?.bonusTiers;
  if (!tiers?.length) {
    // fallback tierSummary
    if (!full?.tierSummary) return '';
    return Object.keys(full.tierSummary)
      .sort((a, b) => a - b)
      .map((pcs) => {
        const lines = full.tierSummary[pcs] || [];
        return `<div class="bonus-tier"><h5>(${pcs}) 件套</h5>${lines
          .map((l) => `<div class="line">${escapeHtml(l)}</div>`)
          .join('')}</div>`;
      })
      .join('');
  }
  return tiers
    .map(
      (tier) =>
        `<div class="bonus-tier"><h5>${escapeHtml(tier.titleZh || '(' + tier.pieces + ') 件套')}</h5>${(
          tier.lines || []
        )
          .map((l) => `<div class="line">${escapeHtml(l)}</div>`)
          .join('')}</div>`
    )
    .join('');
}


function scoreBar(score, max = 120) {
  const pct = Math.max(4, Math.min(100, Math.round((score / max) * 100)));
  return `<div class="score-bar" title="相关分 ${score}"><i style="width:${pct}%"></i></div>`;
}

function cardHTML(it, full, opts = {}) {
  const inBuild = currentBuild()?.setIds?.includes(it.id);
  const inCompare = state.compare.includes(it.id);
  const classScore = opts.classScore;
  const reasons = opts.reasons || [];
  const best =
    (it.classBest || [])
      .slice(0, 3)
      .map((b) => `${b.name || className(b.id)} ${b.score}`)
      .join(' · ') || '';

  const iconList = it.iconBitmaps || (full?.members || []).slice(0, 6).map((m) => ({ id: m.id, bitmap: m.bitmap, rarity: m.rarity, nameZh: m.nameZh }));
  return `
  <article class="card" data-id="${it.id}">
    <div class="card-with-icon">
      ${iconsRowHTML(iconList, 'sm')}
      <div class="card-main">
    <div class="card-top">
      <div>
        <h3>${escapeHtml(it.nameZh)}</h3>
        <div class="en">${escapeHtml(it.nameEn || '')}</div>
      </div>
      <div class="badges">
        ${classScore != null ? `<span class="badge legend">相关 ${Math.round(classScore * 10) / 10}</span>` : ''}
        ${it.mythical || full?.mythical ? `<span class="badge myth">神话</span>` : it.mythicalPartial || full?.mythicalPartial ? `<span class="badge myth">含神话</span>` : ''}
        <span class="badge ${rarityClass(it.rarity)}">${escapeHtml(rarityZh(it.rarity))}</span>
        <span class="badge">Lv ${it.level ?? '?'}</span>
        <span class="badge">${it.pieceCount} 件</span>
        <span class="badge dlc">${escapeHtml(it.dlcZh || full?.dlc?.zh || '本体')}</span>
      </div>
    </div>
    ${classScore != null ? scoreBar(classScore) : ''}
    <div class="meta-line">
      <span>部位：${escapeHtml((it.slots || []).join(' / '))}</span>
      ${best && classScore == null ? `<span>职业：${escapeHtml(best)}</span>` : ''}
    </div>
    <div class="members">
      ${(it.memberNames || []).map((n) => `<span class="member-pill">${escapeHtml(n)}</span>`).join('')}
    </div>
    ${it.sourceLabel || (it.sourceLines && it.sourceLines.length) ? `<div class="source-line">📍 ${escapeHtml(it.sourceLabel || (it.sourceLines||[]).slice(0,2).join(' · '))}</div>` : (full?.sourceSummary?.label ? `<div class="source-line">📍 ${escapeHtml(full.sourceSummary.label)}${full.sourceSummary.lines?.length ? ' · ' + escapeHtml(full.sourceSummary.lines.slice(0,2).join(' · ')) : ''}</div>` : '')}
    ${reasons.length ? `<div class="reason-list">${reasons.map(escapeHtml).join(' · ')}</div>` : ''}
    <div class="tier-preview">${tierPreviewHTML(full)}</div>
    <div class="card-actions">
      <button type="button" data-act="detail">详情</button>
      <button type="button" data-act="build">${inBuild ? '已在配装 ✓' : '加入配装'}</button>
      <button type="button" data-act="compare">${inCompare ? '取消对比' : '对比'}</button>
      ${it.numId ? `<a href="https://www.grimtools.com/db/zh/itemsets/${it.numId}" target="_blank" rel="noopener"><button type="button">GrimTools</button></a>` : ''}
    </div>
      </div>
    </div>
  </article>`;
}

function bindCardList(root) {
  if (!root) return;
  root.onclick = (e) => {
    const itemEl = e.target.closest('[data-item-id]');
    if (itemEl) {
      e.preventDefault();
      e.stopPropagation();
      openItemDetail(itemEl.dataset.itemId);
      return;
    }
    const btn = e.target.closest('button[data-act]');
    const card = e.target.closest('.card');
    if (!card) return;
    // loose item card
    if (card.dataset.itemId && !card.dataset.id) {
      if (btn) return; // no set actions on pure item cards
      return openItemDetail(card.dataset.itemId);
    }
    const id = card.dataset.id;
    if (!id) return;
    if (!btn) return openDetail(id);
    const act = btn.dataset.act;
    if (act === 'detail') openDetail(id);
    if (act === 'build') {
      toggleBuild(id);
      renderList();
      renderClassResults();
      renderPlanner();
    }
    if (act === 'compare') {
      toggleCompare(id);
      renderList();
      renderClassResults();
      renderCompare();
    }
  };
}

async function renderList() {
  const list = filterIndex();
  $('#resultCount').textContent = `${list.length} 套`;
  const root = $('#list');
  const fClass = $('#fClass')?.value ? +$('#fClass').value : 0;
  ensureSets();
  const slice = list.slice(0, 80);
  const more = list.length - slice.length;
  root.innerHTML =
    slice
      .map((it) => {
        const sc = fClass ? setClassScore(it, [fClass]) : null;
        return cardHTML(it, state.sets.get(it.id), { classScore: sc });
      })
      .join('') + (more > 0 ? `<div class="empty">仅显示前 80 条（还有 ${more} 套）</div>` : '');
  bindCardList(root);
}

function renderStatChips() {
  const stats = (state.meta?.popularStats || []).slice(0, 16);
  const box = $('#statChips');
  if (!box) return;
  box.innerHTML =
    `<button type="button" class="chip ${!state.activeStat ? 'on' : ''}" data-stat="">全部属性</button>` +
    stats
      .map(
        (s) =>
          `<button type="button" class="chip ${state.activeStat === s.label ? 'on' : ''}" data-stat="${escapeHtml(
            s.label
          )}">${escapeHtml(s.label)}</button>`
      )
      .join('');
  box.onclick = (e) => {
    const b = e.target.closest('[data-stat]');
    if (!b) return;
    state.activeStat = b.dataset.stat || '';
    renderStatChips();
    renderList();
  };
}

function formatStatValue(st) {
  if (st.tier?.raw) {
    const parts = [];
    const raw = st.tier.raw;
    for (let i = 1; i < raw.length; i++) if (raw[i]) parts.push(`${i + 1}件 ${raw[i]}`);
    return parts.join(' · ') || String(st.value);
  }
  if (Array.isArray(st.value)) return st.value.filter(Boolean).join(' / ');
  return String(st.value);
}

function pieceHTML(m) {
  const stats = (m.stats || [])
    .slice(0, 12)
    .map(
      (s) =>
        `<div class="stat-line"><span>${escapeHtml(s.label)}</span><span>${escapeHtml(formatStatValue(s))}</span></div>`
    )
    .join('');
  const skills = (m.skillBonuses || [])
    .map((s) => {
      if (s.type === 'modifier') return `强化：${s.skillZh || s.skillEn}`;
      return `+${Array.isArray(s.levels) ? s.levels : s.levels} ${s.nameZh || s.nameEn}`;
    })
    .join('；');
  const pet =
    m.petBonus?.stats?.map((s) => `${s.label} ${s.value}`).join('，') || '';
  return `
  <div class="piece-card">
    ${iconHTML(m.bitmap, m.rarity, 'lg', m.id)}
    <div class="piece-body">
    <h5>${escapeHtml(m.nameZh)}</h5>
    <div class="slot">${escapeHtml(m.slot?.zh || '')} · ${escapeHtml(rarityZh(m.rarity))} · Lv ${m.level ?? '?'} · ${escapeHtml(
    m.dlc?.zh || ''
  )}</div>
    ${m.nameEn ? `<div class="en">${escapeHtml(m.nameEn)}</div>` : ''}
    <div class="kv" style="margin-top:6px">${stats || '<div class="muted">无解析属性</div>'}</div>
    ${skills ? `<div class="meta-line">技能：${escapeHtml(skills)}</div>` : ''}
    ${m.grantedSkill ? `<div class="meta-line">获得技能：${escapeHtml(m.grantedSkill.nameZh || '')}</div>` : ''}
    ${pet ? `<div class="meta-line">宠物：${escapeHtml(pet)}</div>` : ''}
    ${sourcesBlockHTML(m.sources || getItemSources(m.id), {compact:false})}
    </div>
  </div>`;
}


function openItemDetail(id) {
  const d = getItemDetail(id) || (window.GD_DATA_ITEM_DETAILS || {})[id];
  if (!d) {
    console.warn('missing item', id, 'details keys', Object.keys(window.GD_DATA_ITEM_DETAILS||{}).length);
    alert('未找到该装备详情: ' + id);
    return;
  }
  const body = $('#drawerBody');
  if (!body) return;
  const stats = (d.stats || [])
    .map((s) => {
      const val = Array.isArray(s.value) ? s.value.filter(Boolean).join('/') : s.value;
      return `<div class="stat-line"><span>${escapeHtml(s.label)}</span><span>${escapeHtml(val)}</span></div>`;
    })
    .join('');
  const skills = (d.skillBonuses || [])
    .map((s) => {
      if (s.type === 'modifier') return `强化：${s.skillZh || s.skillEn}`;
      const lv = Array.isArray(s.levels) ? s.levels : s.levels;
      return `+${lv ?? ''} ${s.nameZh || s.nameEn || ''}`;
    })
    .filter(Boolean)
    .map((x) => `<div class="line">${escapeHtml(x)}</div>`)
    .join('');
  const pet = (d.petBonus?.stats || [])
    .map((s) => `${s.label} ${s.value}`)
    .join('，');
  body.innerHTML = `
    <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:8px">
      ${iconHTML(d.bitmap, d.rarity, 'lg', null)}
      <div style="flex:1">
        <h2 style="margin:0 28px 4px 0">${escapeHtml(d.nameZh || '')}</h2>
        <div class="en">${escapeHtml(d.nameEn || '')}</div>
        <div class="badges" style="justify-content:flex-start;margin-top:6px">
          ${d.mythical || d.style?.mythical ? '<span class="badge myth">神话</span>' : d.style?.zh ? `<span class="badge">${escapeHtml(d.style.zh)}</span>` : ''}
          <span class="badge ${rarityClass(d.rarity)}">${escapeHtml(rarityZh(d.rarity))}</span>
          <span class="badge">Lv ${d.level ?? '?'}</span>
          ${d.slot?.zh ? `<span class="badge">${escapeHtml(d.slot.zh)}</span>` : ''}
          ${d.mi ? '<span class="badge mi-badge">MI</span>' : ''}
          <span class="badge dlc">${escapeHtml(d.dlc?.zh || '')}</span>
        </div>
      </div>
    </div>
    ${d.setNameZh ? `<div class="meta-line">所属套装：${escapeHtml(d.setNameZh)}${d.setNumId ? ` (#${d.setNumId})` : ''}</div>` : ''}
    <div class="section"><h4>属性</h4><div class="kv">${stats || '<div class="muted">无解析到基础属性</div>'}</div></div>
    ${skills ? `<div class="section"><h4>技能</h4>${skills}</div>` : ''}
    ${d.grantedSkill ? `<div class="section"><h4>获得技能</h4><div class="line">${escapeHtml(d.grantedSkill.nameZh || d.grantedSkill.nameEn || '')}</div></div>` : ''}
    ${pet ? `<div class="section"><h4>宠物加成</h4><div class="line">${escapeHtml(pet)}</div></div>` : ''}
    ${sourcesBlockHTML(d.sources || getItemSources(d.id))}
    ${d.setId ? `<div class="card-actions"><button type="button" id="btnOpenSet">查看套装</button></div>` : ''}
  `;
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  const b = $('#btnOpenSet');
  if (b) b.onclick = () => openDetail(d.setId);
}

function openDetail(id) {
  const s = getSet(id);
  if (!s) return;
  const body = $('#drawerBody');
  const tiers = `<div class="section"><h4>套装加成</h4>${bonusTiersHTML(s)}</div>`;

  const build = currentBuild();
  const tags = (build?.tags && build.tags[id]) || [];
  const classBest = (s.classBest || [])
    .map((b) => `<span class="score-pill">${escapeHtml(className(b.classId))} ${b.score}</span>`)
    .join('');

  body.innerHTML = `
    <h2>${escapeHtml(s.nameZh)}</h2>
    <div class="en">${escapeHtml(s.nameEn || '')}</div>
    <div style="margin:8px 0">${iconsRowHTML((s.members||[]).map(m=>({id:m.id,bitmap:m.bitmap,rarity:m.rarity})), 'md', true)}</div>
    <div class="badges" style="justify-content:flex-start;margin:8px 0">
      ${s.mythical ? `<span class="badge myth">神话</span>` : s.mythicalPartial ? `<span class="badge myth">含神话</span>` : ''}
      <span class="badge ${rarityClass(s.members?.[0]?.rarity)}">${escapeHtml(rarityZh(s.members?.[0]?.rarity))}</span>
      <span class="badge">Lv ${s.level ?? '?'}</span>
      <span class="badge">${s.pieceCount} 件</span>
      <span class="badge dlc">${escapeHtml(s.dlc?.zh || '本体')}</span>
    </div>
    <div class="icon-tip">点左侧/部件图标可查看单件完整属性</div>
    ${classBest ? `<div class="section"><h4>职业相关</h4>${classBest}</div>` : ''}
    ${s.descriptionZh ? `<div class="desc">“${escapeHtml(s.descriptionZh)}”</div>` : ''}
    ${s.sourceSummary ? `<div class="section"><h4>获取来源（套装汇总）</h4><div class="source-line">📍 ${escapeHtml(s.sourceSummary.label||'')}</div>${(s.sourceSummary.lines||[]).map(l=>`<div class="source-item">• ${escapeHtml(l)}</div>`).join('')}<p class="muted tiny">具体怪物/任务/地图见下方各部件。</p></div>` : ''}
    <div class="card-actions">
      <button type="button" id="dBuild">${build?.setIds?.includes(id) ? '移出配装' : '加入配装'}</button>
      <button type="button" id="dCompare">${state.compare.includes(id) ? '取消对比' : '加入对比'}</button>
      ${s.grimtoolsUrl ? `<a href="${s.grimtoolsUrl}" target="_blank" rel="noopener"><button type="button">打开 GrimTools</button></a>` : ''}
    </div>
    <div class="section tag-input">
      <h4>我的标签（当前方案）</h4>
      <div style="display:flex;gap:6px">
        <input id="tagInput" placeholder="例如：宠物核心 / 过渡 / 毕业肩" />
        <button type="button" id="tagAdd">添加</button>
      </div>
      <div class="tag-list" id="tagList">
        ${tags.map((t) => `<span class="tag">${escapeHtml(t)}<button type="button" data-rm="${escapeHtml(t)}">×</button></span>`).join('')}
      </div>
    </div>
    ${tiers || ''}
    <div class="section">
      <h4>部件（${s.members.length}）</h4>
      ${s.members.map(pieceHTML).join('')}
    </div>
  `;
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#dBuild').onclick = () => {
    toggleBuild(id);
    openDetail(id);
  };
  $('#dCompare').onclick = () => {
    toggleCompare(id);
    openDetail(id);
  };
  $('#tagAdd').onclick = () => {
    const v = $('#tagInput').value.trim();
    if (!v) return;
    addTag(id, v);
    openDetail(id);
  };
  $('#tagList').onclick = (e) => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    removeTag(id, b.dataset.rm);
    openDetail(id);
  };
  // drawerBody item click
  $('#drawerBody').onclick = (e) => {
    const el = e.target.closest('[data-item-id]');
    if (!el) return;
    e.preventDefault();
    openItemDetail(el.dataset.itemId);
  };
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
}

function toggleBuild(id) {
  const b = currentBuild();
  if (!b) return;
  const i = b.setIds.indexOf(id);
  if (i >= 0) b.setIds.splice(i, 1);
  else b.setIds.push(id);
  b.updatedAt = Date.now();
  saveBuilds();
}
function addTag(setId, tag) {
  const b = currentBuild();
  if (!b.tags) b.tags = {};
  if (!b.tags[setId]) b.tags[setId] = [];
  if (!b.tags[setId].includes(tag)) b.tags[setId].push(tag);
  saveBuilds();
}
function removeTag(setId, tag) {
  const b = currentBuild();
  if (!b.tags?.[setId]) return;
  b.tags[setId] = b.tags[setId].filter((t) => t !== tag);
  saveBuilds();
}
function toggleCompare(id) {
  const i = state.compare.indexOf(id);
  if (i >= 0) state.compare.splice(i, 1);
  else {
    if (state.compare.length >= 3) state.compare.shift();
    state.compare.push(id);
  }
  saveCompare();
}

/* ---------- class tab ---------- */
function initClassUI() {
  const g = state.classGuide;
  if (!g) return;

  // datalist + chips + selects
  const dl = $('#classList');
  dl.innerHTML = g.classes.map((c) => `<option value="${escapeHtml(c.nameZh)}"></option>`).join('');

  const chips = $('#classChips');
  chips.innerHTML = g.classes
    .map(
      (c) =>
        `<button type="button" class="chip" data-cid="${c.id}">${escapeHtml(c.nameZh)}${
          c.dlcZh && c.dlcZh !== '本体' ? '' : ''
        }</button>`
    )
    .join('');

  for (const sel of ['#classA', '#classB', '#fClass']) {
    const el = $(sel);
    if (!el) continue;
    const keepFirst = sel === '#fClass' || sel === '#classA' || sel === '#classB';
    const head = el.querySelector('option[value=""]')?.outerHTML || '<option value="">—</option>';
    el.innerHTML =
      head +
      g.classes
        .map((c) => `<option value="${c.id}">${escapeHtml(c.nameZh)}${c.dlc ? ' · ' + c.dlcZh : ''}</option>`)
        .join('');
  }

  chips.onclick = (e) => {
    const b = e.target.closest('[data-cid]');
    if (!b) return;
    const id = +b.dataset.cid;
    // toggle into classIds max 2
    const idx = state.classIds.indexOf(id);
    if (idx >= 0) state.classIds.splice(idx, 1);
    else {
      if (state.classIds.length >= 2) state.classIds.shift();
      state.classIds.push(id);
    }
    syncClassSelectors();
    runClassFilter();
  };

  $('#btnClassSearch').onclick = () => {
    const ids = resolveClassQuery($('#classQuery').value);
    if (ids.length) state.classIds = ids;
    else {
      // fallback selectors
      const a = +$('#classA').value || 0;
      const b = +$('#classB').value || 0;
      state.classIds = [a, b].filter(Boolean);
    }
    syncClassSelectors();
    runClassFilter();
  };
  $('#classQuery').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btnClassSearch').click();
  });
  ['classA', 'classB', 'classMinScore', 'classLevel'].forEach((id) => {
    $(`#${id}`).addEventListener('change', () => {
      const a = +$('#classA').value || 0;
      const b = +$('#classB').value || 0;
      state.classIds = [a, b].filter(Boolean);
      syncClassSelectors();
      if (state.classIds.length) runClassFilter();
    });
  });

  $$('.subtab').forEach((t) => {
    t.onclick = () => {
      state.classSub = t.dataset.sub;
      $$('.subtab').forEach((x) => x.classList.toggle('active', x === t));
      $$('#classResult .subpanel').forEach((p) => p.classList.remove('active'));
      const map = { sets: '#classSets', loose: '#classLoose', slots: '#classSlots' };
      $(map[state.classSub])?.classList.add('active');
    };
  });
}

function syncClassSelectors() {
  const ids = state.classIds;
  $('#classA').value = ids[0] || '';
  $('#classB').value = ids[1] || '';
  $$('#classChips .chip').forEach((c) => {
    c.classList.toggle('on', ids.includes(+c.dataset.cid));
  });
  const names = ids.map(className);
  $('#classQuery').value = names.join(' + ');
  $('#classResolveHint').textContent = ids.length
    ? `当前：${names.join(' + ')}（双修分数相加） · 匹配套装技能/专精绑定`
    : '匹配规则：套装/散件上的「+专精点、+技能等级、技能强化」会给对应职业加分。';
}

function combinedSetEntry(setId, classIds) {
  const g = state.classGuide;
  let score = 0;
  const reasons = [];
  for (const cid of classIds) {
    const guide = g.guides[cid] || g.guides[String(cid)];
    const row = guide?.sets?.find((s) => s.id === setId);
    if (row) {
      score += row.score || 0;
      for (const r of row.reasons || []) {
        if (reasons.length < 10) reasons.push(`[${className(cid)}] ${r}`);
      }
    } else {
      // fallback from index classScores
      const it = state.index.find((x) => x.id === setId);
      score += setClassScore(it || {}, [cid]);
    }
  }
  return { score, reasons };
}

function runClassFilter() {
  const ids = state.classIds;
  const empty = $('#classEmpty');
  const result = $('#classResult');
  if (!ids.length) {
    empty.classList.remove('hidden');
    empty.textContent = '选一个或两个专精开始。也支持直接打字：神秘+萨满、死灵、狂战士…';
    result.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  result.classList.remove('hidden');
  renderClassResults();
}

function renderClassResults() {
  if (!state.classIds.length || !state.classGuide) return;
  ensureSets();
  const ids = state.classIds;
  const minScore = +$('#classMinScore').value || 0;
  const levelKey = $('#classLevel').value;
  const names = ids.map(className);

  // gather set ids from all selected guides
  const setMap = new Map();
  for (const cid of ids) {
    const guide = state.classGuide.guides[cid] || state.classGuide.guides[String(cid)];
    for (const row of guide?.sets || []) {
      if (!setMap.has(row.id)) setMap.set(row.id, true);
    }
  }
  // also scan full index for dual-sum that might miss if only one side listed
  for (const it of state.index) {
    if (it.blacklisted) continue;
    const sc = setClassScore(it, ids);
    if (sc >= minScore) setMap.set(it.id, true);
  }

  let sets = [...setMap.keys()]
    .map((id) => {
      const it = state.index.find((x) => x.id === id);
      if (!it || it.blacklisted) return null;
      if (!matchLevel(it.level, levelKey)) return null;
      const { score, reasons } = combinedSetEntry(id, ids);
      if (score < minScore) return null;
      return { it, score, reasons, full: getSet(id) };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.it.level || 0) - (a.it.level || 0));

  // loose items
  const looseMap = new Map();
  for (const cid of ids) {
    const guide = state.classGuide.guides[cid] || state.classGuide.guides[String(cid)];
    for (const row of guide?.loose || []) {
      const prev = looseMap.get(row.id) || {
        id: row.id,
        nameZh: row.nameZh,
        nameEn: row.nameEn,
        rarity: row.rarity,
        level: row.level,
        slot: row.slot,
        dlcZh: row.dlcZh,
        mi: row.mi,
        bitmap: row.bitmap || null,
        mythical: !!row.mythical || !!row.style?.mythical,
        style: row.style || null,
        sourceLabel: row.sourceLabel || '',
        sourceLines: row.sourceLines || [],
        sources: row.sources || null,
        score: 0,
        reasons: [],
      };
      prev.score += row.score || 0;
      if (!prev.bitmap && row.bitmap) prev.bitmap = row.bitmap;
      if (row.mythical || row.style?.mythical) prev.mythical = true;
      if (!prev.style && row.style) prev.style = row.style;
      if (!prev.sourceLabel && row.sourceLabel) prev.sourceLabel = row.sourceLabel;
      if ((!prev.sourceLines || !prev.sourceLines.length) && row.sourceLines) prev.sourceLines = row.sourceLines;
      for (const r of row.reasons || []) {
        if (prev.reasons.length < 8) prev.reasons.push(`[${className(cid)}] ${r}`);
      }
      looseMap.set(row.id, prev);
    }
  }
  // also from looseIndex scores sum
  for (const li of state.classGuide.looseIndex || []) {
    let sc = 0;
    for (const cid of ids) sc += li.scores?.[cid] || li.scores?.[String(cid)] || 0;
    if (sc < minScore) continue;
    if (!matchLevel(li.level, levelKey)) continue;
    const prev = looseMap.get(li.id) || {
      id: li.id,
      nameZh: li.nameZh,
      nameEn: li.nameEn,
      rarity: li.rarity,
      level: li.level,
      slot: { zh: li.slotZh },
      dlcZh: li.dlcZh,
      mi: li.mi,
      bitmap: li.bitmap || null,
      mythical: !!li.mythical || !!li.style?.mythical,
      style: li.style || null,
      sourceLabel: li.sourceLabel || li.sourceLines?.[0] || '',
      sourceLines: li.sourceLines || [],
      sources: li.sources || null,
      score: 0,
      reasons: [],
    };
    prev.score = Math.max(prev.score, sc);
    if (!prev.bitmap && li.bitmap) prev.bitmap = li.bitmap;
    if (li.mythical || li.style?.mythical) prev.mythical = true;
    if (!prev.style && li.style) prev.style = li.style;
    if (!prev.sourceLabel && (li.sourceLabel || li.sourceLines?.[0])) prev.sourceLabel = li.sourceLabel || li.sourceLines[0];
    if (!prev.reasons.length && li.skillSummary?.length) {
      prev.reasons = li.skillSummary.slice(0, 4);
    }
    // fallback bitmap from item details
    if (!prev.bitmap) {
      const det = getItemDetail(li.id);
      if (det?.bitmap) prev.bitmap = det.bitmap;
      if (det?.style) prev.style = det.style;
      if (det?.mythical) prev.mythical = true;
    }
    looseMap.set(li.id, prev);
  }

  let loose = [...looseMap.values()]
    .filter((x) => x.score >= minScore && matchLevel(x.level, levelKey))
    .sort((a, b) => b.score - a.score || (b.level || 0) - (a.level || 0));

  // summary
  $('#classSummary').innerHTML = `
    <h3>${escapeHtml(names.join(' + '))}</h3>
    <div class="meta-line">
      <span>套装 ${sets.length} 套（显示前 40）</span>
      <span>散件 ${loose.length} 件（显示前 40）</span>
      <span>最低分 ${minScore}</span>
      <span>${levelKey || '全等级'}</span>
    </div>
    <p class="muted tiny" style="margin:8px 0 0">分数来自技能/专精绑定深度，不是通关强度排名。双修时两边加分。</p>
  `;

  // sets panel
  const topSets = sets.slice(0, 40);
  $('#classSets').innerHTML = topSets.length
    ? topSets.map((x) => cardHTML(x.it, x.full, { classScore: x.score, reasons: x.reasons.slice(0, 5) })).join('')
    : '<div class="empty">没有达到分数线的套装，试试降低「最低相关分」</div>';
  bindCardList($('#classSets'));

  // loose panel
  const topLoose = loose.slice(0, 40);
  const looseHTML = topLoose.length
    ? topLoose
        .map(
          (x) => `
    <article class="card loose-card" data-loose="${x.id}" data-item-id="${x.id}">
      <div class="card-with-icon">
        ${iconHTML(x.bitmap, x.rarity, 'lg', x.id)}
        <div class="card-main">
      <div class="card-top">
        <div>
          <h3><span class="slot-tag">${escapeHtml(x.slot?.zh || x.slotZh || '')}</span>${escapeHtml(x.nameZh)}</h3>
          <div class="en">${escapeHtml(x.nameEn || '')}</div>
        </div>
        <div class="badges">
          <span class="badge legend">相关 ${Math.round(x.score * 10) / 10}</span>
          ${x.mythical || x.style?.mythical ? '<span class="badge myth">神话</span>' : ''}
          <span class="badge ${rarityClass(x.rarity)}">${escapeHtml(rarityZh(x.rarity))}</span>
          <span class="badge">Lv ${x.level ?? '?'}</span>
          ${x.mi ? '<span class="badge mi-badge">MI</span>' : ''}
          <span class="badge dlc">${escapeHtml(x.dlcZh || '')}</span>
        </div>
      </div>
      ${scoreBar(x.score)}
      <div class="reason-list">${(x.reasons || []).slice(0, 5).map(escapeHtml).join(' · ')}</div>
      ${x.sourceLabel || (x.sourceLines&&x.sourceLines[0]) ? `<div class="source-line">📍 ${escapeHtml(x.sourceLabel || x.sourceLines[0])}</div>` : (getItemSources(x.id)?.lines?.[0] ? `<div class="source-line">📍 ${escapeHtml(getItemSources(x.id).lines[0])}</div>` : '')}
        </div>
      </div>
    </article>`
        )
        .join('')
    : '<div class="empty">没有达到分数线的散件</div>';
  $('#classLoose').innerHTML = looseHTML;
  bindCardList($('#classLoose'));

  // by slot
  const bySlot = {};
  for (const x of loose) {
    const k = x.slot?.zh || '其他';
    if (!bySlot[k]) bySlot[k] = [];
    if (bySlot[k].length < 8) bySlot[k].push(x);
  }
  const slotOrder = [
    '头部',
    '肩部',
    '胸部',
    '手部',
    '腰带',
    '腿部',
    '脚部',
    '项链',
    '戒指',
    '勋章',
    '单手剑',
    '单手斧',
    '单手锤',
    '匕首',
    '权杖',
    '单手远程',
    '双手远程',
    '法杖',
    '双手剑',
    '双手斧',
    '双手锤',
    '矛',
    '双手矛',
    '副手',
    '盾牌',
    '圣物',
    '神器',
  ];
  const keys = Object.keys(bySlot).sort((a, b) => {
    const ia = slotOrder.indexOf(a);
    const ib = slotOrder.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  $('#classSlots').innerHTML = keys.length
    ? keys
        .map((k) => {
          const items = bySlot[k];
          return `<div class="slot-block"><h4>${escapeHtml(k)}</h4>${items
            .map(
              (x) =>
                `<div class="stat-line"><span>${escapeHtml(x.nameZh)} · Lv${x.level ?? '?'}${
                  x.mi ? ' · MI' : ''
                }</span><span>相关 ${Math.round(x.score * 10) / 10}</span></div>
             <div class="reason-list" style="margin:0 0 2px">${(x.reasons || [])
               .slice(0, 2)
               .map(escapeHtml)
               .join(' · ')}</div>
             ${x.sourceLabel || x.sourceLines?.[0] ? `<div class="source-line" style="margin:0 0 8px">📍 ${escapeHtml(x.sourceLabel || x.sourceLines[0])}</div>` : '<div style="margin-bottom:8px"></div>'}`
            )
            .join('')}</div>`;
        })
        .join('')
    : '<div class="empty">暂无</div>';
}

/* ---------- planner / compare ---------- */
function renderBuildSelect() {
  const sel = $('#buildSelect');
  const ids = Object.keys(state.builds);
  sel.innerHTML = ids
    .map((id) => {
      const b = state.builds[id];
      return `<option value="${id}" ${id === state.currentBuildId ? 'selected' : ''}>${escapeHtml(b.name)} (${
        b.setIds.length
      })</option>`;
    })
    .join('');
}

function renderPlanner() {
  renderBuildSelect();
  const b = currentBuild();
  if (!b) return;
  $('#buildNotes').value = b.notes || '';
  ensureSets();
  const box = $('#buildSets');
  const empty = $('#buildEmpty');
  if (!b.setIds.length) {
    box.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  box.innerHTML = b.setIds
    .map((id) => {
      const s = getSet(id);
      const it = state.index.find((x) => x.id === id) || {
        id,
        nameZh: s?.nameZh,
        nameEn: s?.nameEn,
        level: s?.level,
        pieceCount: s?.pieceCount,
        dlcZh: s?.dlc?.zh,
        rarity: s?.members?.[0]?.rarity,
        slots: s?.slots,
        memberNames: s?.members?.map((m) => m.nameZh),
      };
      const tags = (b.tags && b.tags[id]) || [];
      return (
        cardHTML(it, s) +
        (tags.length
          ? `<div class="tag-list" style="margin:-4px 0 8px 4px">${tags
              .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
              .join('')}</div>`
          : '')
      );
    })
    .join('');
  bindCardList(box);
}

function renderCompare() {
  ensureSets();
  const bar = $('#compareBar');
  bar.innerHTML = [0, 1, 2]
    .map((i) => {
      const id = state.compare[i];
      const s = id && getSet(id);
      if (!s) return `<div class="compare-slot muted">空位 ${i + 1}<br/>点「对比」加入</div>`;
      return `<div class="compare-slot"><b>${escapeHtml(s.nameZh)}</b><div class="en">Lv${s.level} · ${
        s.pieceCount
      }件 · ${escapeHtml(s.dlc?.zh || '')}</div><button type="button" data-rmc="${id}" class="ghost">移除</button></div>`;
    })
    .join('');
  bar.onclick = (e) => {
    const b = e.target.closest('[data-rmc]');
    if (!b) return;
    toggleCompare(b.dataset.rmc);
    renderCompare();
    renderList();
  };

  const sets = state.compare.map((id) => getSet(id)).filter(Boolean);
  const table = $('#compareTable');
  if (sets.length < 2) {
    table.innerHTML = '<div class="empty">至少选 2 套才能对比</div>';
    return;
  }
  const rows = [];
  rows.push(['名称', ...sets.map((s) => s.nameZh)]);
  rows.push(['英文', ...sets.map((s) => s.nameEn || '')]);
  rows.push(['等级', ...sets.map((s) => s.level ?? '')]);
  rows.push(['件数', ...sets.map((s) => s.pieceCount)]);
  rows.push(['DLC', ...sets.map((s) => s.dlc?.zh || '本体')]);
  rows.push(['部位', ...sets.map((s) => (s.slots || []).join('/'))]);
  rows.push(['部件', ...sets.map((s) => s.members.map((m) => m.nameZh).join('、'))]);
  rows.push([
    '职业相关',
    ...sets.map((s) =>
      (s.classBest || [])
        .slice(0, 3)
        .map((b) => `${className(b.classId)} ${b.score}`)
        .join('；')
    ),
  ]);
  const allPcs = new Set();
  sets.forEach((s) => Object.keys(s.tierSummary || {}).forEach((p) => allPcs.add(p)));
  [...allPcs]
    .sort((a, b) => a - b)
    .forEach((pcs) => {
      rows.push([`${pcs}件套`, ...sets.map((s) => (s.tierSummary?.[pcs] || []).join('；') || '—')]);
    });
  table.innerHTML = `<table><tbody>${rows
    .map(
      (r, idx) =>
        `<tr>${r
          .map((c, i) => (i === 0 || idx === 0 ? `<th>${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`))
          .join('')}</tr>`
    )
    .join('')}</tbody></table>`;
}

function bindUI() {
  $$('.tab').forEach((tab) => {
    tab.onclick = () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.tab-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $(`#tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'planner') renderPlanner();
      if (tab.dataset.tab === 'compare') renderCompare();
      if (tab.dataset.tab === 'browse') renderList();
      if (tab.dataset.tab === 'class' && state.classIds.length) renderClassResults();
      if (tab.dataset.tab === 'quest') renderQuest();
    };
  });

  if ($('#btnQuestSearch')) {
    $('#btnQuestSearch').onclick = renderQuest;
    $('#questQ')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') renderQuest();
    });
    $('#btnQuestOrganize').onclick = organizeQuests;
    $$('.quest-mode-tabs [data-qmode]').forEach((b) => {
      b.onclick = () => {
        $$('.quest-mode-tabs [data-qmode]').forEach((x) => x.classList.toggle('active', x === b));
        const mode = b.dataset.qmode;
        $('#questModeSingle').classList.toggle('hidden', mode !== 'single');
        $('#questModeMessy').classList.toggle('hidden', mode !== 'messy');
        $('#questModeSources').classList.toggle('hidden', mode !== 'sources');
        $('#questList').innerHTML = '';
        $('#questEmpty').style.display = mode === 'sources' ? 'none' : 'block';
        if (mode === 'sources') renderQuestSources();
      };
    });
  }

  let t = null;
  $('#q').addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(renderList, 120);
  });
  $('#btnClear').onclick = () => {
    $('#q').value = '';
    state.activeStat = '';
    ['fLevel', 'fDlc', 'fPieces', 'fRarity', 'fClass'].forEach((id) => {
      if ($(`#${id}`)) $(`#${id}`).value = '';
    });
    renderStatChips();
    renderList();
  };
  ['fLevel', 'fDlc', 'fPieces', 'fRarity', 'fMyth', 'fSort', 'fHideBlack', 'fClass', 'fClassScore'].forEach((id) => {
    const el = $(`#${id}`);
    if (el) el.addEventListener('change', renderList);
  });
  $$('[data-close]').forEach((el) => (el.onclick = closeDrawer));

  $('#btnNewBuild').onclick = () => {
    const name = $('#buildName').value.trim() || `方案 ${Object.keys(state.builds).length + 1}`;
    const id = 'build_' + Date.now();
    state.builds[id] = { id, name, notes: '', setIds: [], tags: {}, updatedAt: Date.now() };
    state.currentBuildId = id;
    $('#buildName').value = '';
    saveBuilds();
    renderPlanner();
  };
  $('#buildSelect').onchange = () => {
    state.currentBuildId = $('#buildSelect').value;
    renderPlanner();
  };
  $('#btnDelBuild').onclick = () => {
    if (Object.keys(state.builds).length <= 1) return alert('至少保留一个方案');
    if (!confirm('删除当前方案？')) return;
    delete state.builds[state.currentBuildId];
    state.currentBuildId = Object.keys(state.builds)[0];
    saveBuilds();
    renderPlanner();
  };
  $('#buildNotes').addEventListener('change', () => {
    const b = currentBuild();
    if (!b) return;
    b.notes = $('#buildNotes').value;
    b.updatedAt = Date.now();
    saveBuilds();
  });
}


function questRewardHTML(rewards) {
  return (rewards || [])
    .map(
      (r) => `<div style="display:flex;gap:8px;align-items:center;margin:6px 0">
      ${iconHTML(r.bitmap, r.rarity, 'md', r.id)}
      <div style="flex:1">
        <div>${escapeHtml(r.nameZh || '')} ${r.style?.mythical ? '<span class="badge myth">神话</span>' : ''}</div>
        <div class="en">Lv ${r.level ?? '?'} · ${escapeHtml(rarityZh(r.rarity))}</div>
      </div>
    </div>`
    )
    .join('');
}
function questCardHTML(it, compact = false) {
  const steps = (it.steps || []).slice(0, 12);
  const images = (it.images || []).slice(0, compact ? 2 : 8);
  const rewards = questRewardHTML(it.rewards);
  return `<article class="quest-card" data-quest-id="${escapeHtml(it.id || '')}">
    <div class="card-top">
      <div>
        <h3>${escapeHtml(it.nameZh)}</h3>
        ${it.nameEn ? `<div class="en">${escapeHtml(it.nameEn)}</div>` : ''}
      </div>
      <div class="badges">
        ${it.chapter ? `<span class="badge">${escapeHtml(it.chapter)}</span>` : ''}
        ${it.type ? `<span class="badge">${escapeHtml(it.type)}</span>` : ''}
        <span class="badge dlc">${escapeHtml(it.source || '')}</span>
      </div>
    </div>
    ${it.summary ? `<p class="quest-summary">${escapeHtml(it.summary)}</p>` : ''}
    ${steps.length ? `<div class="section"><h4>关键步骤 / 接取提示</h4><ol class="quest-steps">${steps
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join('')}</ol></div>` : ''}
    ${images.length ? `<div class="section"><h4>路线图 / 攻略图</h4><div class="quest-images">${images
      .map((u) => `<a href="${escapeHtml(u)}" target="_blank" rel="noopener"><img src="${escapeHtml(u)}" loading="lazy" alt="${escapeHtml(it.nameZh)} 攻略图"></a>`)
      .join('')}</div></div>` : ''}
    ${rewards ? `<div class="section"><h4>任务奖励装备</h4>${rewards}</div>` : ''}
    <div class="card-actions">
      ${it.sourceUrl ? `<a href="${escapeHtml(it.sourceUrl)}" target="_blank" rel="noopener"><button type="button">查看完整原文</button></a>` : ''}
      <button type="button" data-copy-quest="${escapeHtml(it.nameZh)}">复制任务名</button>
    </div>
    <p class="muted tiny">来源：${escapeHtml(it.source || '任务资料库')}。本站展示检索摘要与路线图预览，完整内容以原攻略为准。</p>
  </article>`;
}
function renderQuest() {
  const q = ($('#questQ')?.value || '').trim().toLowerCase();
  const box = $('#questList');
  const empty = $('#questEmpty');
  const lib = window.GD_QUEST_LIBRARY || {};
  const all = lib.entries || [];
  if (!box) return;
  if (!q) {
    box.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = `任务库共 ${lib.entryCount || all.length} 条；输入任务名查询流程、地图图和原文。`;
    }
    return;
  }
  const tokens = q.split(/\s+/).filter(Boolean);
  let list = all
    .filter((it) => tokens.every((x) => (it.search || `${it.nameZh} ${it.nameEn || ''}`).includes(x)))
    .map((it) => {
      const n = (it.nameZh || '').toLowerCase();
      let score = 0;
      if (n === q) score += 100;
      else if (n.startsWith(q)) score += 60;
      else if (n.includes(q)) score += 35;
      if (it.steps?.length) score += 10;
      if (it.images?.length) score += 8;
      if (it.source === '3DM全DLC图文攻略') score += 4;
      return { it, score };
    })
    .sort((a, b) => b.score - a.score || (a.it.sourcePage || 999) - (b.it.sourcePage || 999))
    .slice(0, 20)
    .map((x) => x.it);
  if (!list.length) {
    box.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = '本地任务库没有精确命中。你可以把任务日志截图发给我，我会识别中文名并继续查 Wiki/攻略站。';
    }
    return;
  }
  if (empty) empty.style.display = 'none';
  box.innerHTML = list.map((it) => questCardHTML(it)).join('');
  bindQuestList(box);
}
function bindQuestList(box) {
  box.onclick = async (e) => {
    const item = e.target.closest('[data-item-id]');
    if (item) return openItemDetail(item.dataset.itemId);
    const copy = e.target.closest('[data-copy-quest]');
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.dataset.copyQuest);
        copy.textContent = '已复制';
      } catch {}
    }
  };
}
function organizeQuests() {
  const raw = ($('#questMessyInput')?.value || '').trim();
  const box = $('#questList');
  const empty = $('#questEmpty');
  const all = window.GD_QUEST_LIBRARY?.entries || [];
  const names = raw.split(/[\n，,、;；]+/).map((x) => x.trim()).filter(Boolean);
  const rows = [];
  for (const name of names) {
    const q = name.toLowerCase();
    let hits = all.filter((it) => (it.nameZh || '').includes(name));
    if (!hits.length) hits = all.filter((it) => (it.search || '').includes(q));
    hits.sort((a, b) => {
      const ae = a.nameZh === name ? 1 : 0;
      const be = b.nameZh === name ? 1 : 0;
      return be - ae || (b.steps?.length || 0) - (a.steps?.length || 0);
    });
    rows.push({ input: name, hit: hits[0] || null });
  }
  const chapterOrder = (s) => {
    const m = (s || '').match(/第([一二三四五六七八九十]+)章/);
    const map = { 一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9, 十:10 };
    return m ? (map[m[1]] || 50) : 99;
  };
  rows.sort((a, b) => chapterOrder(a.hit?.chapter) - chapterOrder(b.hit?.chapter) || (a.hit?.sourcePage || 999) - (b.hit?.sourcePage || 999));
  if (!rows.length) {
    box.innerHTML = '';
    if (empty) { empty.style.display = 'block'; empty.textContent = '请先粘贴任务名。'; }
    return;
  }
  if (empty) empty.style.display = 'none';
  box.innerHTML = `<div class="class-summary"><h3>建议处理顺序</h3><p class="muted tiny">先按章节，再按攻略页顺序。未识别项保留在末尾。</p></div>` +
    rows.map((r, i) => r.hit
      ? `<div class="quest-order-row"><b>${i + 1}. ${escapeHtml(r.input)}</b><span>${escapeHtml(r.hit.chapter || '章节待确认')} · ${escapeHtml(r.hit.type || '')}</span><a href="${escapeHtml(r.hit.sourceUrl || '#')}" target="_blank">攻略</a></div>`
      : `<div class="quest-order-row missing"><b>${i + 1}. ${escapeHtml(r.input)}</b><span>未识别，请发任务日志截图给我</span></div>`).join('');
}
function renderQuestSources() {
  const el = $('#questModeSources');
  if (!el) return;
  const list = window.GD_QUEST_LIBRARY?.sourceCatalog || [];
  el.innerHTML = list.map((s) => `<article class="quest-card">
    <h3>${escapeHtml(s.name)}</h3>
    <div class="badges" style="justify-content:flex-start"><span class="badge">${escapeHtml(s.language)}</span><span class="badge dlc">${escapeHtml(s.status)}</span></div>
    <p>${escapeHtml(s.coverage)}</p>
    <div class="tag-list">${(s.strengths || []).map((x) => `<span class="tag">${escapeHtml(x)}</span>`).join('')}</div>
    <div class="card-actions"><a href="${escapeHtml(s.url)}" target="_blank"><button>打开来源</button></a></div>
  </article>`).join('');
}

function main() {
  loadBuilds();
  bindUI();
  try {
    state.meta = window.GD_DATA_META;
    state.index = window.GD_DATA_SETS_INDEX || [];
    state.classGuide = window.GD_DATA_CLASS_GUIDE || null;
    if (!state.meta || !state.index.length) throw new Error('内嵌数据未加载');
    ensureSets();
    const clsN = state.classGuide?.classes?.length || 0;
    $('#metaLine').textContent = `${state.meta.gameVersion || ''} · ${state.meta.activeSetCount}/${
      state.meta.setCount
    } 套装 · ${clsN} 专精筛选 · 更新 ${new Date(state.meta.extractedAt).toLocaleString()}`;
    initClassUI();
    renderStatChips();
    renderList();
    renderPlanner();
    renderCompare();
  } catch (e) {
    $('#metaLine').textContent = '数据加载失败：' + e.message;
    console.error(e);
  }
}

main();
