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
  S.examHistory = S.examHistory || {}; // paper id -> completed attempt snapshots
  S.memo = S.memo || {}; // card id -> {status:'known'|'hard', reviews, updatedAt}
  S.memoLast = S.memoLast || null;
  S.practiceMemo = S.practiceMemo || {}; // practice id -> status
  S.practiceLast = S.practiceLast || null;
  S.shiwuMemo = S.shiwuMemo || {};
  S.shiwuLast = S.shiwuLast || null;
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
const all = () => {
  const base = DB.papers.flatMap(p => p.questions.map(q => ({
    ...q,
    paperId: p.id,
    paperTitle: p.title,
    sourcePdf: p.sourcePdf
  })));
  const pq = window.POINT_QUIZ && window.POINT_QUIZ.paper;
  if (pq && Array.isArray(pq.questions)) {
    base.push(...pq.questions.map(q => ({
      ...q,
      page: q.page || '',
      paperId: pq.id,
      paperTitle: pq.title,
      sourcePdf: pq.sourcePdf
    })));
  }
  return base;
};
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
  let href = (q.media && q.media.sourcePdf) || (q.sourcePdf ? (page ? `${q.sourcePdf}#page=${page}` : q.sourcePdf) : '');
  if (!href) return '';
  return `<a class="sourceLink" href="${href}">${page ? '查看原卷第 ' + page + ' 页' : '查看新增考点原 PDF'}</a>`;
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
function hasOfficialAnswer(q) {
  return Array.isArray(q.answer) && q.answer.length > 0;
}
function analysisCard(q, a, isRetry, streak) {
  let lastDur = a && a.durationSec ? a.durationSec : (S.qTimes[q.id] || 0);
  const scored = hasOfficialAnswer(q) && !(a && a.unscored);
  const resultHtml = scored
    ? `<div class="answerResult ${a.correct ? 'pass' : 'fail'}">
      <strong>${a.correct ? '✓ 回答正确' : '× 回答错误'}</strong>
      <span>本题 ${questionScore(q, a.selected).got}/${questionScore(q, a.selected).full} 分 · 正确答案：${q.answer.join('、')}</span>
    </div>`
    : `<div class="answerResult">
      <strong>已记录作答</strong>
      <span>本题暂无官方答案，先练习不判分、不进错题本</span>
    </div>`;
  return `<div class="analysis">
    ${resultHtml}
    <div class="timeLine">本题累计用时 <b>${fmtTime(lastDur)}</b>${qTimerSec ? ` · 本轮 ${fmtTime(qTimerSec)}` : ''}</div>
    ${isRetry ? `<div class="streakMessage">${a.mastered ? '已达到连续答对目标，本题已从错题本消除。' : a.correct ? '当前连续答对 ' + (S.wrong[q.id]?.streak || streak) + ' 次，还需 ' + Math.max(0, S.streakGoal - (S.wrong[q.id]?.streak || 0)) + ' 次。' : '连续次数已归零，请下轮再答。'}</div>` : ''}
    ${scored ? `<section class="breakdown"><h3>逐项判断</h3>${explainOptions(q)}</section>` : ''}
    <details class="originalAnalysis" open>
      <summary>原卷完整解析</summary>
      <div>${highlight(q.explanation || (scored ? '原卷未提供解析。' : '这份是做题版，正文没有答案。你把答案版发我后就能接通判分。'))}</div>
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
  if (id === 'memo') renderMemoHome();
  if (id === 'practiceMemo') { renderPracticeHome(); renderShiwuHome(); }
  if (id === 'favorite') renderList('fav');
  if (id === 'stats') renderStats();
  if (id !== 'practice') stopQTimer(true), save();
  scrollTo(0, 0);
}
function questionScore(q, selected) {
  const type = q.type === 'multiple' ? 'multiple' : 'single';
  const full = type === 'multiple' ? 2 : 1;
  const ans = new Set(q.answer || []);
  const sel = new Set(selected || []);
  if (!sel.size) return { got: 0, full, status: 'blank' };
  if (type === 'single') {
    const ok = sel.size === 1 && ans.has([...sel][0]);
    return { got: ok ? 1 : 0, full, status: ok ? 'full' : 'wrong' };
  }
  // official multi: 2 or more correct options, at least 1 wrong option.
  // wrong selection => 0; missing some correct => 0.5 each selected correct.
  for (const x of sel) if (!ans.has(x)) return { got: 0, full, status: 'wrong' };
  if (sel.size === ans.size) return { got: 2, full, status: 'full' };
  return { got: Math.round(sel.size * 0.5 * 10) / 10, full, status: 'partial' };
}
function paperRule(qs) {
  const single = qs.filter(q => q.type !== 'multiple').length;
  const multiple = qs.filter(q => q.type === 'multiple').length;
  const scored = qs.filter(q => q.answer && q.answer.length);
  const full = scored.filter(q => q.type !== 'multiple').length * 1 + scored.filter(q => q.type === 'multiple').length * 2;
  return { single, multiple, full, pass: Math.round(full * 0.6 * 10) / 10, scoreable: scored.length };
}
function statsFor(qs) {
  let done = 0, correct = 0, got = 0;
  for (const q of qs) {
    let a = S.answers[q.id];
    if (!a) continue;
    if (a.unscored || !q.answer || !q.answer.length) continue;
    done++;
    if (a.correct) correct++;
    got += questionScore(q, a.selected).got;
  }
  const rule = paperRule(qs);
  return { done, correct, acc: done ? Math.round(correct / done * 100) : 0, got: Math.round(got * 10) / 10, full: rule.full, pass: rule.pass, single: rule.single, multiple: rule.multiple };
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
  const memoQuick = $('#memoQuickText');
  if (memoQuick && window.NEW_POINTS) {
    const mc = memoCounts();
    memoQuick.textContent = `${mc.new + mc.hard} 张待背 · ${window.POINT_QUIZ?.stats?.total || 0} 道选择题`;
  }
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
function paperAttemptHistory(paperId) {
  return Array.isArray(S.examHistory?.[paperId]) ? S.examHistory[paperId] : [];
}
function archivePaperAttempt(p) {
  const qs = p.questions;
  const answered = qs.filter(q => S.answers[q.id]);
  if (!answered.length) return null;
  const st = statsFor(qs);
  const snapshot = {
    id: 'attempt-' + Date.now(),
    finishedAt: new Date().toISOString(),
    answered: answered.length,
    total: qs.length,
    correct: st.correct,
    accuracy: st.acc,
    score: st.got,
    full: st.full,
    pass: st.got >= st.pass,
    durationSec: qs.reduce((n, q) => n + (S.answers[q.id]?.durationSec || 0), 0)
  };
  (S.examHistory[p.id] ??= []).unshift(snapshot);
  S.examHistory[p.id] = S.examHistory[p.id].slice(0, 30);
  return snapshot;
}
window.restartPaper = function (id, mode = 'exam') {
  const p = DB.papers.find(x => x.id === id);
  if (!p) return;
  const answered = p.questions.filter(q => S.answers[q.id]).length;
  if (answered && !confirm(`重新考试将把当前卷 ${answered} 道作答归档为一次历史成绩，并开始全新一轮。收藏、笔记、错题本不会删除。继续吗？`)) return;
  if (answered) archivePaperAttempt(p);
  p.questions.forEach(q => {
    delete S.answers[q.id];
    delete S.qTimes[q.id];
  });
  if (S.last?.ids?.some(qid => p.questions.some(q => q.id === qid))) S.last = null;
  save();
  startPaper(id, mode);
  toast('已开始新一轮，上一轮成绩已保存');
};
function renderPapers() {
  let box = $('#paperList');
  box.innerHTML = DB.papers.map((p, i) => {
    let st = statsFor(p.questions), pct = Math.round(st.done / p.questions.length * 100);
    const history = paperAttemptHistory(p.id);
    const latest = history[0];
    const historyText = latest
      ? `<p>历史考试 ${history.length} 次 · 最近 ${latest.score}/${latest.full} 分 · ${latest.pass ? '已合格' : '未合格'} · ${new Date(latest.finishedAt).toLocaleDateString('zh-CN')}</p>`
      : '';
    return `<div class="paper">
      <div class="paperTop">
        <div class="paperNo">${String(i + 1).padStart(2, '0')}</div>
        <div>
          <h3>${p.title}</h3>
          <p>${p.questions.length} 题 · 单选 ${st.single} · 多选 ${st.multiple}${st.full ? ` · 满分 ${st.full} · 合格 ${st.pass}` : ' · 做题版暂不判分'}</p>
          <p>${st.full ? `已完成 ${st.done} · 当前得分 ${st.got}/${st.full}${st.done ? ' · 正确率 ' + st.acc + '%' : ''}` : `已作答 ${Object.keys(S.answers).filter(id => p.questions.some(q => q.id === id)).length} 题 · 等答案版后接通计分`}</p>
          ${historyText}
        </div>
      </div>
      <div class="paperProgress"><i style="width:${pct}%"></i></div>
      <div class="paperActions">
        ${p.sourcePdf ? `<button type="button" onclick="openPdf('${p.sourcePdf}')">查看原卷</button>` : ''}
        <button type="button" onclick="${st.done ? `restartPaper('${p.id}','exam')` : `startPaper('${p.id}','exam')`}">${st.done ? '重新考试' : '模拟考试'}</button>
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
      <span>${isRetry ? '消除进度 ' + streak + '/' + S.streakGoal : (q.page ? 'PDF 第 ' + q.page + ' 页' : '教材新增考点')}${q.media && q.media.stemFigs && q.media.stemFigs.length ? ' · 含图表' : ''}</span>
      <button id="favBtn" type="button">${S.fav[q.id] ? '★' : '☆'}</button>
    </div>
    <div class="stem">${q.stem}</div>
    ${figHtml(q, 'stem')}
    <div class="options">${Object.entries(q.options || {}).map(([k, v]) =>
      `<button type="button" class="option ${chosen.includes(k) ? 'selected' : ''} ${revealed && hasOfficialAnswer(q) && q.answer.includes(k) ? 'correct' : ''} ${revealed && hasOfficialAnswer(q) && chosen.includes(k) && !q.answer.includes(k) ? 'wrongopt' : ''}" data-k="${k}"><i>${k}</i><span>${v}</span></button>`
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
  if (!q.answer || !q.answer.length) {
    const result = { selected: [...chosen], correct: false, time: Date.now(), unscored: true, durationSec: Math.max(0, Math.floor((Date.now() - qTimerStartedAt) / 1000)) };
    stopQTimer(false);
    S.qTimes[q.id] = (S.qTimes[q.id] || 0) + result.durationSec;
    if (isRetry) roundAnswers[q.id] = result;
    S.answers[q.id] = result;
    save();
    renderQuestion();
    toast('已记录选项。本题暂无答案，先练习不判分');
    return;
  }
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
  toast(`本轮得分 ${st.got}/${st.full}，${st.got >= st.pass ? '达到合格线' : '未达合格线'}`);
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
  let memoC = window.NEW_POINTS ? memoCounts() : { total:0, known:0, hard:0, new:0 };
  const paperRows = DB.papers.map(p => {
    const s = statsFor(p.questions);
    return `<div class="chapter"><b>${p.title}</b><small style="float:right">${s.got}/${s.full} 分 · 合格线 ${s.pass}</small><div class="bar"><i style="width:${s.full ? Math.min(100, s.got / s.full * 100) : 0}%"></i></div></div>`;
  }).join('');
  $('#statsContent').innerHTML = `
    <div class="reportHero">
      <strong>${st.got}</strong><span> / ${st.full} 分（官方计分）</span>
      <p>单选每题1分，多选每题2分；多选错选不得分，少选每项0.5分。合格线按满分60%。已完成 ${st.done}/${qs.length} 道，累计做题 ${fmtTime(totalSec)}。</p>
    </div>
    <div class="chapters"><h3>各卷得分</h3>${paperRows}</div>
    <div class="reportGrid">
      <div><strong>${st.correct}</strong><span>累计答对</span></div>
      <div><strong>${wrong}</strong><span>当前错题</span></div>
      <div><strong>${memoC.known}/${memoC.total}</strong><span>考点背诵掌握</span></div>
      <div><strong>${memoC.hard}</strong><span>生疏背诵卡</span></div>
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
  S.examHistory = remote.examHistory || {};
  S.memo = remote.memo || {};
  S.memoLast = remote.memoLast || null;
  S.practiceMemo = remote.practiceMemo || {};
  S.practiceLast = remote.practiceLast || null;
  S.shiwuMemo = remote.shiwuMemo || {};
  S.shiwuLast = remote.shiwuLast || null;
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
    examHistory: S.examHistory,
    memo: S.memo,
    memoLast: S.memoLast,
    practiceMemo: S.practiceMemo,
    practiceLast: S.practiceLast,
    shiwuMemo: S.shiwuMemo,
    shiwuLast: S.shiwuLast,
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
      S.memo = st.memo || {};
  S.memoLast = st.memoLast || null;
      S.practiceMemo = st.practiceMemo || {};
      S.practiceLast = st.practiceLast || null;
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

function practiceCards() {
  return window.PRACTICE_DATA && Array.isArray(window.PRACTICE_DATA.all) ? window.PRACTICE_DATA.all : [];
}
function practiceStatus(id) {
  return S.practiceMemo[id] || { status: 'new', reviews: 0, updatedAt: null };
}
function practiceCounts(cards = practiceCards()) {
  let known = 0, hard = 0;
  cards.forEach(c => { let st = practiceStatus(c.id).status; if (st === 'known') known++; if (st === 'hard') hard++; });
  return { total: cards.length, known, hard, new: cards.length - known - hard };
}
function renderPracticeHome() {
  let cards = practiceCards(), counts = practiceCounts(cards);
  let stats = $('#practiceStats');
  if (stats) stats.innerHTML = `<div><strong>${counts.total}</strong><span>张模板</span></div><div><strong>${counts.known}</strong><span>已掌握</span></div><div><strong>${counts.hard}</strong><span>生疏</span></div><div><strong>${counts.new}</strong><span>待复习</span></div>`;
  let filters = $('#practiceChapterFilters');
  if (filters) {
    let names = [...new Set(cards.map(c => c.chapter))];
    filters.innerHTML = `<button class="active" data-ch="all" type="button">全部</button>` + names.map(n => `<button data-ch="${esc(n)}" type="button">${esc(n)}</button>`).join('');
    filters.querySelectorAll('button').forEach(b => b.onclick = () => {
      filters.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      renderPracticeChapters(b.dataset.ch === 'all' ? cards : cards.filter(c => c.chapter === b.dataset.ch));
    });
  }
  renderPracticeChapters(cards);
}
function renderPracticeChapters(cards) {
  let box = $('#practiceChapterList');
  if (!box) return;
  let groups = {};
  cards.forEach(c => (groups[c.chapter] ??= []).push(c));
  box.innerHTML = Object.entries(groups).map(([ch, arr]) => {
    let c = practiceCounts(arr), pct = c.total ? Math.round(c.known / c.total * 100) : 0;
    let star = arr.filter(x => x.star).length;
    return `<div class="memoChapter"><div class="memoChapterHead"><div><b>${esc(ch)}</b><small>${c.total} 张 · 已掌握 ${c.known} · 生疏 ${c.hard} · ★${star}</small></div><button data-ch-start="${esc(ch)}" type="button">背这一章</button></div><div class="memoBar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  box.querySelectorAll('[data-ch-start]').forEach(b => b.onclick = () => startPractice(cards.filter(c => c.chapter === b.dataset.chStart), '章节模板'));
}
function startPractice(cards, title = '实务模板') {
  if (!cards.length) return toast('当前没有符合条件的模板');
  pmSession = cards;
  pmIdx = 0;
  pmFlipped = false;
  S.practiceLast = { ids: cards.map(c => c.id), idx: 0, title };
  save();
  view('practicePractice');
  renderPracticeCard();
}
let pmSession = [], pmIdx = 0, pmFlipped = false;
function renderPracticeCard() {
  let c = pmSession[pmIdx];
  if (!c) return;
  let st = practiceStatus(c.id), total = pmSession.length;
  $('#pmSessionTitle').textContent = S.practiceLast?.title || '实务模板';
  $('#pmSessionMeta').textContent = `第 ${pmIdx + 1} / ${total} 张 · ${c.star ? '★' : ''} ${c.chapter}`;
  $('#pmProgressBar').style.width = ((pmIdx + 1) / total * 100) + '%';
  $('#pmCard').innerHTML = `<div class="memoCardTop"><span>${esc(c.chapter)}</span><span class="memoBadge ${st.status}">${st.status === 'known' ? '已掌握' : st.status === 'hard' ? '生疏' : '待复习'}</span></div><div class="memoPrompt">${highlight(c.question).replace(/\n/g,'<br>')}</div>${pmFlipped ? `<div class="memoAnswer"><b>标准答案</b><div>${highlight(c.answer).replace(/\n/g,'<br>')}</div><div class="pmKey"><b>关键词</b><div>${(c.keywords || []).map(k => `<span>${esc(k)}</span>`).join('')}</div></div></div>` : `<div class="memoCover">先在脑中默写，再点“显示答案”</div>`}<div class="memoCardFoot"><small>${esc(c.section || '')} · 第 ${c.page || '?'} 页</small><span>复习 ${st.reviews || 0} 次</span></div>`;
  $('#pmFlipBottomBtn').textContent = pmFlipped ? '收起答案' : '显示答案';
  $('#pmHardBtn').classList.toggle('selectedMemo', st.status === 'hard');
  $('#pmKnownBtn').classList.toggle('selectedMemo', st.status === 'known');
}
function flipPractice() { pmFlipped = !pmFlipped; renderPracticeCard(); }
function markPractice(status) {
  let c = pmSession[pmIdx]; if (!c) return;
  let st = practiceStatus(c.id);
  S.practiceMemo[c.id] = { status, reviews: (st.reviews || 0) + 1, updatedAt: new Date().toISOString() };
  S.practiceLast = { ids: pmSession.map(x => x.id), idx: pmIdx, title: S.practiceLast?.title || '实务模板' };
  save();
  toast(status === 'known' ? '已标记掌握' : '已标记生疏，下次优先复习');
  pmFlipped = false;
  renderPracticeCard();
}
function pmNext() {
  if (pmIdx < pmSession.length - 1) { pmIdx++; pmFlipped = false; S.practiceLast.idx = pmIdx; save(); renderPracticeCard(); scrollTo(0,0); }
  else toast('本轮模板默写完成');
}
function pmPrev() {
  if (pmIdx > 0) { pmIdx--; pmFlipped = false; S.practiceLast.idx = pmIdx; save(); renderPracticeCard(); scrollTo(0,0); }
}
function shiwuPages() {
  return window.SHIWU_TOPICS && Array.isArray(window.SHIWU_TOPICS.all) ? window.SHIWU_TOPICS.all : [];
}
function shiwuStatus(id) {
  return S.shiwuMemo[id] || { status: 'new', reviews: 0, updatedAt: null };
}
function shiwuCounts(pages = shiwuPages()) {
  let known = 0, hard = 0;
  pages.forEach(p => { let st = shiwuStatus(p.id).status; if (st === 'known') known++; if (st === 'hard') hard++; });
  return { total: pages.length, known, hard, new: pages.length - known - hard };
}
function renderShiwuHome() {
  let box = $('#shiwuPaperList');
  if (!box || !window.SHIWU_TOPICS) return;
  box.innerHTML = (window.SHIWU_TOPICS.papers || []).map(p => {
    let c = shiwuCounts(p.items || []);
    let pct = c.total ? Math.round(c.known / c.total * 100) : 0;
    return `<div class="memoChapter"><div class="memoChapterHead"><div><b>${esc(p.title)}</b><small>${c.total} 页 · 已掌握 ${c.known} · 生疏 ${c.hard}</small></div><button data-sw-start="${esc(p.id)}" type="button">开始看</button></div><div class="memoBar"><i style="width:${pct}%"></i></div><div class="memoSections"><a class="filterBtn" href="${p.sourcePdf}">打开原 PDF</a></div></div>`;
  }).join('');
  box.querySelectorAll('[data-sw-start]').forEach(b => b.onclick = () => startShiwu(b.dataset.swStart));
}
function startShiwu(paperId, at) {
  let paper = (window.SHIWU_TOPICS.papers || []).find(p => p.id === paperId);
  if (!paper || !paper.items.length) return toast('这套讲义还没准备好');
  swSession = paper.items;
  swIdx = Math.min(Math.max(0, at | 0), swSession.length - 1);
  S.shiwuLast = { paperId, idx: swIdx };
  save();
  view('shiwuView');
  renderShiwuPage();
}
let swSession = [], swIdx = 0;
function renderShiwuPage() {
  let p = swSession[swIdx];
  if (!p) return;
  let st = shiwuStatus(p.id);
  $('#swSessionTitle').textContent = p.paperTitle;
  $('#swSessionMeta').textContent = `第 ${p.page} / ${swSession.length} 页 · ${st.status === 'known' ? '已掌握' : st.status === 'hard' ? '生疏' : '待复习'}`;
  $('#swProgressBar').style.width = (p.page / swSession.length * 100) + '%';
  let pdf = $('#swPdfLink');
  if (pdf) pdf.href = p.sourcePdf;
  $('#swCard').innerHTML = `<div class="memoCardTop"><span>${esc(p.title || ('第 '+p.page+' 页'))}</span><span class="memoBadge ${st.status}">${st.status === 'known' ? '已掌握' : st.status === 'hard' ? '生疏' : '待复习'}</span></div><figure class="swFig"><img src="${p.image}" alt="${esc(p.paperTitle)} 第${p.page}页"></figure>`;
  $('#swHardBtn').classList.toggle('selectedMemo', st.status === 'hard');
  $('#swKnownBtn').classList.toggle('selectedMemo', st.status === 'known');
}
function markShiwu(status) {
  let p = swSession[swIdx]; if (!p) return;
  let st = shiwuStatus(p.id);
  S.shiwuMemo[p.id] = { status, reviews: (st.reviews || 0) + 1, updatedAt: new Date().toISOString() };
  S.shiwuLast = { paperId: p.paperId, idx: swIdx };
  save();
  toast(status === 'known' ? '本页已掌握' : '本页已标生疏');
  renderShiwuPage();
}
function swNext() {
  if (swIdx < swSession.length - 1) { swIdx++; S.shiwuLast.idx = swIdx; save(); renderShiwuPage(); scrollTo(0,0); }
  else toast('这套讲义已看完');
}
function swPrev() {
  if (swIdx > 0) { swIdx--; S.shiwuLast.idx = swIdx; save(); renderShiwuPage(); scrollTo(0,0); }
}

function resumePractice() {
  let map = new Map(practiceCards().map(c => [c.id, c]));
  if (!S.practiceLast?.ids?.length) return startPractice(practiceCards().filter(c => practiceStatus(c.id).status !== 'known'), '实务模板');
  let arr = S.practiceLast.ids.map(id => map.get(id)).filter(Boolean);
  if (!arr.length) return startPractice(practiceCards(), '实务模板');
  pmSession = arr; pmIdx = Math.min(S.practiceLast.idx || 0, arr.length - 1); pmFlipped = false; view('practicePractice'); renderPracticeCard();
}

function memoCards() {
  return window.NEW_POINTS && Array.isArray(window.NEW_POINTS.cards) ? window.NEW_POINTS.cards : [];
}
function memoStatus(id) {
  return S.memo[id] || { status: 'new', reviews: 0, updatedAt: null };
}
function memoCounts(cards = memoCards()) {
  let known = 0, hard = 0;
  cards.forEach(c => { let st = memoStatus(c.id).status; if (st === 'known') known++; if (st === 'hard') hard++; });
  return { total: cards.length, known, hard, new: cards.length - known - hard };
}
function renderMemoHome() {
  let cards = memoCards(), counts = memoCounts(cards);
  let stats = $('#memoStats');
  if (stats) stats.innerHTML = `<div><strong>${counts.total}</strong><span>张背诵卡</span></div><div><strong>${counts.known}</strong><span>已掌握</span></div><div><strong>${counts.hard}</strong><span>生疏</span></div><div><strong>${counts.new}</strong><span>待复习</span></div>`;
  let quick = $('#memoQuickText');
  if (quick) quick.textContent = `${counts.new} 张待背`;
  let filters = $('#memoChapterFilters');
  if (filters) {
    let names = [...new Set(cards.map(c => c.chapter))];
    filters.innerHTML = `<button class="active" data-ch="all" type="button">全部</button>` + names.map(n => `<button data-ch="${esc(n)}" type="button">${esc(n).replace(/第|章/g,'')}</button>`).join('');
    filters.querySelectorAll('button').forEach(b => b.onclick = () => {
      filters.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      renderMemoChapters(b.dataset.ch === 'all' ? cards : cards.filter(c => c.chapter === b.dataset.ch));
    });
  }
  renderMemoChapters(cards);
}
function renderMemoChapters(cards) {
  let box = $('#memoChapterList');
  if (!box) return;
  let groups = {};
  cards.forEach(c => (groups[c.chapter] ??= []).push(c));
  box.innerHTML = Object.entries(groups).map(([ch, arr]) => {
    let c = memoCounts(arr), pct = c.total ? Math.round(c.known / c.total * 100) : 0;
    let sections = [...new Set(arr.map(x => x.section))];
    return `<div class="memoChapter"><div class="memoChapterHead"><div><b>${esc(ch)}</b><small>${c.total} 张 · 已掌握 ${c.known} · 生疏 ${c.hard}</small></div><button data-ch-start="${esc(ch)}" type="button">背这一章</button></div><div class="memoBar"><i style="width:${pct}%"></i></div><div class="memoSections">${sections.map(s => `<span>${esc(s.replace(/^第[一二三四五六七八九十]+节\s*/,''))}</span>`).join('')}</div></div>`;
  }).join('');
  box.querySelectorAll('[data-ch-start]').forEach(b => b.onclick = () => startMemo(cards.filter(c => c.chapter === b.dataset.chStart), '章节背诵'));
}
function startMemo(cards, title = '考点背诵') {
  if (!cards.length) return toast('当前没有符合条件的背诵卡');
  memoSession = cards;
  memoIdx = 0;
  memoFlipped = false;
  S.memoLast = { ids: cards.map(c => c.id), idx: 0, title };
  save();
  view('memoPractice');
  renderMemoCard();
}
let memoSession = [], memoIdx = 0, memoFlipped = false;
function renderMemoCard() {
  let c = memoSession[memoIdx];
  if (!c) return;
  let st = memoStatus(c.id), total = memoSession.length;
  $('#memoSessionTitle').textContent = S.memoLast?.title || '考点背诵';
  $('#memoSessionMeta').textContent = `第 ${memoIdx + 1} / ${total} 张 · ${c.level === 'core' ? '总览卡' : '细点卡'}`;
  $('#memoProgressBar').style.width = ((memoIdx + 1) / total * 100) + '%';
  $('#memoCard').innerHTML = `<div class="memoCardTop"><span>${esc(c.chapter)}</span><span class="memoBadge ${st.status}">${st.status === 'known' ? '已掌握' : st.status === 'hard' ? '生疏' : '待复习'}</span></div><div class="memoPrompt">${highlight(c.prompt).replace(/\n/g,'<br>')}</div>${memoFlipped ? `<div class="memoAnswer"><b>参考答案</b><div>${highlight(c.answer).replace(/\n/g,'<br>')}</div></div>` : `<div class="memoCover">先在脑中复述，再点“显示答案”</div>`}<div class="memoCardFoot"><small>${esc(c.section)} · ${esc(c.title)}</small><span>复习 ${st.reviews || 0} 次</span></div>`;
  $('#memoFlipBottomBtn').textContent = memoFlipped ? '收起答案' : '显示答案';
  $('#memoHardBtn').classList.toggle('selectedMemo', st.status === 'hard');
  $('#memoKnownBtn').classList.toggle('selectedMemo', st.status === 'known');
}
function flipMemo() { memoFlipped = !memoFlipped; renderMemoCard(); }
function markMemo(status) {
  let c = memoSession[memoIdx]; if (!c) return;
  let st = memoStatus(c.id);
  S.memo[c.id] = { status, reviews: (st.reviews || 0) + 1, updatedAt: new Date().toISOString() };
  S.memoLast = { ids: memoSession.map(x => x.id), idx: memoIdx, title: S.memoLast?.title || '考点背诵' };
  save();
  toast(status === 'known' ? '已标记掌握' : '已标记生疏，下次优先复习');
  memoFlipped = false;
  renderMemoCard();
}
function memoNext() {
  if (memoIdx < memoSession.length - 1) { memoIdx++; memoFlipped = false; S.memoLast.idx = memoIdx; save(); renderMemoCard(); scrollTo(0,0); }
  else toast('本轮背诵完成');
}
function memoPrev() {
  if (memoIdx > 0) { memoIdx--; memoFlipped = false; S.memoLast.idx = memoIdx; save(); renderMemoCard(); scrollTo(0,0); }
}
function resumeMemo() {
  let map = new Map(memoCards().map(c => [c.id, c]));
  if (!S.memoLast?.ids?.length) return startMemo(memoCards().filter(c => memoStatus(c.id).status !== 'known'), '考点背诵');
  let arr = S.memoLast.ids.map(id => map.get(id)).filter(Boolean);
  if (!arr.length) return startMemo(memoCards(), '考点背诵');
  memoSession = arr; memoIdx = Math.min(S.memoLast.idx || 0, arr.length - 1); memoFlipped = false; view('memoPractice'); renderMemoCard();
}

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
$('#goMemoBtn').onclick = () => view('memo');
$('#practiceStartAll').onclick = () => startPractice(practiceCards().filter(c => practiceStatus(c.id).status !== 'known'), '实务·未掌握');
$('#practiceStartStar').onclick = () => startPractice(practiceCards().filter(c => c.star), '实务·★重点');
$('#practiceStartChapter').onclick = () => { const first = practiceCards()[0]?.chapter; startPractice(practiceCards().filter(c => c.chapter === first), first || '实务章节'); };
$('#swBackBtn').onclick = () => { if (swSession[swIdx]) S.shiwuLast = { paperId: swSession[swIdx].paperId, idx: swIdx }; save(); view('practiceMemo'); };
$('#swPrevBtn').onclick = swPrev;
$('#swNextBtn').onclick = swNext;
$('#swHardBtn').onclick = () => markShiwu('hard');
$('#swKnownBtn').onclick = () => markShiwu('known');
$('#pmBackBtn').onclick = () => { S.practiceLast = { ids: pmSession.map(x => x.id), idx: pmIdx, title: S.practiceLast?.title || '实务模板' }; save(); view('practiceMemo'); };
$('#pmFlipBtn').onclick = flipPractice;
$('#pmFlipBottomBtn').onclick = flipPractice;
$('#pmHardBtn').onclick = () => markPractice('hard');
$('#pmKnownBtn').onclick = () => markPractice('known');
$('#pmNextBtn').onclick = pmNext;
$('#pmPrevBtn').onclick = pmPrev;
$('#pmCard').onclick = e => { if (e.target.closest('.memoCard')) flipPractice(); };
$('#memoStartAll').onclick = () => startMemo(memoCards().filter(c => memoStatus(c.id).status !== 'known'), '新增考点·未掌握');
$('#memoStartWeak').onclick = () => startMemo(memoCards().filter(c => memoStatus(c.id).status === 'hard'), '新增考点·生疏');
$('#memoStartCore').onclick = () => startMemo(memoCards().filter(c => c.level === 'core'), '新增考点·总览');
$('#memoBackBtn').onclick = () => { S.memoLast = { ids: memoSession.map(x => x.id), idx: memoIdx, title: S.memoLast?.title || '考点背诵' }; save(); view('memo'); };
$('#memoFlipBtn').onclick = flipMemo;
$('#memoFlipBottomBtn').onclick = flipMemo;
$('#memoHardBtn').onclick = () => markMemo('hard');
$('#memoKnownBtn').onclick = () => markMemo('known');
$('#memoNextBtn').onclick = memoNext;
$('#memoPrevBtn').onclick = memoPrev;
$('#memoCard').onclick = e => { if (e.target.closest('.memoCard')) flipMemo(); };
$('#pointQuizMixed').onclick = () => start(POINT_QUIZ.paper.questions, POINT_QUIZ.paper.title, 'practice');
$('#pointQuizSingle').onclick = () => start(POINT_QUIZ.paper.questions.filter(q => q.type === 'single'), '新增考点·单选', 'practice');
$('#pointQuizMultiple').onclick = () => start(POINT_QUIZ.paper.questions.filter(q => q.type === 'multiple'), '新增考点·多选', 'practice');
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

try {
  document.body.classList.toggle('dark', S.dark);
  updateCountdown();
  updateHome();
  updateSyncUI();
  setInterval(updateCountdown, 60000);
  if (normalizeSyncCode(S.syncCode)) {
    cloudPull({ force: false }).catch(() => {});
  }
} catch (e) {
  console.error(e);
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = '页面启动失败：' + (e && e.message ? e.message : e);
    el.classList.add('show');
  }
}
