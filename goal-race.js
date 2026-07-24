(() => {
  const races = (window.__RACES_DATA__ || [])
    .filter(r => r.has_specific_date && r.date && !['ended','cancelled'].includes(r.status))
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));
  const select = document.getElementById('goalRaceSelect');
  const timeInput = document.getElementById('goalTimeInput');
  const saveButton = document.getElementById('saveGoalRace');
  if (!select || !timeInput || !saveButton) return;

  const KEY = 'xiaolaohu_goal_race_v1';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parseDate = s => new Date(String(s).replace(' ', 'T'));
  const fmtDate = d => `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;

  select.innerHTML = '<option value="">选择目标赛事</option>' + races.slice(0,120).map(r =>
    `<option value="${r.id}">${esc(String(r.date).slice(0,10))} · ${esc(r.title)}</option>`
  ).join('');

  function render(saved){
    const race = saved && races.find(r => String(r.id) === String(saved.id));
    if (!race) {
      document.getElementById('goalRaceName').textContent = '尚未设置目标赛事';
      document.getElementById('goalRaceDays').textContent = '—';
      document.getElementById('goalRaceMeta').textContent = '从赛事列表选择目标后，这里显示比赛日、目标成绩和倒计时。';
      document.getElementById('raceCycleProgress').style.width = '0%';
      return;
    }
    const target = parseDate(race.date);
    const now = new Date();
    now.setHours(0,0,0,0);
    const days = Math.max(0, Math.ceil((target - now) / 86400000));
    const cycleStart = new Date(target);
    cycleStart.setDate(cycleStart.getDate() - 112);
    const progress = Math.max(0, Math.min(100, (now - cycleStart) / (target - cycleStart) * 100));
    document.getElementById('goalRaceName').textContent = race.title;
    document.getElementById('goalRaceDays').textContent = days;
    document.getElementById('goalRaceMeta').innerHTML = `比赛日 ${fmtDate(target)}<br>目标成绩 ${esc(saved.goal || '待设定')} · ${esc(race.location || race.province || '')}`;
    document.getElementById('raceCycleProgress').style.width = `${progress}%`;
    select.value = String(race.id);
    timeInput.value = saved.goal || '2:35:00';
  }

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
  render(saved);
  saveButton.addEventListener('click', () => {
    if (!select.value) {
      localStorage.removeItem(KEY);
      render(null);
      return;
    }
    saved = {id: select.value, goal: timeInput.value.trim() || '待设定'};
    localStorage.setItem(KEY, JSON.stringify(saved));
    render(saved);
  });
})();
