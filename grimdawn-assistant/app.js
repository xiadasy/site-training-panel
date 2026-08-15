/* 恐怖黎明套装助手 v3 — 含职业筛选 */
const LS_BUILDS = 'gd_set_builds_v1';
const LS_COMPARE = 'gd_set_compare_v1';
const LS_SHRINES = 'gd_shrine_progress_v1';

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
  classSub: 'builds',
  selectedBuildId: null,
  shrineDone: {},
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

function getSetVariants(setOrId) {
  const s = typeof setOrId === 'string' ? getSet(setOrId) : setOrId;
  if (!s) return null;
  if (s.variantAll && s.variantAll.length) return s;
  const map = window.GD_DATA_SET_VARIANTS && window.GD_DATA_SET_VARIANTS.map;
  const v = map && map[s.id];
  if (!v) {
    const myth = !!(s.mythical || (s.members || []).every((m) => m && (m.mythical || (m.style && m.style.mythical))));
    return Object.assign({}, s, {
      hasVariants: false,
      version: myth ? 'myth' : 'normal',
      versionZh: myth ? '神话' : '普通',
      variantAll: null,
    });
  }
  return Object.assign({}, s, {
    hasVariants: true,
    version: v.version,
    versionZh: v.versionZh,
    variantSiblings: v.siblings,
    variantAll: v.all,
    mythical: v.version === 'myth' || !!s.mythical,
  });
}
function versionBadgeHTML(s) {
  if (!s) return '';
  const vv = getSetVariants(s);
  const v = (vv && vv.version) || 'normal';
  const zh = (vv && vv.versionZh) || (v === 'myth' ? '神话' : '普通');
  const cls = v === 'myth' ? 'myth' : v === 'empowered' ? 'emp' : 'norm';
  return `<span class="badge ver ver-${cls}">${escapeHtml(zh)}</span>`;
}
function variantChipsHTML(s) {
  const vv = getSetVariants(s);
  if (!vv) return '';
  const list = vv.variantAll;
  if (!list || list.length < 2) return `<div class="variant-mini">${versionBadgeHTML(vv)}</div>`;
  return `<div class="variant-mini"><span class="variant-mini-label">版本</span>${list
    .map((x) => {
      const on = x.id === s.id ? 'on' : '';
      return `<button type="button" class="variant-chip ${on} ver-${x.version}" data-variant-set="${escapeHtml(x.id)}">${escapeHtml(x.versionZh)} · Lv${x.level ?? '?'}</button>`;
    })
    .join('')}</div>`;
}
function variantSwitchHTML(s) {
  const vv = getSetVariants(s);
  if (!vv) return '';
  const list = vv.variantAll;
  if (!list || list.length < 2) {
    return `<div class="variant-bar single">当前版本：${versionBadgeHTML(vv)} · 需求等级 Lv ${s.level ?? '?'}</div>`;
  }
  return `<div class="variant-bar">
    <div class="variant-label">⚠ 同名套装有多个版本，属性不同。点下方切换查看：</div>
    <div class="variant-switches">
      ${list
        .map((v) => {
          const on = v.id === s.id ? 'on' : '';
          return `<button type="button" class="variant-btn ${on} ver-${v.version}" data-variant-set="${escapeHtml(v.id)}">${escapeHtml(v.versionZh)} · Lv ${v.level ?? '?'}${v.dlcZh ? ' · ' + escapeHtml(v.dlcZh) : ''}</button>`;
        })
        .join('')}
    </div>
  </div>`;
}
function variantCompareHTML(s) {
  const vv = getSetVariants(s);
  const list = vv && vv.variantAll;
  if (!list || list.length < 2) return '';
  const fulls = list.map((v) => getSetVariants(getSet(v.id))).filter(Boolean);
  if (fulls.length < 2) return '';
  const pieceSet = new Set();
  for (const f of fulls) {
    for (const t of f.bonusTiers || []) pieceSet.add(t.pieces);
    if (f.tierSummary) Object.keys(f.tierSummary).forEach((k) => pieceSet.add(+k));
  }
  const pieces = [...pieceSet].filter(Boolean).sort((a, b) => a - b);
  const head = fulls
    .map((f) => {
      const lab = f.versionZh || (f.mythical ? '神话' : '普通');
      return `<th class="ver-${f.version || ''}">${escapeHtml(lab)}<div class="en">Lv ${f.level ?? '?'} · ${escapeHtml((f.dlc && f.dlc.zh) || '')}</div></th>`;
    })
    .join('');
  const rows = pieces
    .map((pcs) => {
      const cells = fulls
        .map((f) => {
          let lines = [];
          if (f.bonusTiers) {
            const t = f.bonusTiers.find((x) => x.pieces == pcs);
            lines = (t && t.lines) || [];
          } else if (f.tierSummary) {
            lines = f.tierSummary[pcs] || f.tierSummary[String(pcs)] || [];
          }
          return `<td>${lines.length ? lines.map((l) => `<div class="line">${escapeHtml(l)}</div>`).join('') : '<span class="muted">—</span>'}</td>`;
        })
        .join('');
      return `<tr><th>(${pcs}) 件套</th>${cells}</tr>`;
    })
    .join('');
  const maxM = Math.max(...fulls.map((f) => (f.members || []).length));
  let memRows = '';
  for (let i = 0; i < maxM; i++) {
    memRows +=
      `<tr><th>部件 ${i + 1}</th>` +
      fulls
        .map((f) => {
          const m = (f.members || [])[i];
          if (!m) return '<td>—</td>';
          const myth = m.mythical || (m.style && m.style.mythical);
          return `<td><button type="button" class="linkish" data-item-id="${escapeHtml(m.id)}">${escapeHtml(m.nameZh)}</button><div class="en">Lv ${m.level ?? '?'}${myth ? ' · 神话件' : ''}</div></td>`;
        })
        .join('') +
      '</tr>';
  }
  return `<div class="section variant-compare">
    <h4>版本属性对照（避免把普通当神话）</h4>
    <p class="muted tiny">以「野兽召唤者的华服」为例：普通约 Lv70（防御+5%…授予野性狂暴），神话 Lv94（防御+6%…强化召唤物且无同一授予技能）。请逐行对比。</p>
    <div class="table-wrap"><table class="variant-table">
      <thead><tr><th>项目</th>${head}</tr></thead>
      <tbody>
        <tr><th>套装 ID</th>${fulls.map((f) => `<td>${escapeHtml(f.id)} (#${f.numId ?? ''})</td>`).join('')}</tr>
        <tr><th>等级 / DLC</th>${fulls.map((f) => `<td>Lv ${f.level ?? '?'} · ${escapeHtml((f.dlc && f.dlc.zh) || '本体')}</td>`).join('')}</tr>
        ${rows}
        ${memRows}
      </tbody>
    </table></div>
  </div>`;
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
  if (!groups.length) {
    const lines = src.lines || [];
    if (!lines.length) return '';
    return `<div class="section source-section"><h4>获取来源</h4>${lines.map(l=>`<div class="source-item">• ${escapeHtml(l)}</div>`).join('')}</div>`;
  }
  return `<div class="section source-section"><h4>获取来源</h4>${groups.map(g => {
    const items = (g.items||[]).map(it => {
      const sub = it.sub ? ` <span class="src-sub">(${escapeHtml(it.sub)})</span>` : '';
      const link = it.mapUrl
        ? ` <button type="button" class="src-map" data-ext-url="${escapeHtml(it.mapUrl)}" data-ext-title="地图定位 · ${escapeHtml(it.text||'')}">地图</button>`
        : '';
      return `<div class="source-item">• ${escapeHtml(it.text)}${sub}${link}</div>`;
    }).join('');
    const more = g.more ? `<div class="muted tiny">…另有 ${g.more} 条</div>` : '';
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
        ${versionBadgeHTML(full || it)}
        <span class="badge ${rarityClass(it.rarity)}">${escapeHtml(rarityZh(it.rarity))}</span>
        <span class="badge">Lv ${it.level ?? '?'}</span>
        <span class="badge">${it.pieceCount} 件</span>
        <span class="badge dlc">${escapeHtml(it.dlcZh || full?.dlc?.zh || '本体')}</span>
      </div>
    </div>
    ${variantChipsHTML(full || it)}
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
      ${it.numId ? `<button type="button" data-ext-url="https://www.grimtools.com/db/zh/itemsets/${it.numId}" data-ext-title="GrimTools 套装">GrimTools</button>` : ''}
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
    const varBtn = e.target.closest('[data-variant-set]');
    if (varBtn) {
      e.preventDefault();
      e.stopPropagation();
      openDetail(varBtn.dataset.variantSet);
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
  const s0 = getSet(id);
  if (!s0) return;
  const s = getSetVariants(s0);
  const body = $('#drawerBody');
  const tiers = `<div class="section"><h4>本版本套装加成（${escapeHtml(s.versionZh || '')}）</h4>${bonusTiersHTML(s)}</div>`;

  const build = currentBuild();
  const tags = (build?.tags && build.tags[id]) || [];
  const classBest = (s.classBest || [])
    .map((b) => `<span class="score-pill">${escapeHtml(className(b.classId))} ${b.score}</span>`)
    .join('');

  body.innerHTML = `
    <h2>${escapeHtml(s.nameZh)}</h2>
    <div class="en">${escapeHtml(s.nameEn || '')}</div>
    ${variantSwitchHTML(s)}
    <div style="margin:8px 0">${iconsRowHTML((s.members||[]).map(m=>({id:m.id,bitmap:m.bitmap,rarity:m.rarity})), 'md', true)}</div>
    <div class="badges" style="justify-content:flex-start;margin:8px 0">
      ${versionBadgeHTML(s)}
      <span class="badge ${rarityClass(s.members?.[0]?.rarity)}">${escapeHtml(rarityZh(s.members?.[0]?.rarity))}</span>
      <span class="badge">Lv ${s.level ?? '?'}</span>
      <span class="badge">${s.pieceCount} 件</span>
      <span class="badge dlc">${escapeHtml(s.dlc?.zh || '本体')}</span>
    </div>
    <div class="icon-tip">点左侧/部件图标可查看单件完整属性。有多版本时务必先看清「普通/神话」。</div>
    ${classBest ? `<div class="section"><h4>职业相关</h4>${classBest}</div>` : ''}
    ${s.descriptionZh ? `<div class="desc">“${escapeHtml(s.descriptionZh)}”</div>` : ''}
    ${variantCompareHTML(s)}
    ${s.sourceSummary ? `<div class="section"><h4>获取来源（套装汇总）</h4><div class="source-line">📍 ${escapeHtml(s.sourceSummary.label||'')}</div>${(s.sourceSummary.lines||[]).map(l=>`<div class="source-item">• ${escapeHtml(l)}</div>`).join('')}<p class="muted tiny">具体怪物/任务/地图见下方各部件。</p></div>` : ''}
    <div class="card-actions">
      <button type="button" id="dBuild">${build?.setIds?.includes(id) ? '移出配装' : '加入配装'}</button>
      <button type="button" id="dCompare">${state.compare.includes(id) ? '取消对比' : '加入对比'}</button>
      ${s.grimtoolsUrl ? `<button type="button" data-ext-url="${s.grimtoolsUrl}" data-ext-title="打开 GrimTools">打开 GrimTools</button>` : ''}
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
  // drawerBody: item detail + variant switch
  $('#drawerBody').onclick = (e) => {
    const varBtn = e.target.closest('[data-variant-set]');
    if (varBtn) {
      e.preventDefault();
      e.stopPropagation();
      openDetail(varBtn.dataset.variantSet);
      return;
    }
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
/* ---------- build wizard v14 ---------- */
function getBuildGroup(ids = state.classIds) {
  const db = window.GD_BUILD_GUIDES;
  if (!db || !ids?.length) return null;
  const key = [...ids].sort((a,b)=>a-b).join('-');
  return (ids.length === 1 ? db.singles : db.combos)?.find((x) => x.key === key) || null;
}
function getSelectedBuild() {
  const group = getBuildGroup();
  if (!group?.builds?.length) return null;
  return group.builds.find((x) => x.id === state.selectedBuildId) || group.builds[0];
}
function masterySkill(name) {
  for (const m of getGuides()?.masteries || []) {
    const s = (m.skills || []).find((x) => x.nameZh === name);
    if (s) return s;
  }
  return null;
}
function skillPillHTML(name, kind='core') {
  const s = masterySkill(name);
  return `<div class="build-skill ${kind}">${skillIconHTML(s)}<span>${escapeHtml(name)}</span></div>`;
}
function buildLinkHTML(url, label, title) {
  return `<button type="button" class="ghost" data-ext-url="${escapeHtml(url)}" data-ext-title="${escapeHtml(title || label)}">${escapeHtml(label)}</button>`;
}
function renderClassBuildPanels() {
  const group = getBuildGroup();
  const wizard = $('#classBuildWizard');
  const buildBox = $('#classBuilds'), skillBox = $('#classSkills'), devBox = $('#classDevotion');
  if (!group || !wizard || !buildBox || !skillBox || !devBox) return;
  if (!state.selectedBuildId || !group.builds.some(x=>x.id===state.selectedBuildId)) state.selectedBuildId = group.builds[0].id;
  const b = getSelectedBuild();
  const v=b.verification||{level:'concept',label:'算法组合 · 未验证',exact:false};
  wizard.innerHTML = `<div class="wizard-title"><div><span class="step-no">1</span><b>${escapeHtml(group.comboZh)}</b><span class="en"> ${escapeHtml(group.comboEn)}</span></div><span class="badge ${v.exact?'verified-badge':'draft-badge'}">${escapeHtml(v.label)}</span></div>
    <div class="build-choice-row">${group.builds.map((x,i)=>`<button type="button" class="build-choice ${x.id===b.id?'active':''}" data-build-id="${escapeHtml(x.id)}"><b>${i+1}. ${escapeHtml(x.name)}</b><small>${escapeHtml(x.difficulty)} · ${escapeHtml(x.weapon)}</small></button>`).join('')}</div>
    <div class="wizard-current"><span class="step-no">2</span>当前方案：<b>${escapeHtml(b.name)}</b>　<span class="muted">${escapeHtml(b.summary)}</span></div>
    <div class="source-verdict ${v.exact?'ok':'warn'}"><b>${v.exact?'这条可追溯：':'注意：这条不是攻略原样导入。'}</b> ${escapeHtml(v.note||'')}${v.sourceUrl?` <button type="button" class="src-map" data-ext-url="${escapeHtml(v.sourceUrl)}" data-ext-title="流派来源">查看 GrimTools 原配置</button>`:''}</div>`;
  buildBox.innerHTML = `<div class="build-overview-grid">
    <article class="build-block hero"><h3>一句话玩法</h3><p>${escapeHtml(b.summary)}</p><div class="build-tags"><span>${escapeHtml(b.damage)}</span><span>${escapeHtml(b.weapon)}</span><span>${escapeHtml(b.attribute)}</span></div></article>
    <article class="build-block"><h3>战斗按键顺序</h3><ol>${b.loop.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol></article>
    <article class="build-block"><h3>装备只看这些词</h3><div class="build-tags">${b.gearKeywords.map(x=>`<span>${escapeHtml(x)}</span>`).join('')}</div><p class="muted tiny">下面「推荐套装/散件」仍按双职业技能相关度筛；再优先检查这些词是否符合本流派。</p></article>
    <article class="build-block"><h3>新手避坑</h3><ul><li>只选一个主伤害类型，不要看到绿字就换。</li><li>所有抗性先补到 80%，终极难度最好溢出 20～30%。</li><li>降抗技能与星座，通常比多一点面板伤害更重要。</li></ul></article>
  </div>`;
  const sk=b.skills;
  skillBox.innerHTML = `<div class="wizard-banner"><span class="step-no">3</span><b>技能抄作业</b>　主攻点满 → 降抗/光环点到够用 → 生存先 1 点</div>
    <article class="build-block"><h3>优先点满</h3><div class="build-skill-grid">${sk.max.map(x=>skillPillHTML(x,'core')).join('')}</div></article>
    <article class="build-block"><h3>第二优先：降抗 / 增伤 / 光环</h3><div class="build-skill-grid">${sk.support.map(x=>skillPillHTML(x,'support')).join('')}</div></article>
    <article class="build-block"><h3>先点 1 点，后期再补</h3><div class="build-skill-grid">${sk.onePoint.map(x=>skillPillHTML(x,'safe')).join('')}</div></article>
    <article class="build-block"><h3>升级顺序</h3><ol>${sk.order.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol><p class="muted tiny">装备提供 +技能后，可把超过有效上限的点移到生存。不同装备转换伤害时，以装备说明为准。</p></article>`;
  const d=b.devotion;
  devBox.innerHTML = `<div class="wizard-banner"><span class="step-no">4</span><b>${escapeHtml(b.name)} · 星座路线</b>　不是通用星座，已按主伤害和玩法匹配</div>
    <article class="build-block devotion-route"><h3>按顺序点</h3>${d.route.map((x,i)=>`<div class="route-step"><i>${i+1}</i><span>${escapeHtml(x)}</span></div>`).join('')}</article>
    <article class="build-block"><h3>星座技能绑定</h3><p>${escapeHtml(d.bind)}</p><p class="muted tiny">临时星座凑够亲和后可以洗掉岔路口/小星座，但必须保证后续星座仍由其余节点自持。</p></article>
    <article class="build-block"><h3>属性点</h3><p>${escapeHtml(b.attribute)}</p><p class="muted tiny">铁则：先满足毕业装备需求，剩余点再按上面分配；新手默认偏体魄更稳。</p></article>
    <div class="card-actions">${buildLinkHTML('https://www.grimtools.com/calc/','打开星座盘','GrimTools 星座盘')}${buildLinkHTML('https://www.grimtools.com/builds/','看公开流派库','GrimTools Builds')}</div>`;
  renderLevelPlan();
}

function skillPointsAtLevel(level) {
  const lv=Math.max(1,Math.min(100,+level||1));
  if(lv<=50)return (lv-1)*3;
  if(lv<=90)return 147+(lv-50)*2;
  return 227+(lv-90);
}
function skillRuleByName(name){
  const db=window.GD_SKILL_RULES;
  for(const id of state.classIds||[]){const c=db?.classes?.[id];const s=c?.skills?.find(x=>x.nameZh===name);if(s)return {...s,classId:+id,className:c.nameZh};}
  return null;
}
function buildAllocationSequence(b){
  // 来源验证路线：从外部成品 Build 的裸点目标生成，不再由关键词拼技能。
  if(b.exactTargets){
    const seq=[];const db=window.GD_SKILL_RULES;
    const addBar=(id,target)=>{for(let n=1;n<=target;n++)seq.push({kind:'mastery',classId:+id,className:db.classes[id].nameZh,name:'专精条',to:n});};
    const addSkill=(id,name,target)=>{const r=db.classes[id]?.skills?.find(x=>x.nameZh===name);const cap=Math.max(Number(r?.max||0),Number(target||0));for(let n=1;n<=target;n++)seq.push({kind:'skill',classId:+id,className:db.classes[id].nameZh,name,to:n,max:cap});};
    // 先保证乌鸦完整技能链与一只可靠主宠，再逐步补双专精光环/降抗；最后趋近成品248点。
    const early=[['3','召唤乌鸦'],['3','血肉缝合'],['3','风暴之心'],['3','闪电打击'],['6','召唤荆棘兽'],['6','莫格卓根的契约'],['6','橡树皮'],['3','虚弱诅咒'],['3','易伤']];
    const bars={};for(const id of Object.keys(b.exactTargets)){bars[id]=0;}
    const ensure=(id,req)=>{while(bars[id]<req){bars[id]++;seq.push({kind:'mastery',classId:+id,className:db.classes[id].nameZh,name:'专精条',to:bars[id]});}};
    const done=new Set();
    for(const [id,name] of early){const target=b.exactTargets[id]?.skills?.[name];if(!target)continue;const r=db.classes[id].skills.find(x=>x.nameZh===name);ensure(id,Math.min(50,r?.masteryRequired||1));addSkill(id,name,target);done.add(id+'|'+name);}
    for(const id of Object.keys(b.exactTargets))ensure(id,b.exactTargets[id].mastery||50);
    for(const [id,t] of Object.entries(b.exactTargets))for(const [name,target] of Object.entries(t.skills||{}))if(!done.has(id+'|'+name))addSkill(id,name,target);
    return seq;
  }
  const db=window.GD_SKILL_RULES, pts={}, bars={};
  const seq=[]; for(const id of state.classIds){pts[id]={};bars[id]=0;}
  const addBar=(id,target)=>{while((bars[id]||0)<target){bars[id]++;seq.push({kind:'mastery',classId:id,className:db.classes[id].nameZh,name:'专精条',to:bars[id]});}};
  const addSkill=(name,target)=>{const s=skillRuleByName(name);if(!s)return;addBar(s.classId,Math.min(50,s.masteryRequired||1));const cur=pts[s.classId][name]||0;for(let n=cur+1;n<=Math.min(target,s.max||1);n++){pts[s.classId][name]=n;seq.push({kind:'skill',classId:s.classId,className:s.className,name,to:n,max:s.max});}};
  // 先成型主攻，再开第二职业；之后降抗/光环，最后补生存。
  for(const n of b.skills.max||[]) addSkill(n,skillRuleByName(n)?.max||1);
  for(const n of b.skills.support||[]) addSkill(n,skillRuleByName(n)?.max||1);
  for(const n of b.skills.onePoint||[]) addSkill(n,1);
  // 两条专精按流派实际需求补到50，剩余点继续补生存技能裸上限。
  for(const id of state.classIds)addBar(id,50);
  for(const n of b.skills.onePoint||[]) addSkill(n,skillRuleByName(n)?.max||1);
  return seq;
}
function renderLevelPlan(){
  const box=$('#classLevelPlan'),b=getSelectedBuild();if(!box||!b)return;
  const verified=!!b.verification?.exact;
  if(!verified){box.innerHTML=`<div class="source-verdict warn"><b>已停止生成“精确加点”。</b> 这条路线目前只是算法组合，没有绑定外部 GrimTools/论坛成品 Build。继续显示逐点数字会误导你。请改选带“来源验证”标记的路线。</div>`;return;}
  const lv=Math.max(1,Math.min(100,+($('#buildCurrentLevel')?.value||1))),quest=Math.max(0,Math.min(13,+($('#buildQuestPoints')?.value||0)));
  const levelPts=skillPointsAtLevel(lv),budget=levelPts+quest,seq=buildAllocationSequence(b),used=seq.slice(0,budget),next=seq.slice(budget,budget+10);
  const grouped={};for(const id of state.classIds)grouped[id]={bar:0,skills:{}};
  for(const a of used){if(a.kind==='mastery')grouped[a.classId].bar=a.to;else grouped[a.classId].skills[a.name]=a.to;}
  const classHtml=state.classIds.map(id=>{const c=window.GD_SKILL_RULES?.classes?.[id],g=grouped[id];return `<article class="level-class-card"><h3>${escapeHtml(c?.nameZh||className(id))}</h3><div class="mastery-target">专精条 <b>${g.bar}/50</b></div>${Object.entries(g.skills).sort((a,b)=>a[0].localeCompare(b[0],'zh')).map(([n,v])=>{const r=skillRuleByName(n);return `<div class="level-skill-row"><span>${skillIconHTML(masterySkill(n))}${escapeHtml(n)}</span><b>${v}/${r?.max||v}</b></div>`}).join('')||'<p class="muted tiny">当前等级还没开始投这一系。</p>'}</article>`}).join('');
  const nextHtml=next.length?next.map((a,i)=>`<div class="next-point ${i===0?'now':''}"><i>${budget+i+1}</i><span>${i===0?'下一点：':'然后：'}<b>${escapeHtml(a.className)}</b> → ${escapeHtml(a.name)} ${a.kind==='mastery'?a.to+'/50':a.to+'/'+a.max}</span></div>`).join(''):'<div class="next-point now"><span>本流派核心目标已经完成，余点按抗性/生存短板补充。</span></div>';
  const shortage=Math.max(0,budget-seq.length);
  box.innerHTML=`<div class="level-budget"><b>Lv${lv}</b><span>升级点 ${levelPts}</span><span>任务点 ${quest}</span><strong>本次按 ${budget} 点计算</strong></div><div class="level-class-grid">${classHtml}</div><article class="build-block next-plan"><h3>从你现在开始，后面10点这样投</h3>${nextHtml}${shortage?`<p class="muted tiny">核心模板用掉 ${seq.length} 点，剩余 ${shortage} 点作为装备适配点；优先修正抗性、生存或装备转换后的技能。</p>`:''}</article><p class="muted tiny">显示的是裸点，不含装备“+技能”。如果你现在的点法不一样，可去灵魂向导洗点后对照；任务点不确定时，看游戏技能页剩余点，或先填0获得保守方案。</p>`;
}

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
    const b = e.target.closest('[data-build-id]');
    if (b) {
      state.selectedBuildId = b.dataset.buildId;
      renderClassBuildPanels();
      return;
    }
    const cbtn = e.target.closest('[data-cid]');
    if (!cbtn) return;
    const id = +cbtn.dataset.cid;
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

  const wizard = $('#classBuildWizard');
  if (wizard) wizard.onclick = (e) => {
    const b = e.target.closest('[data-build-id]');
    if (!b) return;
    state.selectedBuildId = b.dataset.buildId;
    renderClassBuildPanels();
  };

  const lvlBtn=$('#btnBuildLevelPlan'); if(lvlBtn) lvlBtn.onclick=renderLevelPlan;
  ['buildCurrentLevel','buildQuestPoints'].forEach(id=>$(`#${id}`)?.addEventListener('change',renderLevelPlan));

  // 只绑职业结果区的 subtab，避免抢 NPC/制作/加点/任务 的子页签
  $$('#classResult > .subtabs .subtab, #tab-class .subtabs .subtab[data-sub]').forEach((t) => {
    t.onclick = () => {
      if (!t.dataset.sub) return;
      state.classSub = t.dataset.sub;
      $$('#tab-class .subtabs .subtab[data-sub]').forEach((x) => x.classList.toggle('active', x === t));
      $$('#classResult .subpanel').forEach((p) => p.classList.remove('active'));
      const map = { builds: '#classBuilds', skills: '#classSkills', devotion: '#classDevotion', sets: '#classSets', loose: '#classLoose', slots: '#classSlots' };
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

  // 流派、技能、星座先与职业组合联动
  renderClassBuildPanels();

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


/* ---- v10 external links + directory tabs ---- */
state.npcSub = 'npcs';
state.craftSub = 'blueprints';
state.guideSub = 'points';

function getDirectory() {
  return window.GD_DATA_DIRECTORY || null;
}

function isExtModalOpen() {
  const modal = $('#extLinkModal');
  return !!(modal && !modal.classList.contains('hidden'));
}

function openExternalLink(url, title) {
  if (!url) return;
  state._extUrl = String(url);
  const modal = $('#extLinkModal');
  const urlEl = $('#extLinkUrl');
  const input = $('#extLinkInput');
  const status = $('#extLinkStatus');
  const titleEl = $('#extLinkTitle');
  if (titleEl) titleEl.textContent = title || '打开外部链接';
  if (urlEl) urlEl.textContent = state._extUrl;
  if (input) {
    input.value = state._extUrl;
    // delay select so mobile keyboard/layout settles
    setTimeout(() => {
      try {
        input.focus();
        input.setSelectionRange(0, input.value.length);
      } catch (_) {}
    }, 50);
  }
  if (status) {
    status.textContent = '链接已就绪：优先点「复制链接」，再到 Safari 打开。';
  }
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ext-modal-open');
  }
}

function closeExtModal(e) {
  if (e) {
    e.preventDefault?.();
    e.stopPropagation?.();
  }
  const modal = $('#extLinkModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('ext-modal-open');
  const status = $('#extLinkStatus');
  if (status) status.textContent = '';
}

async function tryOpenExternal(url) {
  const status = $('#extLinkStatus');
  const u = url || state._extUrl;
  if (!u) return;
  // Minis 内嵌 WebView 多数拦 window.open；仍尽量试，失败就引导复制
  let opened = false;
  let note = '';
  try {
    const w = window.open(u, '_blank', 'noopener,noreferrer');
    if (w) {
      opened = true;
      note = '已请求系统打开新页。';
    }
  } catch (_) {}
  if (!opened) {
    try {
      // 显式用户手势下的 <a target=_blank>
      const a = document.createElement('a');
      a.href = u;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.style.position = 'fixed';
      a.style.left = '-9999px';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 0);
      opened = true;
      note = '已触发打开。若页面没变，请用「复制链接」。';
    } catch (_) {}
  }
  if (status) {
    status.textContent = opened
      ? note + ' 若仍停在本页，点「复制链接」去 Safari。'
      : '当前环境无法直接外跳（常见于 App 内嵌页）。请点「复制链接」→ Safari 粘贴。同步到 GitHub 用手机 Safari 打开在线版后，「尝试打开」会正常得多。';
  }
}

async function copyExternal(url) {
  const u = url || state._extUrl || '';
  const status = $('#extLinkStatus');
  const input = $('#extLinkInput');
  if (!u) {
    if (status) status.textContent = '没有可复制的链接。';
    return;
  }
  let ok = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(u);
      ok = true;
    } catch (_) {}
  }
  if (!ok && input) {
    try {
      input.focus();
      input.select();
      input.setSelectionRange(0, input.value.length);
      ok = document.execCommand('copy');
    } catch (_) {}
  }
  if (!ok) {
    try {
      const ta = document.createElement('textarea');
      ta.value = u;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch (_) {}
  }
  if (status) {
    status.textContent = ok
      ? '✅ 已复制。打开 Safari → 地址栏粘贴 → 前往。然后点「关闭」回到助手。'
      : '自动复制失败：请长按上方链接框手动全选复制。';
  }
}

function bindExternalClicks() {
  // 只绑一次
  if (state._extBound) return;
  state._extBound = true;

  // 捕获阶段：地图/GrimTools 触发弹层；弹层内部按钮不拦截
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target;
      if (!t || !t.closest) return;

      // 弹层内的操作
      if (t.closest('#extLinkModal')) {
        if (t.closest('[data-ext-close]')) {
          closeExtModal(e);
          return;
        }
        if (t.closest('#extBtnCopy')) {
          e.preventDefault();
          e.stopPropagation();
          copyExternal(state._extUrl);
          return;
        }
        if (t.closest('#extBtnOpen')) {
          e.preventDefault();
          e.stopPropagation();
          tryOpenExternal(state._extUrl);
          return;
        }
        // 点遮罩关闭
        if (t.classList && t.classList.contains('ext-modal-backdrop')) {
          closeExtModal(e);
          return;
        }
        return; // 弹层其它区域不冒泡处理
      }

      const btn = t.closest('[data-ext-url]');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        openExternalLink(btn.getAttribute('data-ext-url'), btn.getAttribute('data-ext-title') || btn.textContent.trim());
        return;
      }
      const a = t.closest('a[href^="http"]');
      if (a && (a.href.includes('grimtools.com') || a.target === '_blank')) {
        e.preventDefault();
        e.stopPropagation();
        openExternalLink(a.href, (a.textContent || '').trim() || '外部链接');
      }
    },
    true
  );

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isExtModalOpen()) closeExtModal(e);
  });
}

function itemChipRow(items, limit = 12) {
  const list = (items || []).slice(0, limit);
  if (!list.length) return '<div class="muted tiny">暂无关联物品</div>';
  const more = (items || []).length > limit ? `<div class="muted tiny">…共 ${items.length} 件</div>` : '';
  return `<div class="dir-item-list">${list
    .map(
      (it) => `<button type="button" class="dir-item" data-item-id="${escapeHtml(it.id)}">
      <span class="dir-item-name">${escapeHtml(it.nameZh || it.id)}</span>
      <span class="dir-item-meta">${escapeHtml([it.slot, it.level != null ? 'Lv'+it.level : '', rarityZh(it.rarity)].filter(Boolean).join(' · '))}</span>
    </button>`
    )
    .join('')}${more}</div>`;
}

function mapBtn(url, title) {
  if (!url) return '';
  return `<button type="button" class="src-map" data-ext-url="${escapeHtml(url)}" data-ext-title="${escapeHtml(title || '地图定位')}">地图定位</button>`;
}

function npcPortraitByName(name){
  const q=String(name||'').toLowerCase();const items=window.GD_NPC_PORTRAITS?.items||[];
  return items.find(x=>q.includes(String(x.nameZh||'').toLowerCase())||q.includes(String(x.nameEn||'').toLowerCase())||String(x.nameZh||'').includes(name))||null;
}
function npcPortraitHTML(name){
 const p=npcPortraitByName(name);if(p)return `<button type="button" class="npc-photo-wrap" data-ext-url="${escapeHtml(p.wikiUrl)}" data-ext-title="${escapeHtml(p.nameZh)} · 官方 Wiki"><img class="npc-photo" src="${escapeHtml(p.image)}" alt="${escapeHtml(p.nameZh)} 游戏形象" loading="lazy"></button>`;
 return `<div class="npc-avatar no-photo" title="暂无可验证人物图">${escapeHtml((name||'?').slice(0,1))}<small>暂无图</small></div>`;
}

function renderNpcTab() {
  const dir = getDirectory();
  const box = $('#npcList');
  const empty = $('#npcEmpty');
  const hint = $('#npcCountHint');
  if (!dir || !box) {
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = '目录数据未加载（directory.js）。';
    }
    return;
  }
  const q = ($('#npcQuery')?.value || '').trim().toLowerCase();
  const sub = state.npcSub || 'npcs';
  if(sub==='portraits'){
    let ps=window.GD_NPC_PORTRAITS?.items||[];if(q)ps=ps.filter(x=>(`${x.nameZh} ${x.nameEn}`).toLowerCase().includes(q));
    if(hint)hint.textContent=`官方 Wiki 可验证人物图 ${ps.length}/${window.GD_NPC_PORTRAITS?.count||0} · 没有图的 NPC 不伪造`;
    box.innerHTML=`<div class="face-note">这里是<strong>真实游戏人物图</strong>，来源为 Grim Dawn Official Wiki。当前收录 ${window.GD_NPC_PORTRAITS?.count||0} 位；装备来源目录里的部分商人没有 Wiki 肖像，因此仍会标“暂无图”。</div><div class="npc-gallery">${ps.map(p=>`<article class="npc-gallery-card"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.nameZh)}"><h3>${escapeHtml(p.nameZh)}</h3><div class="en">${escapeHtml(p.nameEn)}</div><button type="button" class="src-map" data-ext-url="${escapeHtml(p.wikiUrl)}" data-ext-title="${escapeHtml(p.nameZh)} · 官方 Wiki">查看资料</button></article>`).join('')}</div>`;
    if(empty)empty.style.display=ps.length?'none':'block';return;
  }
  let rows = [];
  if (sub === 'npcs') rows = dir.npcs || [];
  else if (sub === 'monsters') rows = dir.monsters || [];
  else if (sub === 'factions') rows = dir.factions || [];
  else if (sub === 'containers') rows = dir.containers || [];

  if (q) {
    rows = rows.filter((r) => {
      const blob = [
        r.name,
        ...(r.locations || []),
        r.sub || '',
        r.roleZh || '',
        ...((r.sells || r.drops || r.items || []).map((x) => x.nameZh || '')),
      ]
        .join(' ')
        .toLowerCase();
      return q.split(/\s+/).every((t) => blob.includes(t));
    });
  }

  if (hint) {
    const c = dir.counts || {};
    hint.textContent = `商人NPC ${c.npcs || 0} · 专属怪 ${c.monsters || 0} · 势力 ${c.factions || 0} · 容器 ${c.containers || 0} · 本页 ${rows.length} 条`;
  }

  if (!rows.length) {
    box.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = q ? '没有匹配结果，换个城镇或名字试试。' : '暂无数据。';
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  box.innerHTML = rows
    .map((r) => {
      if (sub === 'npcs') {
        return `<article class="dir-card">
          <div class="card-top">
            ${npcPortraitHTML(r.name)}
            <div style="flex:1;min-width:0">
              <h3>${escapeHtml(r.name)}</h3>
              <div class="en">${escapeHtml(r.roleZh || '商人')} · 在售 ${r.sellCount || 0}</div>
            </div>
            <div class="badges"><span class="badge dlc">${escapeHtml(r.type || '')}</span></div>
          </div>
          <div class="meta-line">📍 位置：${escapeHtml((r.locations || []).join('、') || '未标注')}</div>
          <div class="reason-list">${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
          <div class="card-actions">
            ${mapBtn(r.mapUrl, r.name + ' 地图')}
            ${(r.mapUrls || []).slice(1, 3).map((u, i) => mapBtn(u, r.name + ' 地点' + (i + 2))).join('')}
          </div>
          <div class="section"><h4>出售 / 相关物品</h4>${itemChipRow(r.sells, 16)}</div>
        </article>`;
      }
      if (sub === 'monsters') {
        return `<article class="dir-card">
          <div class="card-top">
            <div class="mon-avatar" title="无立绘：用首字+掉落识别">${escapeHtml((r.name||'?').slice(0,1))}</div>
            <div style="flex:1;min-width:0">
              <h3>${escapeHtml(r.name)}</h3>
              <div class="en">${escapeHtml(r.sub || r.roleZh || '')} · 掉落 ${r.dropCount || 0}</div>
            </div>
            <div class="badges"><span class="badge">MI</span></div>
          </div>
          <div class="reason-list">${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
          <div class="card-actions">${mapBtn(r.mapUrl, r.name)}</div>
          <div class="section"><h4>掉落</h4>${itemChipRow(r.drops, 16)}</div>
        </article>`;
      }
      if (sub === 'factions') {
        return `<article class="dir-card">
          <div class="card-top">
            <div>
              <h3>${escapeHtml(r.name)}</h3>
              <div class="en">${escapeHtml(r.sub || '势力')} · 关联 ${r.itemCount || 0}</div>
            </div>
            <div class="badges"><span class="badge dlc">声望</span></div>
          </div>
          <div class="reason-list">${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
          <div class="section"><h4>声望相关物品</h4>${itemChipRow(r.items, 16)}</div>
        </article>`;
      }
      // containers
      return `<article class="dir-card">
        <div class="card-top">
          <div>
            <h3>${escapeHtml(r.name)}</h3>
            <div class="en">${escapeHtml(r.roleZh || '容器')} · ${r.itemCount || 0} 件关联</div>
          </div>
        </div>
        <div class="reason-list">${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
        <div class="card-actions">${mapBtn(r.mapUrl, r.name)}</div>
        <div class="section"><h4>可能产出</h4>${itemChipRow(r.items, 16)}</div>
      </article>`;
    })
    .join('');

  box.onclick = (e) => {
    const item = e.target.closest('[data-item-id]');
    if (item) openItemDetail(item.dataset.itemId);
  };
}

function renderCraftTab() {
  const dir = getDirectory();
  const box = $('#craftList');
  const empty = $('#craftEmpty');
  if (!dir || !box) {
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = '目录数据未加载。';
    }
    return;
  }
  const q = ($('#craftQuery')?.value || '').trim().toLowerCase();
  const sub = state.craftSub || 'blueprints';
  const guide = dir.craftGuide || {};

  if (sub === 'guide') {
    if (empty) empty.style.display = 'none';
    box.innerHTML = `<article class="dir-card">
      <h3>${escapeHtml(guide.title || '铁匠与制作')}</h3>
      <p>${escapeHtml(guide.summary || '')}</p>
      <div class="section"><h4>铁匠流程</h4><ol class="quest-steps">${(guide.blacksmith || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ol></div>
      <div class="section"><h4>使用提示</h4><ul>${(guide.tips || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>
    </article>`;
    return;
  }

  if (sub === 'materials' || sub === 'potions') {
    // prefer visual gallery from guides.js
    const G = getGuides();
    if (G && G.materials && G.materials.items) {
      const want = sub === 'materials' ? ['material','component','relic','enchant','blueprint'] : ['potion'];
      let items = G.materials.items.filter(it => want.includes(it.category));
      if (q) items = items.filter(it => (`${it.nameZh} ${it.descZh||''}`).toLowerCase().includes(q));
      if (empty) empty.style.display = 'none';
      const tip = sub==='materials'
        ? '可认图材料/组件/圣物（itemdb 精灵）。点图标可看详情（若有）。'
        : '可认图药剂图标。效果以游戏内为准。';
      box.innerHTML = `<div class="face-note">${tip} 共 ${items.length} 条。更系统的加点说明见「加点」页。</div>` +
        (items.length? `<div class="mat-grid">${items.slice(0,240).map(it => `
          <div class="mat-card" ${String(it.id||'').startsWith('it')?`data-item-id="${escapeHtml(it.id)}"`:''}>
            ${it.hasIcon? iconHTML(it.bitmap, 'Common', 'lg', String(it.id||'').startsWith('it')?it.id:null): '<div class="gd-icon md"></div>'}
            <div class="mat-name">${escapeHtml(it.nameZh)}</div>
            <div class="mat-cat">${escapeHtml(it.category)}</div>
          </div>`).join('')}</div>` : '<div class="empty">无匹配</div>');
      box.onclick = (e)=>{ const el=e.target.closest('[data-item-id]'); if(el) openItemDetail(el.dataset.itemId); };
      return;
    }
    const list = (sub === 'materials' ? guide.materials : guide.potions) || [];
    let rows = list;
    if (q) rows = list.filter((x) => JSON.stringify(x).toLowerCase().includes(q));
    if (!rows.length) {
      box.innerHTML = '';
      if (empty) {
        empty.style.display = 'block';
        empty.textContent =
          sub === 'materials'
            ? '材料说明库无匹配。完整材料数值表不在当前装备快照中，可先看设计图成品。'
            : '药剂说明库无匹配。';
      }
      return;
    }
    if (empty) empty.style.display = 'none';
    box.innerHTML =
      `<div class="quest-limit"><b>${sub === 'materials' ? '材料' : '药剂'}说明库</b>：这是游戏基础用途说明，不是完整 itemdb 消耗品表。设计图所需精确材料请以游戏内 tooltip / GrimTools 为准。</div>` +
      rows
        .map(
          (x) => `<article class="dir-card">
        <h3>${escapeHtml(x.name)}</h3>
        <div class="meta-line">作用：${escapeHtml(x.role || '')}</div>
        <div class="section"><h4>用来干什么</h4><ul>${(x.uses || []).map((u) => `<li>${escapeHtml(u)}</li>`).join('')}</ul></div>
        <div class="section"><h4>怎么搞到</h4><p>${escapeHtml(x.how || '')}</p></div>
      </article>`
        )
        .join('');
    return;
  }

  // blueprints
  let rows = dir.blueprints || [];
  if (q) {
    rows = rows.filter((r) => {
      const blob = [r.name, r.nameShort, ...(r.products || []).map((p) => p.nameZh || '')].join(' ').toLowerCase();
      return q.split(/\s+/).every((t) => blob.includes(t));
    });
  }
  rows = rows.slice(0, 80);
  if (!rows.length) {
    box.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.textContent = '没有匹配的设计图。试试成品装备名。';
    }
    return;
  }
  if (empty) empty.style.display = 'none';
  box.innerHTML =
    `<div class="muted tiny" style="margin:0 0 8px">显示前 ${rows.length} 条（库内共 ${(dir.blueprints || []).length} 张设计图）</div>` +
    rows
      .map(
        (b) => `<article class="dir-card">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(b.name)}</h3>
          <div class="en">${escapeHtml(b.sub || '设计图')} · 成品 ${b.productCount || 0}</div>
        </div>
        <div class="badges"><span class="badge">配方</span></div>
      </div>
      <div class="meta-line">制作位置：${escapeHtml(b.craftWhere || '铁匠/制作栏')}</div>
      <div class="reason-list">${(b.howTo || []).map(escapeHtml).join(' · ')}</div>
      <div class="section"><h4>可制成</h4>${itemChipRow(b.products, 8)}</div>
    </article>`
      )
      .join('');

  box.onclick = (e) => {
    const item = e.target.closest('[data-item-id]');
    if (item) openItemDetail(item.dataset.itemId);
  };
}


function getGuides(){ return window.GD_DATA_GUIDES || null; }

function skillIconHTML(sk){
  if(!sk) return '';
  if(sk.hasIcon && sk.iconClass){
    return `<span class="skill-ico skills ${escapeHtml(sk.iconClass)}" title="${escapeHtml(sk.nameZh||'')}"></span>`;
  }
  return `<span class="skill-ico" title="无图标"></span>`;
}

function cleanDesc(s){
  return String(s||'').replace(/\^[a-zA-Z0-9]/g,'').replace(/\s+/g,' ').trim();
}

function renderGuideTab(){
  const g = getGuides();
  const box = $('#guideList');
  const empty = $('#guideEmpty');
  if(!box) return;
  if(!g){
    box.innerHTML='';
    if(empty){ empty.style.display='block'; empty.textContent='guides.js 未加载'; }
    return;
  }
  const sub = state.guideSub || 'points';
  const q = ($('#guideQuery')?.value||'').trim().toLowerCase();
  if(empty) empty.style.display='none';

  if(sub==='points'){
    const pg = g.pointGuide || {};
    const a = pg.attributes||{}, sk=pg.skills||{}, d=pg.devotion||{};
    const bio = pg.rawBio||{};
    box.innerHTML = `<div class="pt-grid">
      <article class="pt-card">
        <h3>总览</h3>
        <p>满级约 <b>${escapeHtml(String(pg.level?.maxLevel??100))}</b>。属性点每级 <b>${escapeHtml(String(a.perLevel??1))}</b>；技能点按等级表递增（前期多、后期少）；星座点上限 <b>${escapeHtml(String(d.maxDevotionPoints??55))}</b>（靠打碎神龛/石碑）。</p>
        <p class="muted tiny">数据来自 Grim Tools itemdb ${escapeHtml(g.gameVersion||'')}</p>
      </article>
      <article class="pt-card">
        <h3>${escapeHtml(a.title||'属性点')}</h3>
        <ul>${(a.howTo||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>
        <div class="section"><h4>基础换算（每点）</h4>
          <div class="meta-line">体魄→力量成长 ${escapeHtml(String(a.baseStats?.strengthPerPoint??'—'))} · 生命 ${escapeHtml(String(a.baseStats?.healthPerPhysique??'—'))}</div>
          <div class="meta-line">灵巧成长 ${escapeHtml(String(a.baseStats?.cunningPerPoint??'—'))} · 精神成长 ${escapeHtml(String(a.baseStats?.spiritPerPoint??'—'))}</div>
          <div class="meta-line">精神→能量 ${escapeHtml(String(a.baseStats?.energyPerSpirit??'—'))}</div>
        </div>
        <div class="reason-list">${(a.tips||[]).map(escapeHtml).join(' · ')}</div>
      </article>
      <article class="pt-card">
        <h3>${escapeHtml(sk.title||'技能点')}</h3>
        <ul>${(sk.howTo||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>
        <p class="muted tiny">${escapeHtml(sk.masteryBar||'')}</p>
        <div class="reason-list">${(sk.tips||[]).map(escapeHtml).join(' · ')}</div>
      </article>
      <article class="pt-card">
        <h3>${escapeHtml(d.title||'星座点')}</h3>
        <ul>${(d.howTo||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>
        <div class="reason-list">${(d.tips||[]).map(escapeHtml).join(' · ')}</div>
        <div class="card-actions" style="margin-top:8px">
          <button type="button" data-ext-url="${escapeHtml(d.grimtools||'https://www.grimtools.com/calc/')}" data-ext-title="GrimTools 星座盘">打开 GrimTools 星座盘</button>
        </div>
      </article>
    </div>`;
    return;
  }

  if(sub==='masteries'){
    let list = g.masteries||[];
    if(q){
      list = list.map(m=>({
        ...m,
        skills:(m.skills||[]).filter(sk => (`${sk.nameZh} ${sk.descZh}`).toLowerCase().includes(q))
      })).filter(m=>m.skills.length || (m.nameZh||'').toLowerCase().includes(q));
    }
    box.innerHTML = list.map(m=>`
      <article class="dir-card">
        <div class="mastery-head">
          <span class="mastery-dot" style="background:${escapeHtml(m.color||'#888')}"></span>
          <div>
            <h3 style="margin:0">${escapeHtml(m.nameZh)}</h3>
            <div class="en">${escapeHtml(m.nameEn||'')} · ${m.skills?.length||0} 个技能节点</div>
          </div>
        </div>
        <div class="muted tiny" style="margin-bottom:6px">点技能名可看简介。完整可点层级/连线请用 GrimTools 计算器。</div>
        ${(m.skills||[]).map(sk=>`
          <div class="skill-row">
            ${skillIconHTML(sk)}
            <div class="sk-body">
              <h4>${escapeHtml(sk.nameZh)}</h4>
              <p>${escapeHtml(cleanDesc(sk.descZh)||'暂无简介')}</p>
            </div>
          </div>`).join('')||'<div class="muted tiny">无匹配技能</div>'}
      </article>`).join('');
    return;
  }

  if(sub==='mats'){
    let items = g.materials?.items||[];
    if(q) items = items.filter(it => (`${it.nameZh} ${it.category} ${it.descZh||''}`).toLowerCase().includes(q));
    const cats = g.materials?.counts||{};
    const head = `<div class="face-note">材料/组件/药剂/圣物图标来自 itemdb 精灵，可直接认图。
      统计：组件 ${cats.component||0} · 材料 ${cats.material||0} · 药剂 ${cats.potion||0} · 圣物 ${cats.relic||0} · 本页 ${items.length}</div>`;
    if(!items.length){ box.innerHTML=head; if(empty){empty.style.display='block'; empty.textContent='无匹配材料';} return; }
    box.innerHTML = head + `<div class="mat-grid">${items.slice(0,240).map(it=>`
      <div class="mat-card" ${it.id && String(it.id).startsWith('it')?`data-item-id="${escapeHtml(it.id)}"`:''}>
        ${it.hasIcon ? iconHTML(it.bitmap, it.category==='relic'?'Relic': it.category==='potion'?'Magical':'Common', 'lg', it.id && String(it.id).startsWith('it')?it.id:null) : '<div class="gd-icon md"></div>'}
        <div class="mat-name">${escapeHtml(it.nameZh)}</div>
        <div class="mat-cat">${escapeHtml({component:'组件',material:'材料',potion:'药剂',relic:'圣物',blueprint:'设计图',enchant:'附魔'}[it.category]||it.category)}${it.level? ' · Lv'+it.level:''}</div>
      </div>`).join('')}</div>`;
    box.onclick = (e)=>{
      const el=e.target.closest('[data-item-id]');
      if(el) openItemDetail(el.dataset.itemId);
    };
    return;
  }

  if(sub==='faces'){
    box.innerHTML = `<div class="face-note">
      <b>关于 NPC / 怪物“样子”：</b>当前 Grim Tools itemdb 精灵包只有<strong>物品与技能图标</strong>，没有 NPC/怪物全身立绘或头像图集。
      所以助手里用：①名称 ②位置/地图 ③出售或掉落列表 来辨认。
      若要像素级立绘，需要再从游戏资源或 Wiki 肖像包单独导入（体积大、版权需注意）。
      <br><br>下面保留 MI 专属怪与商人入口；完整列表仍在「NPC」页。
    </div>
    <article class="dir-card"><h3>专属掉落怪（MI）· ${g.monsters?.mi?.length||0}</h3>
      ${(g.monsters?.mi||[]).slice(0,20).map(m=>`
        <div class="skill-row">
          <div class="mon-avatar">${escapeHtml((m.nameZh||'?').slice(0,1))}</div>
          <div class="sk-body">
            <h4>${escapeHtml(m.nameZh||m.name||'')}</h4>
            <p>${escapeHtml(m.sub||'')} ${(m.drops||[]).slice(0,3).map(d=>d.nameZh).join('、')}</p>
            ${m.mapUrl?`<button type="button" class="src-map" data-ext-url="${escapeHtml(m.mapUrl)}" data-ext-title="地图">地图</button>`:''}
          </div>
        </div>`).join('')}
      <p class="muted tiny">更多请到「NPC」页 → 专属怪</p>
    </article>
    <article class="dir-card"><h3>商人 / NPC · 示意</h3>
      ${(g.npcs?.items||[]).slice(0,15).map(n=>`
        <div class="skill-row">
          <div class="npc-avatar">${escapeHtml((n.nameZh||'?').slice(0,1))}</div>
          <div class="sk-body">
            <h4>${escapeHtml(n.nameZh||'')}</h4>
            <p>${escapeHtml((n.locations||[]).join('、')||'位置见 NPC 页')} · 在售 ${n.sellCount|| (n.sells?.length)||0}</p>
          </div>
        </div>`).join('')}
      <p class="muted tiny">完整商人列表与货物在「NPC」页</p>
    </article>`;
    return;
  }
}

function initGuideUI(){
  if (state._guideBound) return;
  state._guideBound = true;
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#guideSubtabs .subtab');
    if (!b) return;
    $$('#guideSubtabs .subtab').forEach((x) => x.classList.toggle('active', x === b));
    state.guideSub = b.dataset.gsub || 'points';
    renderGuideTab();
  });
  const btn = $('#btnGuideSearch');
  if (btn) btn.onclick = () => renderGuideTab();
  const input = $('#guideQuery');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') renderGuideTab();
    });
    let gt = null;
    input.addEventListener('input', () => {
      clearTimeout(gt);
      gt = setTimeout(renderGuideTab, 150);
    });
  }
}


/* ---------- location finder v14 ---------- */
function loadShrineProgress(){
  try { state.shrineDone = JSON.parse(localStorage.getItem(LS_SHRINES)||'{}') || {}; } catch(e){ state.shrineDone={}; }
}
function saveShrineProgress(){ localStorage.setItem(LS_SHRINES, JSON.stringify(state.shrineDone||{})); }
function allLocationRows(){
  const loc=window.GD_LOCATION_GUIDE||{};
  const dir=window.GD_DATA_DIRECTORY||{};
  const shr=(loc.shrines||[]).map(x=>({...x,category:'shrine'}));
  const npcs=(dir.npcs||[]).map((x,i)=>({id:x.id||`npc-${i}`,category:'npc',nameZh:x.name,nameEn:'',act:null,typeZh:x.roleZh||'NPC/商人',requirement:(x.locations||[]).join('、'),howToFind:(x.howToFind||[]).join('；'),mapUrl:x.mapUrl||(x.mapUrls||[])[0]||'',keywords:`NPC 商人 ${x.name} ${(x.locations||[]).join(' ')} ${(x.sells||[]).map(y=>y.nameZh).join(' ')}`}));
  const mons=(dir.monsters||[]).map((x,i)=>({id:x.id||`mon-${i}`,category:'monster',nameZh:x.name,nameEn:'',act:null,typeZh:'专属怪',requirement:`掉落 ${(x.drops||[]).slice(0,5).map(y=>y.nameZh).join('、')}`,howToFind:(x.howToFind||[]).join('；')||x.sub||'',mapUrl:x.mapUrl||'',keywords:`怪物 专属怪 ${x.name} ${(x.drops||[]).map(y=>y.nameZh).join(' ')}`}));
  const boxes=(dir.containers||[]).map((x,i)=>({id:`box-${i}`,category:'container',nameZh:String(x.name||'容器').replace(/\{\^I\}/g,''),nameEn:'',act:null,typeZh:'宝箱/容器',requirement:`可能掉落 ${(x.items||[]).slice(0,5).map(y=>y.nameZh).join('、')}`,howToFind:(x.howToFind||[]).join('；'),mapUrl:x.mapUrl||'',keywords:`宝箱 容器 ${x.name} ${(x.items||[]).map(y=>y.nameZh).join(' ')}`}));
  return [...shr,...npcs,...mons,...boxes];
}
function renderLocationTab(){
  const box=$('#locationList'), empty=$('#locationEmpty'); if(!box)return;
  const q=($('#locationQuery')?.value||'').trim().toLowerCase();
  const type=$('#locationType')?.value||'all', act=$('#locationAct')?.value||'', status=$('#locationStatus')?.value||'all';
  let rows=allLocationRows().filter(x=>{
    if(type!=='all'&&x.category!==type)return false;
    if(act&&String(x.act||'')!==act)return false;
    const done=!!state.shrineDone[x.id];
    if(status==='done'&&!done)return false; if(status==='todo'&&done)return false;
    if(q){const text=`${x.nameZh} ${x.nameEn||''} ${x.keywords||''} ${x.requirement||''} ${x.howToFind||''}`.toLowerCase(); if(!q.split(/\s+/).every(t=>text.includes(t)))return false;}
    return true;
  });
  rows.sort((a,b)=>(a.act||99)-(b.act||99)||String(a.nameZh).localeCompare(String(b.nameZh),'zh'));
  $('#locationHint').textContent=`找到 ${rows.length} 个地点${type==='shrine'?' · 勾选进度保存在本机':''}`;
  box.innerHTML=rows.slice(0,200).map(x=>{
    const done=!!state.shrineDone[x.id]; const cat={shrine:'神龛',npc:'NPC/商人',monster:'专属怪',container:'宝箱/容器'}[x.category]||x.typeZh;
    return `<article class="location-card ${done?'done':''}">
      <div class="card-top"><div><h3>${x.category==='shrine'?'✦ ':''}${escapeHtml(x.nameZh)}</h3>${x.nameEn?`<div class="en">${escapeHtml(x.nameEn)}</div>`:''}</div><div class="badges"><span class="badge ${x.category==='shrine'?'legend':''}">${escapeHtml(cat)}</span>${x.act?`<span class="badge">第${x.act}章</span>`:''}<span class="badge dlc">${escapeHtml(x.typeZh||'地点')}</span></div></div>
      ${x.requirement?`<div class="location-line"><b>${x.category==='shrine'?'激活方式':'相关内容'}</b><span>${escapeHtml(x.requirement)}</span></div>`:''}
      ${x.howToFind?`<div class="location-line"><b>怎么找</b><span>${escapeHtml(x.howToFind)}</span></div>`:''}
      <div class="card-actions">${x.category==='shrine'?`<button type="button" class="${done?'done-btn':'find-btn'}" data-shrine-toggle="${escapeHtml(x.id)}">${done?'✓ 已找到':'标记已找到'}</button>`:''}${x.mapUrl?`<button type="button" data-ext-url="${escapeHtml(x.mapUrl)}" data-ext-title="地图 · ${escapeHtml(x.nameZh)}">打开地图</button>`:''}</div>
    </article>`;
  }).join('');
  empty.style.display=rows.length?'none':'block'; empty.textContent='没有匹配地点，试试只输入地点名或切换类型。';
}
function initLocationUI(){
  loadShrineProgress();
  $('#btnLocationSearch')&&($('#btnLocationSearch').onclick=renderLocationTab);
  $('#locationQuery')?.addEventListener('keydown',e=>{if(e.key==='Enter')renderLocationTab()});
  let t=null; $('#locationQuery')?.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(renderLocationTab,120)});
  ['locationType','locationAct','locationStatus'].forEach(id=>$(`#${id}`)?.addEventListener('change',renderLocationTab));
  $('#locationList')?.addEventListener('click',e=>{const b=e.target.closest('[data-shrine-toggle]');if(!b)return; const id=b.dataset.shrineToggle; state.shrineDone[id]=!state.shrineDone[id]; if(!state.shrineDone[id])delete state.shrineDone[id];saveShrineProgress();renderLocationTab();});
}

function initDirectoryUI() {
  $$('#npcSubtabs .subtab').forEach((b) => {
    b.onclick = () => {
      $$('#npcSubtabs .subtab').forEach((x) => x.classList.toggle('active', x === b));
      state.npcSub = b.dataset.nsub;
      renderNpcTab();
    };
  });
  $$('#craftSubtabs .subtab').forEach((b) => {
    b.onclick = () => {
      $$('#craftSubtabs .subtab').forEach((x) => x.classList.toggle('active', x === b));
      state.craftSub = b.dataset.csub;
      renderCraftTab();
    };
  });
  $('#btnNpcSearch') && ($('#btnNpcSearch').onclick = renderNpcTab);
  $('#npcQuery')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') renderNpcTab();
  });
  let nt = null;
  $('#npcQuery')?.addEventListener('input', () => {
    clearTimeout(nt);
    nt = setTimeout(renderNpcTab, 150);
  });
  $('#btnCraftSearch') && ($('#btnCraftSearch').onclick = renderCraftTab);
  $('#craftQuery')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') renderCraftTab();
  });
  let ct = null;
  $('#craftQuery')?.addEventListener('input', () => {
    clearTimeout(ct);
    ct = setTimeout(renderCraftTab, 150);
  });

  // 外链弹层改由 bindExternalClicks 事件委托，避免 DOM 顺序/重复绑定问题
  bindExternalClicks();
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
      if (tab.dataset.tab === 'location') renderLocationTab();
      if (tab.dataset.tab === 'quest') renderQuest();
      if (tab.dataset.tab === 'npc') renderNpcTab();
      if (tab.dataset.tab === 'craft') renderCraftTab();
      if (tab.dataset.tab === 'guide') { if(!state.guideSub) state.guideSub='points'; renderGuideTab(); }
    };
  });

  if ($('#btnQuestSearch')) {
    $('#btnQuestSearch').onclick = renderQuest;
    $('#questQ')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') renderQuest();
    });
    $('#btnQuestOrganize').onclick = organizeQuests;
    $('#questImageInput')?.addEventListener('change',previewQuestImages);
    $('#btnQuestOCR')&&($('#btnQuestOCR').onclick=recognizeQuestImages);
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
async function recognizeQuestImages(){
  const input=$('#questImageInput'),status=$('#questOCRStatus'),ta=$('#questMessyInput');
  const files=[...(input?.files||[])];if(!files.length){status.textContent='请先选择一张或多张任务日志截图。';return;}
  if(!window.Tesseract){status.textContent='OCR 引擎没有加载，请刷新页面后重试。';return;}
  const btn=$('#btnQuestOCR');btn.disabled=true;let texts=[];
  try{
    const worker=await Tesseract.createWorker('chi_sim',1,{workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/worker.min.js',langPath:'https://tessdata.projectnaptha.com/4.0.0',corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@7/tesseract-core-lstm.wasm.js',logger:m=>{if(m.status==='recognizing text')status.textContent=`正在识别 ${Math.round((m.progress||0)*100)}%…`;else status.textContent=`正在准备 OCR：${m.status||''}`;}});
    for(let i=0;i<files.length;i++){status.textContent=`正在识别第 ${i+1}/${files.length} 张…`;const r=await worker.recognize(files[i]);texts.push(r.data.text||'');}
    await worker.terminate();
    const lib=window.GD_QUEST_LIBRARY?.entries||[], allNames=lib.map(x=>x.nameZh).filter(Boolean);
    const raw=texts.join('\n').replace(/[\t\r]+/g,'\n');const found=[];
    // 先用任务库名称直接反查 OCR 全文，避免界面杂字混入任务列表。
    const compact=raw.replace(/\s+/g,'');for(const n of allNames)if(compact.includes(n.replace(/\s+/g,'')))found.push(n);
    const lines=raw.split('\n').map(x=>x.replace(/[|丨【】\[\]<>]/g,' ').replace(/\s+/g,' ').trim()).filter(x=>x.length>=2&&x.length<=35);
    const uniq=[...new Set(found.length?found:lines.filter(x=>/[ - ]/.test('')||/[\u4e00-\u9fff]{2,}/.test(x)).slice(0,40))];
    ta.value=uniq.join('\n');status.textContent=`识别完成：提取 ${uniq.length} 条候选任务，已自动梳理。`;
    organizeQuests();
  }catch(e){status.textContent='识别失败：'+(e.message||e);console.error(e);}finally{btn.disabled=false;}
}
function previewQuestImages(){
 const box=$('#questImagePreview'),files=[...($('#questImageInput')?.files||[])];if(!box)return;box.innerHTML='';
 files.forEach(f=>{const img=document.createElement('img');img.src=URL.createObjectURL(f);img.alt=f.name;box.appendChild(img)});
 $('#questOCRStatus').textContent=files.length?`已选择 ${files.length} 张，点“识别截图并梳理”。`:'可一次选择多张；中文 OCR 在本机运行。';
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
    initLocationUI();
    initDirectoryUI();
    initGuideUI();
    bindExternalClicks();
    // 若默认不在加点页，首次点开再渲染；预热标记
    if ($('#tab-guide')?.classList.contains('active')) renderGuideTab();
    renderStatChips();
    renderList();
    renderPlanner();
    renderCompare();
    // warm directory empty states
    if ($('#npcCountHint') && window.GD_DATA_DIRECTORY?.counts) {
      const c = window.GD_DATA_DIRECTORY.counts;
      $('#npcCountHint').textContent = `商人NPC ${c.npcs||0} · 专属怪 ${c.monsters||0} · 势力 ${c.factions||0} · 设计图 ${c.blueprints||0}`;
    }
  } catch (e) {
    $('#metaLine').textContent = '数据加载失败：' + e.message;
    console.error(e);
  }
}

main();
