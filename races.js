// ===== 2026 马拉松赛事查询模块 =====
(async function(){
  const el = id => document.getElementById(id);
  let RACES = window.__RACES_DATA__ || [];
  if(!RACES.length){ el('racesList').innerHTML='<div style="text-align:center;padding:30px;color:var(--text3)">赛事数据加载失败，请刷新重试</div>'; return; }

  const STATUS = {upcoming:'即将开赛', open:'报名中', ended:'已结束', closed:'报名截止', cancelled:'已取消'};
  const STATUS_COLOR = {upcoming:'var(--blue)', open:'var(--green)', ended:'var(--text3)', closed:'var(--yellow)', cancelled:'var(--red)'};
  const CAT_COLOR = {A:'var(--accent)', B:'var(--yellow)', C:'var(--text2)'};
  const FAV_KEY = 'races_fav_2026';
  let favs = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
  const saveFav = () => localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  const isFav = id => favs.includes(id);
  const toggleFav = id => { const i=favs.indexOf(id); i<0?favs.push(id):favs.splice(i,1); saveFav(); };

  const today = new Date(); today.setHours(0,0,0,0);
  const parseDate = s => s ? new Date((s.replace(' ','T')) + (s.length<=10?'T00:00:00':'')) : null;
  const dateStr = r => r.has_specific_date ? (r.date||'').slice(0,10) : (r.date_original||'待定');
  const fmtReg = s => s ? s.slice(0,10).replace(/-/g,'/') : '—';
  const esc = s => String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const countdown = (target, label) => {
    if(!target) return '';
    const d = Math.ceil((parseDate(target) - today)/86400000);
    if(d<=0) return '';
    if(d<=7) return `<span class="rc-cd urgent">${d}天后${label}</span>`;
    if(d<=30) return `<span class="rc-cd soon">${d}天后${label}</span>`;
    return `<span class="rc-cd">${d}天后${label}</span>`;
  };

  // 统计
  const stat = {total:RACES.length, open:0, upcoming:0, a:0, ended:0};
  RACES.forEach(r => { if(r.status==='open')stat.open++; if(r.status==='upcoming')stat.upcoming++; if(r.category==='A')stat.a++; if(r.status==='ended')stat.ended++; });
  el('racesStat').innerHTML = `
    <div class="rstat"><b>${stat.total}</b><small>全年赛事</small></div>
    <div class="rstat"><b style="color:var(--green)">${stat.open}</b><small>报名中</small></div>
    <div class="rstat"><b style="color:var(--blue)">${stat.upcoming}</b><small>即将开赛</small></div>
    <div class="rstat"><b style="color:var(--accent)">${stat.a}</b><small>A类赛事</small></div>
    <div class="rstat"><b id="favCount" style="color:var(--yellow)">${favs.length}</b><small>我的收藏</small></div>
  `;

  // 近期开赛（未来30天内、有具体日期、未结束）
  const soon = RACES.filter(r => r.has_specific_date && r.date && r.status!=='ended' && r.status!=='cancelled')
    .map(r => ({r, d:parseDate(r.date)}))
    .filter(x => x.d && x.d >= today)
    .sort((a,b) => a.d - b.d)
    .slice(0, 10)
    .map(x => x.r);
  el('racesSoon').innerHTML = soon.length ? soon.map(r => raceMiniCard(r)).join('') : '<div style="color:var(--text3);padding:20px;text-align:center">近期暂无开赛赛事</div>';

  // 省份下拉
  const provs = [...new Set(RACES.map(r=>r.province).filter(Boolean))].sort();
  el('filterProv').innerHTML = '<option value="">全部省份</option>' + provs.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');

  let view = 'all'; // all | fav
  let pageSize = 12, shown = 0;

  function applyFilters(){
    let list = view==='fav' ? RACES.filter(r=>isFav(r.id)) : RACES.slice();
    const kw = el('racesSearch').value.trim().toLowerCase();
    const prov = el('filterProv').value;
    const ev = el('filterEvent').value;
    const st = el('filterStatus').value;
    const mo = el('filterMonth').value;
    const sort = el('filterSort').value;
    if(kw) list = list.filter(r => (r.title||'').toLowerCase().includes(kw) || (r.location||'').toLowerCase().includes(kw) || (r.province||'').toLowerCase().includes(kw));
    if(prov) list = list.filter(r => r.province===prov);
    if(ev) list = list.filter(r => (r.events||[]).includes(ev));
    if(st) list = list.filter(r => r.status===st);
    if(mo) list = list.filter(r => (r.date||'').slice(5,7)===mo);
    if(sort==='date_asc') list.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    else if(sort==='date_desc') list.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    else if(sort==='reg_end') list = list.filter(r=>r.registration_end).sort((a,b)=>(a.registration_end||'').localeCompare(b.registration_end||''));
    return list;
  }

  function renderList(reset){
    if(reset){ shown = 0; }
    const list = applyFilters();
    el('racesCount').textContent = `共 ${list.length} 场`;
    const more = el('racesMore');
    if(list.length === 0){
      el('racesList').innerHTML = view==='fav' ? '<div class="modal-empty">还没有收藏的赛事<br><span style="font-size:12px">点击赛事卡片上的 ☆ 收藏</span></div>' : '<div class="modal-empty">没有符合条件的赛事</div>';
      more.style.display='none';
      return;
    }
    const slice = list.slice(0, shown + pageSize);
    el('racesList').innerHTML = slice.map(r => raceCard(r)).join('');
    shown = slice.length;
    more.style.display = shown < list.length ? '' : 'none';
    more.textContent = `加载更多 (还剩 ${list.length - shown} 场)`;
  }

  function raceMiniCard(r){
    const d = dateStr(r);
    const ev = (r.events||[]).join('·');
    const sc = STATUS_COLOR[r.status]||'var(--text3)';
    return `<div class="rmini" onclick="raceDetail(${r.id})">
      <div class="rmini-date">${esc(d)}</div>
      <div class="rmini-title">${esc(r.title)}</div>
      <div class="rmini-meta"><span style="color:${sc}">●${STATUS[r.status]||r.status}</span> · ${esc(r.province||'')} · ${esc(ev)}</div>
    </div>`;
  }

  function raceCard(r){
    const d = dateStr(r);
    const ev = (r.events||[]).join(' / ') || '—';
    const sc = STATUS_COLOR[r.status]||'var(--text3)';
    const cc = CAT_COLOR[r.category]||'var(--text2)';
    const fav = isFav(r.id);
    const regEnd = r.registration_end ? countdown(r.registration_end,'报名截止') : '';
    const raceDay = r.has_specific_date ? countdown(r.date,'开赛') : '';
    const fees = r.registration_fees ? Object.entries(r.registration_fees).map(([k,v])=>`${k}:${v}`).join(' · ') : '—';
    const quota = r.event_quotas ? Object.entries(r.event_quotas).map(([k,v])=>`${k}:${v}`).join(' · ') : '—';
    return `<div class="rcard" onclick="raceDetail(${r.id})">
      <div class="rcard-top">
        <span class="rcard-cat" style="color:${cc}">${r.category||'—'}类</span>
        <span class="rcard-st" style="color:${sc}">● ${STATUS[r.status]||r.status}</span>
        <span class="rcard-fav ${fav?'on':''}" data-fav="${r.id}" onclick="event.stopPropagation();raceToggleFav(${r.id})">${fav?'★':'☆'}</span>
      </div>
      <div class="rcard-title">${esc(r.title)}</div>
      <div class="rcard-row"><span class="rcard-l">📅 比赛日</span><b>${esc(d)}</b></div>
      <div class="rcard-row"><span class="rcard-l">📍 地点</span><b>${esc(r.province||'—')} · ${esc(r.location||'—')}</b></div>
      <div class="rcard-row"><span class="rcard-l">🏃 项目</span><b>${esc(ev)}</b></div>
      <div class="rcard-row"><span class="rcard-l">💰 报名费</span><b style="font-size:11px">${esc(fees)}</b></div>
      <div class="rcard-row"><span class="rcard-l">🎟️ 名额</span><b style="font-size:11px">${esc(quota)}</b></div>
      ${r.is_lottery?'<div class="rcard-lottery">⚡ 需抽签</div>':''}
      <div class="rcard-cds">${regEnd}${raceDay}</div>
    </div>`;
  }

  // 详情弹窗
  window.raceDetail = function(id){
    const r = RACES.find(x => x.id===id);
    if(!r) return;
    const d = dateStr(r);
    const ev = (r.events||[]).join(' / ') || '—';
    const sc = STATUS_COLOR[r.status]||'var(--text3)';
    const cc = CAT_COLOR[r.category]||'var(--text2)';
    const fav = isFav(r.id);
    const fees = r.registration_fees ? Object.entries(r.registration_fees).map(([k,v])=>`<tr><td>${k}</td><td style="color:var(--accent);font-weight:700">${esc(v)}</td></tr>`).join('') : '<tr><td>—</td><td>—</td></tr>';
    const quota = r.event_quotas ? Object.entries(r.event_quotas).map(([k,v])=>`<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join('') : '<tr><td>—</td><td>—</td></tr>';
    const regEnd = r.registration_end ? countdown(r.registration_end,'报名截止') : '';
    const raceDay = r.has_specific_date ? countdown(r.date,'开赛') : '';
    el('raceModalDate').textContent = r.title;
    el('raceModalBody').innerHTML = `
      <div class="modal-sec">
        <div class="modal-data-row">
          <div class="modal-data-item"><div class="dl">比赛日</div><div class="dv accent">${esc(d)}</div></div>
          <div class="modal-data-item"><div class="dl">状态</div><div class="dv" style="color:${sc};font-size:13px">${STATUS[r.status]||r.status}</div></div>
          <div class="modal-data-item"><div class="dl">级别</div><div class="dv" style="color:${cc}">${r.category||'—'}类</div></div>
          <div class="modal-data-item"><div class="dl">项目</div><div class="dv" style="font-size:13px">${esc(ev)}</div></div>
        </div>
      </div>
      <div class="modal-sec">
        <div class="modal-sec-title">📍 赛事地点</div>
        <div class="modal-feel">${esc(r.province||'—')} · ${esc(r.location||'—')} ${r.is_lottery?' · ⚡抽签赛事':''}</div>
      </div>
      ${regEnd||raceDay?`<div class="modal-sec"><div class="modal-sec-title">⏰ 倒计时</div><div class="modal-feel" style="border-left-color:var(--accent)">${regEnd?regEnd+' ':''}${raceDay}</div></div>`:''}
      <div class="modal-sec">
        <div class="modal-sec-title">💰 报名费</div>
        <table class="weight-table"><thead><tr><th>项目</th><th>费用</th></tr></thead><tbody>${fees}</tbody></table>
      </div>
      <div class="modal-sec">
        <div class="modal-sec-title">🎟️ 名额</div>
        <table class="weight-table"><thead><tr><th>项目</th><th>名额</th></tr></thead><tbody>${quota}</tbody></table>
      </div>
      ${r.registration_start||r.registration_end?`<div class="modal-sec"><div class="modal-sec-title">📆 报名时间</div><div class="modal-feel">${fmtReg(r.registration_start)} — ${fmtReg(r.registration_end)}</div></div>`:''}
      <div style="text-align:center;margin-top:8px">
        <button class="search-btn" onclick="raceToggleFav(${r.id});raceDetail(${r.id})" style="padding:9px 22px">${fav?'★ 取消收藏':'☆ 收藏赛事'}</button>
      </div>
    `;
    el('raceModal').classList.add('show');
  };
  window.closeRaceModal = () => el('raceModal').classList.remove('show');
  window.raceToggleFav = function(id){
    toggleFav(id);
    el('favCount').textContent = favs.length;
    if(view==='fav') renderList(false);
    else { // 局部刷新卡片星标
      const star = document.querySelector(`[data-fav="${id}"]`);
      if(star){ const on=isFav(id); star.textContent=on?'★':'☆'; star.classList.toggle('on',on); }
    }
  };

  // 事件绑定
  el('racesSearch').addEventListener('input', () => renderList(true));
  ['filterProv','filterEvent','filterStatus','filterMonth','filterSort'].forEach(id => el(id).addEventListener('change', () => renderList(true)));
  el('racesMore').addEventListener('click', () => renderList(false));
  el('racesViewAll').addEventListener('click', () => { view='all'; el('racesViewAll').classList.add('on'); el('racesViewFav').classList.remove('on'); renderList(true); });
  el('racesViewFav').addEventListener('click', () => { view='fav'; el('racesViewFav').classList.add('on'); el('racesViewAll').classList.remove('on'); renderList(true); });

  renderList(true);
})();
