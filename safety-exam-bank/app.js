const DB = window.QUESTION_BANK;
const KEY = 'safetyExamStateV1';
const DEFAULT_EXAM = '2026-10-24';
const SYNC_API = 'https://safety-exam-sync.a15221082942.workers.dev/api/state';
const DEVICE_ID = (() => {
  const k = 'safetyExamDeviceId';
  let id = localStorage.getItem(k);
  if (!id) {
    id = 'web-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    localStorage.setItem(k, id);
  }
  return id;
})();

function loadState() {
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { S = {}; }
  S.answers = S.answers || {};
  S.wrong = S.wrong || {};
  S.fav = S.fav || {};
  S.notes = S.notes || {};
  S.last = S.last || null;
  S.dark = !!S.dark;
  S.streakGoal = S.streakGoal || 3;
  S.examDate = S.examDate || DEFAULT_EXAM;
  S.qTimes = S.qTimes || {}; // qid -> total seconds spent
  S.syncCode = S.syncCode || '';
  S.syncUpdatedAt = S.syncUpdatedAt || null;
  S.localUpdatedAt = S.localUpdatedAt || null;
  Object.keys(S.wrong).forEach(id => {
    if (typeof S.wrong[id] !== 'object') S.wrong[id] = { streak: 0, attempts: 0, lastWrong: Date.now() };
  });
  return S;
}

let S = loadState();
let session = [], idx = 0, chosen = [], roundAnswers = {};
let qTimerSec = 0, qTimerHandle = null, qTimerStartedAt = 0;
let syncTimer = null, syncing = false;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const all = () => DB.papers.flatMap(p => p.questions.map(q => ({
  ...q,
  paperId: p.id,
  paperTitle: p.title,
  sourcePdf: p.sourcePdf
})));
const save = (opts = {}) => {
  S.localUpdatedAt = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(S));
  updateHome();
  updateCountdown();
  updateSyncUI();
  if (!opts.skipCloud) scheduleCloudPush();
};
const eq = (a, b) => [...a].sort().join() === [...b].sort().join();
const esc = s => String(s || '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));
function highlight(s) {
  return esc(s).replace(
    /(严禁|必须|不得|不应|应当|应|仅|只有|至少|至多|超过|低于|高于|小于|大于|正确|错误|不符合|符合|\d+(?:\.\d+)?\s*(?:mm|cm|m|kPa|MPa|dB|V|kV|℃|kg|s|min|h|%|倍|次|圈)?)/gi,
    '<mark>$1</mark>'
  );
}
function clauses(text) {
  return String(text || '').replace(/\s+/g, '').split(/[；。](?!\d)/).map(x => x.trim()).filter(x => x.length > 5);
}
function grams(s) {
  let x = String(s || '').replace(/[，。；、：:“”‘’（）()\s]/g, '').replace(/下列|说法|关于|属于|进行|设置|装置|要求|应当/g, '');
  let a = new Set;
  for (let i = 0; i < x.length - 1; i++) a.add(x.slice(i, i + 2));
  return a;
}
function score(a, b) {
  let A = grams(a), B = grams(b), n = 0;
  A.forEach(x => { if (B.has(x)) n++; });
  return n;
}
function explainOptions(q) {
  let cs = clauses(q.explanation);
  return Object.entries(q.options).map(([k, opt]) => {
    let ok = q.answer.includes(k), best = -1, bi = -1;
    cs.forEach((c, i) => {
      let n = score(opt, c);
      if (n > best) { best = n; bi = i; }
    });
    let detail = '';
    if (bi >= 0 && best >= 2) detail = cs[bi] + '。';
    else if (ok) detail = '该项与题干要求及原卷给出的规范结论一致。';
    else detail = '该表述不符合规范要求；请结合下方原卷解析记忆正确限定条件。';
    return `<div class="optionExplain ${ok ? 'isRight' : 'isWrong'}"><div class="oeHead"><span>${k}</span><b>${ok ? '正确项' : '错误项'}</b></div><div class="oeText"><em>${ok ? '正确依据：' : '错误点：'}</em>${highlight(detail)}</div></div>`;
  }).join('');
}
function figHtml(q, where = 'stem') {
  let m = q.media;
  if (!m) return '';
  let arr = where === 'stem' ? (m.stemFigs || []) : (m.expFigs || []);
  if (!arr.length) return '';
  return `<div class="figBox">${arr.map((src, i) => `<figure><img src="${src}" alt="附图${i + 1}" loading="lazy"><figcaption>${where === 'stem' ? '题干附图' : '原卷解析图'} ${i + 1}</figcaption></figure>`).join('')}</div>`;
}
function sourceLink(q) {
  let page = q.page || (q.media && q.media.page) || '';
  let href = (q.media && q.media.sourcePdf) || (q.sourcePdf ? `${q.sourcePdf}#page=${page}` : '');
  if (!href) return '';
  return `<a class="sourceLink" href="${href}">查看原卷第 ${page || ''} 页</a>`;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  let m = Math.floor(sec / 60), s = sec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function stopQTimer(saveToQ) {
  if (qTimerHandle) {
    clearInterval(qTimerHandle);
    qTimerHandle = null;
  }
  if (saveToQ && session[idx]) {
    let qid = session[idx].id;
    let spent = Math.floor((Date.now() - qTimerStartedAt) / 1000);
    if (spent > 0) {
      S.qTimes[qid] = (S.qTimes[qid] || 0) + spent;
      // also attach last attempt duration into answer if exists
      if (S.answers[qid]) S.answers[qid].durationSec = (S.answers[qid].durationSec || 0) + spent;
    }
  }
}
function startQTimer() {
  stopQTimer(false);
  qTimerStartedAt = Date.now();
  qTimerSec = 0;
  let el = $('#qTimer');
  if (el) el.textContent = '00:00';
  qTimerHandle = setInterval(() => {
    qTimerSec = Math.floor((Date.now() - qTimerStartedAt) / 1000);
    let el2 = $('#qTimer');
    if (el2) el2.textContent = fmtTime(qTimerSec);
  }, 250);
}
function analysisCard(q, a, isRetry, streak) {
  let lastDur = a && a.durationSec ? a.durationSec : (S.qTimes[q.id] || 0);
  return `<div class="analysis">
    <div class="answerResult ${a.correct ? 'pass' : 'fail'}">
      <strong>${a.correct ? '✓ 回答正确' : '× 回答错误'}</strong>
      <span>正确答案：${q.answer.join('、')}</span>
    </div>
    <div class="timeLine">本题累计用时 <b>${fmtTime(lastDur)}</b>${qTimerSec ? ` · 本轮 ${fmtTime(qTimerSec)}` : ''}</div>
    ${isRetry ? `<div class="streakMessage">${a.mastered ? '已达到连续答对目标，本题已从错题本消除。' : a.correct ? '当前连续答对 ' + (S.wrong[q.id]?.streak || streak) + ' 次，还需 ' + Math.max(0, S.streakGoal - (S.wrong[q.id]?.streak || 0)) + ' 次。' : '连续次数已归零，请下轮再答。'}</div>` : ''}
    <section class="breakdown"><h3>逐项判断</h3>${explainOptions(q)}</section>
    <details class="originalAnalysis" open>
      <summary>原卷完整解析</summary>
      <div>${highlight(q.explanation || '原卷未提供解析。')}</div>
      ${figHtml(q, 'exp')}
      ${sourceLink(q)}
    </details>
    <textarea class="note" placeholder="写下你的记忆口诀或易错点…">${esc(S.notes[q.id] || '')}</textarea>
  </div>`;
}

function view(id) {
  $$('.view').forEach(x => x.classList.toggle('active', x.id === id));
  $$('nav button').forEach(x => x.classList.toggle('active', x.dataset.view === id));
  if (id === 'wrong') renderList('wrong');
  if (id === 'favorite') renderList('fav');
  if (id === 'stats') renderStats();
  if (id !== 'practice') stopQTimer(true), save();
  scrollTo(0, 0);
}
function statsFor(qs) {
  let done = 0, correct = 0;
  qs.forEach(q => {
    let a = S.answers[q.id];
    if (a) { done++; if (a.correct) correct++; }
  });
  return { done, correct, acc: done ? Math.round(correct / done * 100) : 0 };
}
function lastQuestionMeta() {
  if (!S.last || !S.last.ids || !S.last.ids.length) return null;
  let map = new Map(all().map(q => [q.id, q]));
  let q = map.get(S.last.ids[Math.min(S.last.idx || 0, S.last.ids.length - 1)]);
  if (!q) return null;
  return { q, idx: S.last.idx || 0, total: S.last.ids.length, title: S.last.title || q.paperTitle, mode: S.last.mode || 'practice' };
}
function updateHome() {
  let qs = all(), st = statsFor(qs);
  $('#totalCount').textContent = qs.length;
  $('#doneCount').textContent = st.done;
  $('#accuracy').textContent = st.done ? st.acc + '%' : '—';
  $('#wrongText').textContent = Object.keys(S.wrong).length + ' 道待攻克';
  let meta = lastQuestionMeta();
  let btn = $('#continueBig');
  if (meta) {
    $('#continueText').textContent = `${meta.title} · 第 ${meta.idx + 1}/${meta.total} 题`;
    btn.classList.add('hasLast');
    btn.disabled = false;
  } else {
    $('#continueText').textContent = '还没有练习记录，从第一套开始';
    btn.classList.remove('hasLast');
  }
  renderPapers();
}
function renderPapers() {
  let box = $('#paperList');
  box.innerHTML = DB.papers.map((p, i) => {
    let st = statsFor(p.questions), pct = Math.round(st.done / p.questions.length * 100);
    return `<div class="paper">
      <div class="paperTop">
        <div class="paperNo">0${i + 1}</div>
        <div>
          <h3>${p.title}</h3>
          <p>${p.questions.length} 题 · 单选 ${p.questions.filter(q => q.type === 'single').length} · 多选 ${p.questions.filter(q => q.type === 'multiple').length} · 已完成 ${st.done}</p>
        </div>
      </div>
      <div class="paperProgress"><i style="width:${pct}%"></i></div>
      <div class="paperActions">
        <button type="button" onclick="openPdf('${p.sourcePdf}')">查看原卷</button>
        <button type="button" onclick="startPaper('${p.id}','exam')">模拟考试</button>
        <button type="button" class="start" onclick="startPaper('${p.id}','practice')">${st.done ? '继续本卷' : '开始练习'}</button>
      </div>
    </div>`;
  }).join('');
}
window.openPdf = p => { location.href = p; };
window.startPaper = function (id, mode) {
  let p = DB.papers.find(x => x.id === id);
  let qs = p.questions.map(q => ({ ...q, paperId: p.id, paperTitle: p.title, sourcePdf: p.sourcePdf }));
  // resume within same paper if last was this paper
  let at = 0;
  if (S.last && S.last.ids && S.last.ids.length && mode === 'practice') {
    let first = S.last.ids[0];
    if (qs.some(q => q.id === first) && S.last.ids.length === qs.length) at = S.last.idx || 0;
    else {
      // find first unanswered in this paper
      let i = qs.findIndex(q => !S.answers[q.id]);
      at = i >= 0 ? i : 0;
    }
  }
  start(qs, p.title, mode, at);
};
function continueLast() {
  let meta = lastQuestionMeta();
  if (!meta) return startPaper('p1', 'practice');
  let map = new Map(all().map(q => [q.id, q]));
  let arr = S.last.ids.map(id => map.get(id)).filter(Boolean);
  if (!arr.length) return startPaper('p1', 'practice');
  start(arr, S.last.title || '继续练习', S.last.mode || 'practice', Math.min(S.last.idx || 0, arr.length - 1));
}
function start(qs, title, mode = 'practice', at = 0) {
  if (!qs.length) return toast('这里还没有题目');
  stopQTimer(true);
  session = qs;
  idx = Math.min(Math.max(0, at | 0), qs.length - 1);
  chosen = [];
  roundAnswers = {};
  S.currentTitle = title;
  S.mode = mode;
  S.last = { ids: qs.map(x => x.id), idx, title, mode };
  save();
  view('practice');
  renderQuestion();
}
function renderQuestion() {
  let q = session[idx];
  let isRetry = S.mode === 'wrong';
  let a = isRetry ? roundAnswers[q.id] : S.answers[q.id];
  chosen = a ? [...a.selected] : [];
  S.last = { ids: session.map(x => x.id), idx, title: S.currentTitle, mode: S.mode };
  save();
  $('#sessionTitle').textContent = S.currentTitle;
  let streak = S.wrong[q.id]?.streak || 0;
  $('#sessionMeta').textContent = `第 ${idx + 1} / ${session.length} 题 · ${q.type === 'multiple' ? '多项选择' : '单项选择'}${isRetry ? ' · 连对 ' + streak + '/' + S.streakGoal : ''}`;
  $('#progressBar').style.width = ((idx + 1) / session.length * 100) + '%';
  let revealed = !!a;
  $('#questionCard').innerHTML = `
    <div class="qmeta">
      <span>${q.knowledge || '安全生产技术'}</span>
      <span>${isRetry ? '消除进度 ' + streak + '/' + S.streakGoal : 'PDF 第 ' + q.page + ' 页'}${q.media && q.media.stemFigs && q.media.stemFigs.length ? ' · 含图表' : ''}</span>
      <button id="favBtn" type="button">${S.fav[q.id] ? '★' : '☆'}</button>
    </div>
    <div class="stem">${q.stem}</div>
    ${figHtml(q, 'stem')}
    <div class="options">${Object.entries(q.options).map(([k, v]) =>
      `<button type="button" class="option ${chosen.includes(k) ? 'selected' : ''} ${revealed && q.answer.includes(k) ? 'correct' : ''} ${revealed && chosen.includes(k) && !q.answer.includes(k) ? 'wrongopt' : ''}" data-k="${k}"><i>${k}</i><span>${v}</span></button>`
    ).join('')}</div>
    ${revealed ? analysisCard(q, a, isRetry, streak) : ''}`;
  $('#submitBtn').textContent = revealed ? '已判定' : '确认答案';
  $('#prevBtn').disabled = idx === 0;
  $('#nextBtn').textContent = idx === session.length - 1 ? '完成' : '下一题';
  $$('.option').forEach(b => b.onclick = () => selectOpt(b.dataset.k, q, a));
  $('#favBtn').onclick = () => {
    if (S.fav[q.id]) delete S.fav[q.id]; else S.fav[q.id] = 1;
    save(); renderQuestion();
  };
  let note = $('.note');
  if (note) note.oninput = e => { S.notes[q.id] = e.target.value; save(); };
  if (!revealed) startQTimer();
  else {
    stopQTimer(false);
    let el = $('#qTimer');
    if (el) el.textContent = fmtTime(S.qTimes[q.id] || a.durationSec || 0);
  }
}
function selectOpt(k, q, a) {
  if (a) return;
  if (q.type === 'single') chosen = [k];
  else chosen.includes(k) ? chosen = chosen.filter(x => x !== k) : chosen.push(k);
  $$('.option').forEach(x => x.classList.toggle('selected', chosen.includes(x.dataset.k)));
}
function submit() {
  let q = session[idx], isRetry = S.mode === 'wrong';
  if (isRetry ? roundAnswers[q.id] : S.answers[q.id]) return;
  if (!chosen.length) return toast('请先选择答案');
  // freeze timer into this attempt
  let spent = Math.floor((Date.now() - qTimerStartedAt) / 1000);
  stopQTimer(false);
  S.qTimes[q.id] = (S.qTimes[q.id] || 0) + Math.max(0, spent);
  let correct = eq(chosen, q.answer);
  let result = { selected: [...chosen], correct, time: Date.now(), durationSec: Math.max(0, spent) };
  if (isRetry) {
    let w = S.wrong[q.id] || { streak: 0, attempts: 0 };
    w.attempts = (w.attempts || 0) + 1;
    if (correct) w.streak = (w.streak || 0) + 1;
    else { w.streak = 0; w.lastWrong = Date.now(); }
    result.mastered = correct && w.streak >= S.streakGoal;
    if (result.mastered) delete S.wrong[q.id];
    else S.wrong[q.id] = w;
    roundAnswers[q.id] = result;
    S.answers[q.id] = result;
  } else {
    S.answers[q.id] = result;
    if (!correct) S.wrong[q.id] = { streak: 0, attempts: 0, lastWrong: Date.now() };
  }
  save();
  renderQuestion();
  toast(result.mastered ? '连续答对达标，已消除！' : correct ? (isRetry ? '连续答对 +1' : '答对了，稳住！') : (isRetry ? '答错，连续次数归零' : '已加入错题本'));
}
function next() {
  stopQTimer(true);
  if (idx < session.length - 1) {
    idx++;
    chosen = [];
    renderQuestion();
    scrollTo(0, 0);
  } else finish();
}
function prev() {
  if (!idx) return;
  stopQTimer(true);
  idx--;
  chosen = [];
  renderQuestion();
  scrollTo(0, 0);
}
function finish() {
  stopQTimer(true);
  let st = statsFor(session);
  $('#sheetModal').classList.remove('open');
  view('stats');
  renderStats();
  toast(`本轮完成 ${st.done}/${session.length}，正确率 ${st.acc}%`);
}
function renderSheet() {
  let box = $('#answerSheet');
  box.innerHTML = session.map((q, i) => {
    let a = S.mode === 'wrong' ? roundAnswers[q.id] : S.answers[q.id];
    return `<button type="button" class="${a ? (a.correct ? 'done' : 'bad') : ''}" data-i="${i}">${i + 1}</button>`;
  }).join('');
  box.querySelectorAll('button').forEach(b => b.onclick = () => {
    stopQTimer(true);
    idx = +b.dataset.i;
    $('#sheetModal').classList.remove('open');
    renderQuestion();
  });
  $('#sheetModal').classList.add('open');
}
function renderList(kind) {
  let ids = Object.keys(kind === 'wrong' ? S.wrong : S.fav);
  let qs = all().filter(q => ids.includes(q.id));
  let box = $(kind === 'wrong' ? '#wrongList' : '#favoriteList');
  if (kind === 'wrong') {
    let startBtn = $('#startWrongBtn');
    startBtn.disabled = !qs.length;
    startBtn.textContent = qs.length ? `开始错题回炉（${qs.length} 题）` : '暂无错题';
    $$('#streakSetting button').forEach(b => b.classList.toggle('active', +b.dataset.n === S.streakGoal));
  }
  if (!qs.length) {
    box.innerHTML = `<div class="empty">${kind === 'wrong' ? '暂无错题，继续保持。' : '还没有收藏题目。'}</div>`;
    return;
  }
  box.innerHTML = qs.map(q => {
    let w = S.wrong[q.id] || { streak: 0 };
    return `<div class="listItem" data-id="${q.id}">
      <small>${q.paperTitle} · 第 ${q.no} 题${kind === 'wrong' ? ' · 连对 ' + (w.streak || 0) + '/' + S.streakGoal : ''}${S.qTimes[q.id] ? ' · 用时 ' + fmtTime(S.qTimes[q.id]) : ''}</small>
      <b>${q.stem.slice(0, 100)}${q.stem.length > 100 ? '…' : ''}</b>
      ${kind === 'wrong' ? `<div class="miniStreak"><i style="width:${Math.min(100, (w.streak || 0) / S.streakGoal * 100)}%"></i></div>` : ''}
    </div>`;
  }).join('');
  box.querySelectorAll('.listItem').forEach(x => x.onclick = () => {
    start(qs, kind === 'wrong' ? '错题回炉' : '收藏练习', kind === 'wrong' ? 'wrong' : 'practice', qs.findIndex(q => q.id === x.dataset.id));
  });
}
function renderStats() {
  let qs = all(), st = statsFor(qs), wrong = Object.keys(S.wrong).length;
  let groups = {};
  qs.forEach(q => {
    let c = (q.knowledge.match(/^\d/) || ['其他'])[0];
    (groups[c] ??= []).push(q);
  });
  let totalSec = Object.values(S.qTimes).reduce((a, b) => a + (b || 0), 0);
  $('#statsContent').innerHTML = `
    <div class="reportHero">
      <strong>${st.done ? st.acc : 0}%</strong><span> 当前总正确率</span>
      <p>已完成 ${st.done}/${qs.length} 道，还有 ${wrong} 道错题待攻克。累计做题 ${fmtTime(totalSec)}。</p>
    </div>
    <div class="reportGrid">
      <div><strong>${st.correct}</strong><span>累计答对</span></div>
      <div><strong>${wrong}</strong><span>当前错题</span></div>
      <div><strong>${Object.keys(S.fav).length}</strong><span>收藏题目</span></div>
      <div><strong>${Object.values(S.notes).filter(Boolean).length}</strong><span>学习笔记</span></div>
    </div>
    <div class="chapters">
      <h3>章节正确率</h3>
      ${Object.entries(groups).sort().map(([k, v]) => {
        let x = statsFor(v);
        let name = { '1': '机械安全', '2': '电气安全', '3': '特种设备', '4': '防火防爆', '5': '危险化学品', '其他': '其他' }[k];
        return `<div class="chapter"><b>${name}</b><small style="float:right">${x.done ? x.acc + '%' : '未作答'} · ${x.done}/${v.length}</small><div class="bar"><i style="width:${x.acc}%"></i></div></div>`;
      }).join('')}
    </div>`;
}
function toast(t) {
  let x = $('#toast');
  x.textContent = t;
  x.classList.add('show');
  setTimeout(() => x.classList.remove('show'), 1600);
}
function normalizeSyncCode(code) {
  return String(code || '').trim().toLowerCase().replace(/\s+/g, '');
}
function updateSyncUI() {
  const status = $('#syncStatus');
  const input = $('#syncCodeInput');
  if (!status) return;
  if (input && document.activeElement !== input) input.value = S.syncCode || '';
  if (!S.syncCode) {
    status.textContent = '未设置同步码 · 电脑和手机可共用进度';
    return;
  }
  const t = S.syncUpdatedAt ? new Date(S.syncUpdatedAt).toLocaleString('zh-CN', { hour12: false }) : '尚未上传';
  status.textContent = `已启用：${S.syncCode} · 云端 ${t}`;
}
function applyRemoteState(remote, updatedAt) {
  if (!remote || typeof remote !== 'object') return false;
  S.answers = remote.answers || {};
  S.wrong = remote.wrong || {};
  S.fav = remote.fav || {};
  S.notes = remote.notes || {};
  S.last = remote.last || null;
  S.dark = !!remote.dark;
  S.streakGoal = remote.streakGoal || 3;
  S.examDate = remote.examDate || DEFAULT_EXAM;
  S.qTimes = remote.qTimes || {};
  // keep current sync code
  S.syncUpdatedAt = updatedAt || remote.syncUpdatedAt || new Date().toISOString();
  S.localUpdatedAt = S.syncUpdatedAt;
  Object.keys(S.wrong).forEach(id => {
    if (typeof S.wrong[id] !== 'object') S.wrong[id] = { streak: 0, attempts: 0, lastWrong: Date.now() };
  });
  localStorage.setItem(KEY, JSON.stringify(S));
  document.body.classList.toggle('dark', S.dark);
  updateHome();
  updateCountdown();
  updateSyncUI();
  return true;
}
function exportableState() {
  return {
    answers: S.answers,
    wrong: S.wrong,
    fav: S.fav,
    notes: S.notes,
    last: S.last,
    dark: S.dark,
    streakGoal: S.streakGoal,
    examDate: S.examDate,
    qTimes: S.qTimes,
    localUpdatedAt: S.localUpdatedAt,
  };
}
function scheduleCloudPush() {
  if (!normalizeSyncCode(S.syncCode)) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { cloudPush().catch(() => {}); }, 1200);
}
async function cloudPush() {
  const code = normalizeSyncCode(S.syncCode);
  if (!code || syncing) return null;
  syncing = true;
  updateSyncStatusText('正在上传进度…');
  try {
    const res = await fetch(SYNC_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state: exportableState(), device: DEVICE_ID })
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || ('http ' + res.status));
    S.syncUpdatedAt = data.updatedAt || new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(S));
    updateSyncUI();
    return data;
  } catch (e) {
    updateSyncStatusText('上传失败，稍后再试');
    throw e;
  } finally {
    syncing = false;
  }
}
async function cloudPull({ preferRemoteIfNewer = true, force = false } = {}) {
  const code = normalizeSyncCode(S.syncCode);
  if (!code || syncing) return null;
  syncing = true;
  updateSyncStatusText('正在拉取云端进度…');
  try {
    const res = await fetch(SYNC_API + '?code=' + encodeURIComponent(code));
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || ('http ' + res.status));
    if (!data.exists || !data.state) {
      // first time: upload local
      syncing = false;
      await cloudPush();
      updateSyncStatusText('已创建云端进度');
      return { created: true };
    }
    const remoteTs = Date.parse(data.updatedAt || 0) || 0;
    const localTs = Date.parse(S.localUpdatedAt || S.syncUpdatedAt || 0) || 0;
    if (force || !preferRemoteIfNewer || remoteTs >= localTs) {
      applyRemoteState(data.state, data.updatedAt);
      updateSyncStatusText('已从云端恢复');
      return { pulled: true, updatedAt: data.updatedAt };
    }
    // local newer -> push
    syncing = false;
    await cloudPush();
    updateSyncStatusText('本机更新，已上传云端');
    return { pushed: true };
  } catch (e) {
    updateSyncStatusText('同步失败，检查网络后重试');
    throw e;
  } finally {
    syncing = false;
    updateSyncUI();
  }
}
function updateSyncStatusText(text) {
  const status = $('#syncStatus');
  if (status) status.textContent = text;
}
async function saveSyncCode() {
  const code = normalizeSyncCode($('#syncCodeInput').value);
  if (code && (code.length < 4 || code.length > 64)) return toast('同步码请用 4-64 位');
  S.syncCode = code;
  save({ skipCloud: true });
  if (!code) {
    updateSyncUI();
    toast('已关闭云同步');
    return;
  }
  try {
    await cloudPull({ force: false });
    toast('同步码已保存并完成同步');
  } catch (e) {
    toast('同步码已保存，但联网同步失败');
  }
}
async function syncNow() {
  if (!normalizeSyncCode(S.syncCode)) return toast('请先设置同步码');
  stopQTimer(true);
  try {
    await cloudPull({ force: false });
    toast('同步完成');
  } catch (e) {
    toast('同步失败');
  }
}
function updateCountdown() {
  let d = S.examDate || DEFAULT_EXAM;
  let target = new Date(d + 'T09:00:00+08:00');
  let now = new Date();
  let days = Math.ceil((target - now) / 86400000);
  let el = $('#cdDays');
  if (!el) return;
  if (isNaN(target.getTime())) { el.textContent = '--'; return; }
  if (days > 0) el.textContent = days;
  else if (days === 0) el.textContent = '今';
  else el.textContent = '已过';
  el.parentElement.title = `考试日期 ${d}（点击修改）`;
}
function exportProgress() {
  stopQTimer(true);
  let blob = new Blob([JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    state: S
  }, null, 2)], { type: 'application/json' });
  let a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `安考必过进度_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('进度已导出');
}
function importProgress(file) {
  let reader = new FileReader();
  reader.onload = () => {
    try {
      let data = JSON.parse(reader.result);
      let st = data.state || data;
      if (!st || typeof st !== 'object') throw new Error('bad');
      S = loadState(); // reset shape
      S.answers = st.answers || {};
      S.wrong = st.wrong || {};
      S.fav = st.fav || {};
      S.notes = st.notes || {};
      S.last = st.last || null;
      S.dark = !!st.dark;
      S.streakGoal = st.streakGoal || 3;
      S.examDate = st.examDate || DEFAULT_EXAM;
      S.qTimes = st.qTimes || {};
      Object.keys(S.wrong).forEach(id => {
        if (typeof S.wrong[id] !== 'object') S.wrong[id] = { streak: 0, attempts: 0, lastWrong: Date.now() };
      });
      save();
      document.body.classList.toggle('dark', S.dark);
      toast('进度已导入');
      view('home');
    } catch (e) {
      toast('导入失败，文件格式不对');
    }
  };
  reader.readAsText(file);
}

// bindings
$$('nav button').forEach(b => b.onclick = () => view(b.dataset.view));
$('#submitBtn').onclick = submit;
$('#nextBtn').onclick = next;
$('#prevBtn').onclick = prev;
$('#backBtn').onclick = () => { stopQTimer(true); save(); view('home'); };
$('#sheetBtn').onclick = renderSheet;
$('#closeSheet').onclick = () => $('#sheetModal').classList.remove('open');
$('#finishBtn').onclick = finish;
$('#themeBtn').onclick = () => { S.dark = !S.dark; document.body.classList.toggle('dark', S.dark); save(); };
$('#clearWrong').onclick = () => {
  if (confirm('确定清空错题记录？')) { S.wrong = {}; save(); renderList('wrong'); }
};
$('#startWrongBtn').onclick = () => {
  let qs = all().filter(q => S.wrong[q.id]);
  start(qs, '错题回炉', 'wrong');
};
$$('#streakSetting button').forEach(b => b.onclick = () => {
  S.streakGoal = +b.dataset.n; save(); renderList('wrong'); toast('已设置连续答对 ' + S.streakGoal + ' 次消除');
});
$('#resetAll').onclick = () => {
  if (confirm('确定清空全部答题、错题、收藏和笔记？')) {
    localStorage.removeItem(KEY);
    location.reload();
  }
};
$('#continueBig').onclick = continueLast;
$$('[data-quick]').forEach(b => b.onclick = () => {
  let t = b.dataset.quick, qs = all();
  if (t === 'wrong') return start(qs.filter(q => S.wrong[q.id]), '错题回炉', 'wrong');
  if (t === 'random') return start(qs.sort(() => Math.random() - .5).slice(0, 20), '随机 20 题');
});
$('#exportBtn').onclick = exportProgress;
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = e => {
  let f = e.target.files && e.target.files[0];
  if (f) importProgress(f);
  e.target.value = '';
};
$('#examCountdown').onclick = () => {
  $('#examDateInput').value = S.examDate || DEFAULT_EXAM;
  $('#examDateModal').classList.add('open');
};
$('#closeExamDate').onclick = () => $('#examDateModal').classList.remove('open');
$('#saveExamDate').onclick = () => {
  S.examDate = $('#examDateInput').value || DEFAULT_EXAM;
  save();
  $('#examDateModal').classList.remove('open');
  toast('考试日期已更新');
};
$('#saveSyncCodeBtn').onclick = saveSyncCode;
$('#syncNowBtn').onclick = syncNow;
$('#syncCodeInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') saveSyncCode();
});

// visibility: save timer when page hidden
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopQTimer(true);
    save({ skipCloud: true });
    scheduleCloudPush();
  } else if (normalizeSyncCode(S.syncCode)) {
    cloudPull({ force: false }).catch(() => {});
  }
});
window.addEventListener('beforeunload', () => {
  stopQTimer(true);
  try {
    S.localUpdatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {}
});

document.body.classList.toggle('dark', S.dark);
updateCountdown();
updateHome();
updateSyncUI();
setInterval(updateCountdown, 60000);
// boot cloud pull
if (normalizeSyncCode(S.syncCode)) {
  cloudPull({ force: false }).catch(() => {});
}
