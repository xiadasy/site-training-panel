#!/usr/bin/env node
/** Patch app.js for external links + NPC/craft tabs (v10) */
const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, '..', 'app.js');
let s = fs.readFileSync(appPath, 'utf8');

if (s.includes('/* ---- v10 external links + directory tabs ---- */')) {
  console.log('already patched');
  process.exit(0);
}

// 1) Replace sourcesBlockHTML map anchors with buttons
const oldSrc = `function sourcesBlockHTML(src, {compact=false}={}) {
  if (!src) return '';
  if (compact) {
    const lines = src.lines || src.sourceLines || [];
    if (!lines.length && src.sourceLabel) return \`<div class="source-line">📍 \${escapeHtml(src.sourceLabel)}</div>\`;
    if (!lines.length) return '';
    return \`<div class="source-line">📍 \${lines.map(escapeHtml).join(' · ')}</div>\`;
  }
  const groups = src.groups || [];
  if (!groups.length) {
    const lines = src.lines || [];
    if (!lines.length) return '';
    return \`<div class="section source-section"><h4>获取来源</h4>\${lines.map(l=>\`<div class="source-item">• \${escapeHtml(l)}</div>\`).join('')}</div>\`;
  }
  return \`<div class="section source-section"><h4>获取来源</h4>\${groups.map(g => {
    const items = (g.items||[]).map(it => {
      const sub = it.sub ? \` <span class="src-sub">(\${escapeHtml(it.sub)})</span>\` : '';
      const link = it.mapUrl ? \` <a class="src-map" href="\${escapeHtml(it.mapUrl)}" target="_blank" rel="noopener">地图</a>\` : '';
      return \`<div class="source-item">• \${escapeHtml(it.text)}\${sub}\${link}</div>\`;
    }).join('');
    const more = g.more ? \`<div class="muted tiny">…另有 \${g.more} 条</div>\` : '';
    return \`<div class="source-group"><div class="source-title">\${escapeHtml(g.titleZh||'')}</div>\${items}\${more}</div>\`;
  }).join('')}</div>\`;
}`;

// Find function sourcesBlockHTML and replace more flexibly
const srcStart = s.indexOf('function sourcesBlockHTML');
if (srcStart < 0) throw new Error('sourcesBlockHTML not found');
const srcEnd = s.indexOf('\nfunction matchLevel', srcStart);
if (srcEnd < 0) throw new Error('matchLevel after sources not found');
const newSrc = `function sourcesBlockHTML(src, {compact=false}={}) {
  if (!src) return '';
  if (compact) {
    const lines = src.lines || src.sourceLines || [];
    if (!lines.length && src.sourceLabel) return \`<div class="source-line">📍 \${escapeHtml(src.sourceLabel)}</div>\`;
    if (!lines.length) return '';
    return \`<div class="source-line">📍 \${lines.map(escapeHtml).join(' · ')}</div>\`;
  }
  const groups = src.groups || [];
  if (!groups.length) {
    const lines = src.lines || [];
    if (!lines.length) return '';
    return \`<div class="section source-section"><h4>获取来源</h4>\${lines.map(l=>\`<div class="source-item">• \${escapeHtml(l)}</div>\`).join('')}</div>\`;
  }
  return \`<div class="section source-section"><h4>获取来源</h4>\${groups.map(g => {
    const items = (g.items||[]).map(it => {
      const sub = it.sub ? \` <span class="src-sub">(\${escapeHtml(it.sub)})</span>\` : '';
      const link = it.mapUrl
        ? \` <button type="button" class="src-map" data-ext-url="\${escapeHtml(it.mapUrl)}" data-ext-title="地图定位 · \${escapeHtml(it.text||'')}">地图</button>\`
        : '';
      return \`<div class="source-item">• \${escapeHtml(it.text)}\${sub}\${link}</div>\`;
    }).join('');
    const more = g.more ? \`<div class="muted tiny">…另有 \${g.more} 条</div>\` : '';
    return \`<div class="source-group"><div class="source-title">\${escapeHtml(g.titleZh||'')}</div>\${items}\${more}</div>\`;
  }).join('')}</div>\`;
}
`;
s = s.slice(0, srcStart) + newSrc + s.slice(srcEnd);

// 2) Replace grimtools anchors in cardHTML and openDetail
s = s.replace(
  /\$\{it\.numId \? `<a href="https:\/\/www\.grimtools\.com\/db\/zh\/itemsets\/\$\{it\.numId\}" target="_blank" rel="noopener"><button type="button">GrimTools<\/button><\/a>` : ''\}/g,
  "${it.numId ? `<button type=\"button\" data-ext-url=\"https://www.grimtools.com/db/zh/itemsets/${it.numId}\" data-ext-title=\"GrimTools 套装\">GrimTools</button>` : ''}"
);

s = s.replace(
  /\$\{s\.grimtoolsUrl \? `<a href="\$\{s\.grimtoolsUrl\}" target="_blank" rel="noopener"><button type="button">打开 GrimTools<\/button><\/a>` : ''\}/g,
  "${s.grimtoolsUrl ? `<button type=\"button\" data-ext-url=\"${s.grimtoolsUrl}\" data-ext-title=\"打开 GrimTools\">打开 GrimTools</button>` : ''}"
);

// quest source links etc - replace target=_blank anchors that are grimtools/external with data-ext later via click handler

// 3) Insert v10 helpers + directory render before bindUI
const bindAt = s.indexOf('function bindUI()');
if (bindAt < 0) throw new Error('bindUI not found');

const v10block = `
/* ---- v10 external links + directory tabs ---- */
state.npcSub = 'npcs';
state.craftSub = 'blueprints';

function getDirectory() {
  return window.GD_DATA_DIRECTORY || null;
}

function openExternalLink(url, title) {
  if (!url) return;
  const modal = $('#extLinkModal');
  const urlEl = $('#extLinkUrl');
  const status = $('#extLinkStatus');
  const titleEl = $('#extLinkTitle');
  if (titleEl) titleEl.textContent = title || '打开外部链接';
  if (urlEl) urlEl.textContent = url;
  if (status) status.textContent = '';
  if (modal) {
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }
  // stash
  state._extUrl = url;
  // try silent open in same webview as fallback path later via button
}

function closeExtModal() {
  const modal = $('#extLinkModal');
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

async function tryOpenExternal(url) {
  const status = $('#extLinkStatus');
  const u = url || state._extUrl;
  if (!u) return;
  let ok = false;
  // 1) location assign in new context via <a> programmatic click without target sometimes works in SFSafari
  try {
    const a = document.createElement('a');
    a.href = u;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    ok = true;
  } catch (e) {}
  // 2) window.open
  if (!ok) {
    try {
      const w = window.open(u, '_blank');
      if (w) ok = true;
    } catch (e) {}
  }
  // 3) top navigation last resort (leaves app page)
  if (!ok) {
    try {
      window.location.href = u;
      ok = true;
    } catch (e) {}
  }
  if (status) {
    status.textContent = ok
      ? '已尝试打开。若无跳转，请点「复制链接」到 Safari 粘贴。'
      : '无法自动打开，请复制链接到系统浏览器。';
  }
}

async function copyExternal(url) {
  const u = url || state._extUrl || '';
  const status = $('#extLinkStatus');
  try {
    await navigator.clipboard.writeText(u);
    if (status) status.textContent = '已复制到剪贴板，去 Safari 粘贴打开即可。';
  } catch {
    // fallback select
    try {
      const el = $('#extLinkUrl');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      if (status) status.textContent = '已复制（兼容模式）。';
    } catch {
      if (status) status.textContent = '复制失败，请长按链接手动复制。';
    }
  }
}

function bindExternalClicks(root = document) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ext-url]');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      openExternalLink(btn.dataset.extUrl, btn.dataset.extTitle || btn.textContent.trim());
      return;
    }
    // convert leftover external anchors
    const a = e.target.closest('a[href^="http"]');
    if (a && (a.href.includes('grimtools.com') || a.target === '_blank')) {
      e.preventDefault();
      e.stopPropagation();
      openExternalLink(a.href, a.textContent.trim() || '外部链接');
    }
  }, true);
}

function itemChipRow(items, limit = 12) {
  const list = (items || []).slice(0, limit);
  if (!list.length) return '<div class="muted tiny">暂无关联物品</div>';
  const more = (items || []).length > limit ? \`<div class="muted tiny">…共 \${items.length} 件</div>\` : '';
  return \`<div class="dir-item-list">\${list
    .map(
      (it) => \`<button type="button" class="dir-item" data-item-id="\${escapeHtml(it.id)}">
      <span class="dir-item-name">\${escapeHtml(it.nameZh || it.id)}</span>
      <span class="dir-item-meta">\${escapeHtml([it.slot, it.level != null ? 'Lv'+it.level : '', rarityZh(it.rarity)].filter(Boolean).join(' · '))}</span>
    </button>\`
    )
    .join('')}\${more}</div>\`;
}

function mapBtn(url, title) {
  if (!url) return '';
  return \`<button type="button" class="src-map" data-ext-url="\${escapeHtml(url)}" data-ext-title="\${escapeHtml(title || '地图定位')}">地图定位</button>\`;
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
      return q.split(/\\s+/).every((t) => blob.includes(t));
    });
  }

  if (hint) {
    const c = dir.counts || {};
    hint.textContent = \`商人NPC \${c.npcs || 0} · 专属怪 \${c.monsters || 0} · 势力 \${c.factions || 0} · 容器 \${c.containers || 0} · 本页 \${rows.length} 条\`;
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
        return \`<article class="dir-card">
          <div class="card-top">
            <div>
              <h3>\${escapeHtml(r.name)}</h3>
              <div class="en">\${escapeHtml(r.roleZh || '商人')} · 在售 \${r.sellCount || 0}</div>
            </div>
            <div class="badges"><span class="badge dlc">\${escapeHtml(r.type || '')}</span></div>
          </div>
          <div class="meta-line">📍 位置：\${escapeHtml((r.locations || []).join('、') || '未标注')}</div>
          <div class="reason-list">\${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
          <div class="card-actions">
            \${mapBtn(r.mapUrl, r.name + ' 地图')}
            \${(r.mapUrls || []).slice(1, 3).map((u, i) => mapBtn(u, r.name + ' 地点' + (i + 2))).join('')}
          </div>
          <div class="section"><h4>出售 / 相关物品</h4>\${itemChipRow(r.sells, 16)}</div>
        </article>\`;
      }
      if (sub === 'monsters') {
        return \`<article class="dir-card">
          <div class="card-top">
            <div>
              <h3>\${escapeHtml(r.name)}</h3>
              <div class="en">\${escapeHtml(r.sub || r.roleZh || '')} · 掉落 \${r.dropCount || 0}</div>
            </div>
            <div class="badges"><span class="badge">MI</span></div>
          </div>
          <div class="reason-list">\${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
          <div class="card-actions">\${mapBtn(r.mapUrl, r.name)}</div>
          <div class="section"><h4>掉落</h4>\${itemChipRow(r.drops, 16)}</div>
        </article>\`;
      }
      if (sub === 'factions') {
        return \`<article class="dir-card">
          <div class="card-top">
            <div>
              <h3>\${escapeHtml(r.name)}</h3>
              <div class="en">\${escapeHtml(r.sub || '势力')} · 关联 \${r.itemCount || 0}</div>
            </div>
            <div class="badges"><span class="badge dlc">声望</span></div>
          </div>
          <div class="reason-list">\${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
          <div class="section"><h4>声望相关物品</h4>\${itemChipRow(r.items, 16)}</div>
        </article>\`;
      }
      // containers
      return \`<article class="dir-card">
        <div class="card-top">
          <div>
            <h3>\${escapeHtml(r.name)}</h3>
            <div class="en">\${escapeHtml(r.roleZh || '容器')} · \${r.itemCount || 0} 件关联</div>
          </div>
        </div>
        <div class="reason-list">\${(r.howToFind || []).map(escapeHtml).join(' · ')}</div>
        <div class="card-actions">\${mapBtn(r.mapUrl, r.name)}</div>
        <div class="section"><h4>可能产出</h4>\${itemChipRow(r.items, 16)}</div>
      </article>\`;
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
    box.innerHTML = \`<article class="dir-card">
      <h3>\${escapeHtml(guide.title || '铁匠与制作')}</h3>
      <p>\${escapeHtml(guide.summary || '')}</p>
      <div class="section"><h4>铁匠流程</h4><ol class="quest-steps">\${(guide.blacksmith || []).map((x) => \`<li>\${escapeHtml(x)}</li>\`).join('')}</ol></div>
      <div class="section"><h4>使用提示</h4><ul>\${(guide.tips || []).map((x) => \`<li>\${escapeHtml(x)}</li>\`).join('')}</ul></div>
    </article>\`;
    return;
  }

  if (sub === 'materials' || sub === 'potions') {
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
      \`<div class="quest-limit"><b>\${sub === 'materials' ? '材料' : '药剂'}说明库</b>：这是游戏基础用途说明，不是完整 itemdb 消耗品表。设计图所需精确材料请以游戏内 tooltip / GrimTools 为准。</div>\` +
      rows
        .map(
          (x) => \`<article class="dir-card">
        <h3>\${escapeHtml(x.name)}</h3>
        <div class="meta-line">作用：\${escapeHtml(x.role || '')}</div>
        <div class="section"><h4>用来干什么</h4><ul>\${(x.uses || []).map((u) => \`<li>\${escapeHtml(u)}</li>\`).join('')}</ul></div>
        <div class="section"><h4>怎么搞到</h4><p>\${escapeHtml(x.how || '')}</p></div>
      </article>\`
        )
        .join('');
    return;
  }

  // blueprints
  let rows = dir.blueprints || [];
  if (q) {
    rows = rows.filter((r) => {
      const blob = [r.name, r.nameShort, ...(r.products || []).map((p) => p.nameZh || '')].join(' ').toLowerCase();
      return q.split(/\\s+/).every((t) => blob.includes(t));
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
    \`<div class="muted tiny" style="margin:0 0 8px">显示前 \${rows.length} 条（库内共 \${(dir.blueprints || []).length} 张设计图）</div>\` +
    rows
      .map(
        (b) => \`<article class="dir-card">
      <div class="card-top">
        <div>
          <h3>\${escapeHtml(b.name)}</h3>
          <div class="en">\${escapeHtml(b.sub || '设计图')} · 成品 \${b.productCount || 0}</div>
        </div>
        <div class="badges"><span class="badge">配方</span></div>
      </div>
      <div class="meta-line">制作位置：\${escapeHtml(b.craftWhere || '铁匠/制作栏')}</div>
      <div class="reason-list">\${(b.howTo || []).map(escapeHtml).join(' · ')}</div>
      <div class="section"><h4>可制成</h4>\${itemChipRow(b.products, 8)}</div>
    </article>\`
      )
      .join('');

  box.onclick = (e) => {
    const item = e.target.closest('[data-item-id]');
    if (item) openItemDetail(item.dataset.itemId);
  };
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

  // ext modal
  $('#extBtnOpen') &&
    ($('#extBtnOpen').onclick = () => tryOpenExternal(state._extUrl));
  $('#extBtnCopy') && ($('#extBtnCopy').onclick = () => copyExternal(state._extUrl));
  $$('[data-ext-close]').forEach((el) => (el.onclick = closeExtModal));
}

`;

s = s.slice(0, bindAt) + v10block + s.slice(bindAt);

// 4) Patch bindUI tab switches
s = s.replace(
  `      if (tab.dataset.tab === 'quest') renderQuest();
    };
  });`,
  `      if (tab.dataset.tab === 'quest') renderQuest();
      if (tab.dataset.tab === 'npc') renderNpcTab();
      if (tab.dataset.tab === 'craft') renderCraftTab();
    };
  });`
);

// 5) Patch main()
s = s.replace(
  `    initClassUI();
    renderStatChips();
    renderList();
    renderPlanner();
    renderCompare();`,
  `    initClassUI();
    initDirectoryUI();
    bindExternalClicks(document);
    renderStatChips();
    renderList();
    renderPlanner();
    renderCompare();
    // warm directory empty states
    if ($('#npcCountHint') && window.GD_DATA_DIRECTORY?.counts) {
      const c = window.GD_DATA_DIRECTORY.counts;
      $('#npcCountHint').textContent = \`商人NPC \${c.npcs||0} · 专属怪 \${c.monsters||0} · 势力 \${c.factions||0} · 设计图 \${c.blueprints||0}\`;
    }`
);

// 6) openDetail/openItemDetail: ensure external handler on drawer too - already document capture

// 7) Fix quest card external links to use data-ext via bindExternalClicks on anchors - already handled

fs.writeFileSync(appPath, s);
console.log('patched app.js bytes', s.length);
// sanity
for (const key of ['openExternalLink', 'renderNpcTab', 'renderCraftTab', 'data-ext-url', 'initDirectoryUI']) {
  if (!s.includes(key)) console.error('MISSING', key);
  else console.log('ok', key);
}
