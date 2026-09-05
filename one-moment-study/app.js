(()=>{
'use strict';
const C=window.FocusCore,KEY='one-moment-study-v1',SYNC_META_KEY='one-moment-sync-v1',SYNC_API='https://safety-exam-sync.a15221082942.workers.dev/api/state',$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=C.initial(),storageOK=true,corruptRaw=null,view='focus',reviewId=null,editingReview=false,toastHandle,wakeLock=null,audioCtx=null,lastDay=C.day(),alarm=null,alarmTimer=null,syncTimer=null,syncing=false;
let syncMeta={code:'',deviceId:'web-'+C.uid(),localUpdatedAt:null,cloudUpdatedAt:null,settingsUpdatedAt:null};
try{syncMeta={...syncMeta,...JSON.parse(localStorage.getItem(SYNC_META_KEY)||'{}')};}catch(e){}
function warning(text){$('#storageWarning').hidden=false;$('#storageWarning').textContent=text;}
try{const raw=localStorage.getItem(KEY);if(raw){try{data=C.validate(JSON.parse(raw));localStorage.setItem(KEY,JSON.stringify(data));}catch(e){corruptRaw=raw;storageOK=false;warning('旧数据读取失败，原数据未覆盖。可先在设置中导出原备份；本次操作暂不保存。');}}else{localStorage.setItem(KEY,JSON.stringify(data));}}catch(e){storageOK=false;warning('当前浏览器不允许本地保存。请勿关闭页面，并通过设置导出备份。');}
function save(opts={}){if(corruptRaw)return;try{localStorage.setItem(KEY,JSON.stringify(data));if(opts.touch!==false)syncMeta.localUpdatedAt=new Date().toISOString();localStorage.setItem(SYNC_META_KEY,JSON.stringify(syncMeta));storageOK=true;$('#storageWarning').hidden=true;if(!opts.skipCloud)scheduleCloudPush();}catch(e){storageOK=false;warning('本地保存失败或空间已满。当前记录仍在页面内，请立即导出备份。');}}
function toast(text){clearTimeout(toastHandle);$('#toast').textContent=text;$('#toast').hidden=false;toastHandle=setTimeout(()=>$('#toast').hidden=true,4000);}
function fmt(seconds){const s=Math.max(0,Math.ceil(seconds));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function time(t){return new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});}
function minutes(s){return s<60&&s>0?'<1':Math.floor(s/60).toLocaleString('zh-CN');}
function dateLabel(){const now=new Date();$('#dateLabel').textContent=`${now.getFullYear()} / ${String(now.getMonth()+1).padStart(2,'0')} / ${String(now.getDate()).padStart(2,'0')} · ${['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][now.getDay()]}`;}
function renderTimer(){
 const t=data.timer,sec=C.remaining(data)/1000,running=t.status==='running';
 $('#clock').textContent=fmt(sec);document.title=(t.status==='idle'?'':fmt(sec)+' · ')+'一刻 · 番茄学习助手';
 $('#progressRing').style.strokeDashoffset=String(804.248*(1-C.remaining(data)/t.durationMs));
 $('#progressRing').style.stroke=t.phase==='focus'?'var(--accent)':'var(--green)';
 $('#statusTag').textContent=running?(t.phase==='focus'?'正在专注':'好好休息'):t.status==='paused'?'已暂停':'准备开始';$('#statusTag').className='status-tag '+t.status;
 const names={focus:'专注',short:'短休息',long:'长休息'};
 $('#phaseCaption').textContent={focus:'FOCUS TIME',short:'TAKE A BREATH',long:'REST & RECHARGE'}[t.phase];
 $('#finishTime').textContent=running?`预计 ${time(t.endAt)} ${t.phase==='focus'?'完成本轮':'休息结束'}`:t.status==='paused'?'已经暂停，按自己的节奏回来':t.phase==='focus'?'给自己一个不被打扰的番茄':'离开屏幕，喝水、起身走走';
 $('#cycleDots').innerHTML=Array.from({length:data.settings.cycles},(_,i)=>`<span class="${i<data.cycle?'filled':i===data.cycle&&t.phase==='focus'?'current':''}"></span>`).join('');
 $('#cycleDots').setAttribute('aria-label',`本组已完成 ${data.cycle} 个，共 ${data.settings.cycles} 个番茄`);
 $$('[data-phase]').forEach(b=>{b.classList.toggle('active',b.dataset.phase===t.phase);b.setAttribute('aria-pressed',b.dataset.phase===t.phase?'true':'false');});
 const task=data.tasks.find(x=>x.id===data.selectedTaskId&&!x.done);
 $('#currentTask').textContent=t.phase!=='focus'?'休息也是学习的一部分':t.status!=='idle'?t.taskTitle:task?task.title:'自由专注 · 也可以先选一个任务';
 $('#toggleTimer').innerHTML=icon(running?'pause':'play')+`<span>${running?'暂停':t.status==='paused'?'继续'+names[t.phase]:'开始'+names[t.phase]}</span>`;
 $('#resetTimer').disabled=t.status==='idle';
 $('#skipTimer').disabled=t.status==='idle';
 $('#runtimeNote').textContent=(wakeLock?'屏幕常亮中 · ':'')+(data.settings.sound?(data.settings.alarmRepeat?'到点反复提醒，点确认才停':'到时前台提示音'):'提示音已关闭')+' · 每轮手动开始，不连续空跑';
}
function renderTasks(){
 const active=data.tasks.filter(t=>!t.done).length;$('#taskCount').textContent=`${active} 项待完成`;$('#quickTasks').hidden=data.tasks.length>0;
 $('#taskList').innerHTML=data.tasks.length?[...data.tasks].sort((a,b)=>Number(a.done)-Number(b.done)).map(t=>{
 const count=data.sessions.filter(s=>s.taskId===t.id&&s.completed).length;const selected=t.id===data.selectedTaskId&&!t.done;
 return `<div class="task-row ${selected?'selected':''} ${t.done?'done':''}"><button class="task-check" data-done="${esc(t.id)}" aria-label="${t.done?'重新打开':'标记完成'}：${esc(t.title)}" aria-pressed="${t.done}">${t.done?icon('check'):''}</button><button class="task-main" data-select="${esc(t.id)}" aria-pressed="${selected}" ${t.done?'disabled':''}><strong>${esc(t.title)}</strong><small>${esc(t.subject)} · ${count} / ${t.target} 个番茄${selected?' · 已选中':''}</small></button><button class="task-delete" data-delete="${esc(t.id)}" aria-label="删除任务：${esc(t.title)}">${icon('close')}</button></div>`;
 }).join(''):'<div class="empty-task"><strong>不列长清单，先选一件小事。</strong><p>比如“复盘 10 道错题”，比“今晚好好学习”更容易开始。</p></div>';
}
function renderStats(){
 const s=C.stats(data),goal=data.settings.goal;$('#todayCount').textContent=s.count;$('#todayMinutes').textContent=minutes(s.seconds);$('#streakCount').textContent=C.streak(data);$('#goalLabel').textContent=`目标 ${goal} 个`;$('#goalFill').style.width=Math.min(100,s.count/goal*100)+'%';
 $('#goalMessage').textContent=s.count>=goal?'今天的目标已完成。可以安心收工，也可以继续一点。':s.count?`已完成 ${s.count} 个，还差 ${goal-s.count} 个。一个一个来。`:'先完成第一个，不必一口气做完。';
 const t=data.timer;let coach=t.phase==='focus'?'开始前，先定一个能说清的结果：\n“这 '+data.settings.focus+' 分钟，我要弄懂什么？”':'休息不是换个软件接着刷。\n站起来，看远处，让注意力恢复一下。';
 const last=[...data.sessions].reverse().find(s=>s.taskId===data.selectedTaskId&&s.nextStep);
 if(t.phase==='focus'&&last)coach='上一次给自己留的接力棒：\n'+last.nextStep;
 $('#coachMessage').textContent=coach;$('#coachMessage').style.whiteSpace='pre-wrap';
}
function hoursText(seconds){const h=C.hours(seconds);return Number.isInteger(h)?String(h):h.toFixed(1);}
function renderReport(){
 const all=data.sessions;$('#allCount').innerHTML=all.filter(s=>s.completed).length+'<small> 个番茄</small>';$('#allMinutes').innerHTML=minutes(all.reduce((a,s)=>a+s.seconds,0))+'<small> 分钟</small>';$('#allDays').innerHTML=new Set(all.map(s=>s.date)).size+'<small> 天</small>';
 const left=C.daysUntil(data.settings.examDate);$('#examCountdown').textContent=left==null?'距考试 —':left>0?`距考试 ${left} 天`:left===0?'今天考试':'考试已过';
 $('#cycleRange').textContent=`从 ${data.settings.cycleStart.replace(/-/g,'/')} 累计到今天。休息时间不计入。`;
 const subjects=C.subjectStats(data,data.settings.cycleStart,C.day());
 $('#subjectHours').innerHTML=subjects.map(s=>`<div class="subject-item"><b>${esc(s.short)}</b><strong>${hoursText(s.seconds)}<em> 小时</em></strong><span>${s.count} 个完整番茄 · ${minutes(s.seconds)} 分钟</span></div>`).join('');
 const w=C.week(data),max=Math.max(1500,...w.map(x=>x.seconds));$('#weekTotal').textContent=minutes(w.reduce((a,s)=>a+s.seconds,0))+' 分钟';
 $('#weekChart').innerHTML=w.map(s=>`<div class="chart-column" aria-label="${s.date} 专注 ${minutes(s.seconds)} 分钟"><div class="chart-space"><span class="chart-value">${minutes(s.seconds)}</span><div class="chart-bar" style="height:${Math.max(2,s.seconds/max*105)}px"></div></div><span class="chart-label">${s.date===C.day()?'今天':s.date.slice(5).replace('-','/')}</span></div>`).join('');
 const filter=$('#historyFilter').value,filtered=[...all].reverse().filter(s=>filter==='all'||filter==='today'&&s.date===C.day()||filter==='week'&&s.date>=C.shiftDay(C.day(),-6)&&s.date<=C.day());
 $('#historyList').innerHTML=filtered.length?filtered.slice(0,200).map(s=>`<article class="history-item"><div class="history-top"><strong>${esc(s.taskTitle)}</strong><span>${minutes(s.seconds)} 分钟</span></div><div class="history-meta">${esc(s.date.slice(5).replace('-','/'))} ${time(s.endedAt)} · ${esc(s.subject)} · ${s.completed?'完整番茄':'提前结束，不计番茄'}</div>${s.note?`<p class="history-note">${esc(s.note)}</p>`:''}${s.nextStep?`<p class="history-next">下次继续：${esc(s.nextStep)}</p>`:''}<button class="history-edit" data-review="${esc(s.id)}">${s.note||s.nextStep?'编辑复盘':'补写学习收获'} ↗</button></article>`).join('')+(filtered.length>200?'<p class="micro-copy">此处显示最近 200 条，完整记录可导出备份。</p>':''):'<p class="empty-state">还没有这一时段的记录。<br>开始一个番茄，留下今天的第一步。</p>';
 $('#distractionList').innerHTML=data.distractions.length?[...data.distractions].reverse().map(x=>`<div class="distraction-row"><div><p>${esc(x.text)}</p><small>${C.day(x.createdAt).slice(5)} ${time(x.createdAt)}</small></div><button data-distraction-done="${esc(x.id)}" aria-label="处理完成并移除：${esc(x.text)}">${icon('check')}</button></div>`).join(''):'<p class="empty-state">暂时没有被打断的念头。<br>想到了就记在这里，休息时再处理。</p>';
}
function render(){dateLabel();renderTimer();renderStats();renderTasks();if(view==='report')renderReport();}
function show(dialog){if(!dialog.open)dialog.showModal();}
function ask(title,text){return new Promise(resolve=>{const d=$('#confirmDialog');$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;let done=false;const settle=value=>{if(done)return;done=true;d.close();d.removeEventListener('cancel',cancel);resolve(value);};const cancel=e=>{e.preventDefault();settle(false);};$('#confirmYes').onclick=()=>settle(true);$('#confirmNo').onclick=()=>settle(false);d.addEventListener('cancel',cancel);show(d);});}
function unlockAudio(){try{if(!audioCtx){const A=window.AudioContext||window.webkitAudioContext;if(A)audioCtx=new A();}if(audioCtx?.state==='suspended')audioCtx.resume().catch(()=>{});}catch(e){}}
function chime(){if(!data.settings.sound)return;try{unlockAudio();if(!audioCtx)return;const seq=[[880,.18],[660,.16],[990,.22]];seq.forEach(([f,vol],i)=>{const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type='sine';o.frequency.value=f;o.connect(g);g.connect(audioCtx.destination);const at=audioCtx.currentTime+i*.22;g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(vol,at+.02);g.gain.exponentialRampToValueAtTime(.001,at+.55);o.start(at);o.stop(at+.58);});if(navigator.vibrate)navigator.vibrate([180,80,180]);}catch(e){}}
function stopAlarm(){if(alarmTimer){clearInterval(alarmTimer);alarmTimer=null;}alarm=null;const d=$('#alarmDialog');if(d.open)d.close();}
function notifyAlarm(kind){if(!data.settings.notify||typeof Notification==='undefined'||Notification.permission!=='granted'||!document.hidden)return;try{new Notification(kind==='focus'?'专注结束，该休息了':'休息结束，准备下一轮',{body:'打开一刻，点确认后开始下一阶段。',tag:'one-moment-alarm',renotify:true});}catch(e){}}
function startAlarm(kind){
 stopAlarm();
 alarm={kind};
 const titles={focus:'专注到点了。',short:'短休息结束。',long:'长休息结束。'};
 $('#alarmTitle').textContent=titles[kind]||'到点了。';
 $('#alarmEyebrow').textContent=kind==='focus'?'FOCUS DONE':'BREAK OVER';
 $('#alarmText').textContent=kind==='focus'?'先离开屏幕。点确认后，再开始休息。':'准备好了，点确认再开始下一轮。不要让它自己空跑。';
 show($('#alarmDialog'));
 chime();notifyAlarm(kind);
 if(data.settings.alarmRepeat)alarmTimer=setInterval(()=>{if(document.hidden&&!data.settings.notify)return;chime();notifyAlarm(kind);},8000);
}
async function syncWake(){
 const should=data.settings.wake&&data.timer.status==='running'&&!document.hidden;
 if(!should&&wakeLock){await wakeLock.release().catch(()=>{});wakeLock=null;}
 if(should&&!wakeLock&&navigator.wakeLock){try{wakeLock=await navigator.wakeLock.request('screen');wakeLock.addEventListener('release',()=>{wakeLock=null;renderTimer();});}catch(e){}}
 renderTimer();
}
function openReview(id,editing=false){const s=data.sessions.find(x=>x.id===id);if(!s)return;reviewId=id;editingReview=editing;$('#reviewHeading').textContent=editing?'把这一步记下来。':'一个番茄，完成了。';$('#reviewEyebrow').textContent=editing?'LEARNING NOTES':'ONE MORE STEP';$('#reviewSummary').textContent=`${s.taskTitle} · ${minutes(s.seconds)} 分钟${editing?'':'，接下来休息 '+data.settings[data.timer.phase]+' 分钟。'}`;$('#reviewNote').value=s.note;$('#reviewNext').value=s.nextStep;$('#reviewContinue').textContent=editing?'保存复盘':'保存并开始休息';show($('#reviewDialog'));}
function settled(result,notify=true){if(!result)return;save();render();syncWake();if(notify)startAlarm(result.phase);if(result.sessionId&&!$('#alarmDialog').open)openReview(result.sessionId);else if(!result.sessionId&&!notify)toast('休息结束。准备好了，再开始下一个番茄。');}
function tick(){const r=C.finish(data);if(r)settled(r);else renderTimer();if(lastDay!==C.day()){lastDay=C.day();render();}}
$('#toggleTimer').addEventListener('click',()=>{unlockAudio();const r=C.finish(data);if(r){settled(r);return;}if(data.timer.status==='running')C.pause(data);else C.start(data);save();render();syncWake();});
$('#resetTimer').addEventListener('click',async()=>{if(await ask('重新开始这一轮？','重置会丢弃本轮未完成时间，不影响之前的记录。')){const r=C.finish(data);if(r){settled(r);return;}C.reset(data);save();render();syncWake();toast('本轮已重置');}});
$('.brand').addEventListener('click',e=>e.preventDefault());
$('#skipTimer').addEventListener('click',async()=>{const t=data.timer;if(t.status==='idle')return;if(!await ask(t.phase==='focus'?'提前结束这一轮？':'结束这次休息？',t.phase==='focus'?'已学习的时间会保留，但不算一个完整番茄。':'接下来回到专注阶段，等你手动开始。'))return;const r=C.finish(data);if(r){settled(r);return;}C.skip(data);save();render();syncWake();toast(data.timer.phase==='focus'?'准备好了，再开始下一轮。':'先休息一下，已保留实际专注时长。');});
$$('[data-phase]').forEach(b=>b.addEventListener('click',async()=>{if(b.dataset.phase===data.timer.phase)return;if(data.timer.status!=='idle'&&!await ask('切换计时模式？','本轮专注按实际时长保存，不计完整番茄。'))return;const r=C.finish(data);if(r){settled(r);return;}C.setPhase(data,b.dataset.phase);save();render();syncWake();}));
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;$$('[data-view]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b));});$('#focusView').hidden=view!=='focus';$('#reportView').hidden=view!=='report';if(view==='report')renderReport();}));
$('#historyFilter').addEventListener('change',renderReport);
$('#zenToggle').addEventListener('click',()=>{const on=document.body.classList.toggle('zen');$('#zenToggle').textContent=on?'退出极简':'极简模式';window.scrollTo(0,0);});
$('#taskForm').addEventListener('submit',e=>{e.preventDefault();try{C.addTask(data,$('#taskTitle').value,$('#taskSubject').value,Number($('#taskTarget').value));$('#taskTitle').value='';save();render();toast('任务已加入清单');}catch(err){toast(err.message);}});
$$('[data-example]').forEach(b=>b.addEventListener('click',()=>{$('#taskTitle').value=b.dataset.example;$('#taskTitle').focus();}));
$('#taskList').addEventListener('click',async e=>{
 const select=e.target.closest('[data-select]'),done=e.target.closest('[data-done]'),del=e.target.closest('[data-delete]');
 if(select){data.selectedTaskId=select.dataset.select;save();render();if(data.timer.status!=='idle')toast('已选中，将用于下一轮；当前一轮保持原任务。');}
 if(done){const t=data.tasks.find(x=>x.id===done.dataset.done);if(!t)return;t.done=!t.done;t.updatedAt=Date.now();if(t.done&&data.selectedTaskId===t.id)data.selectedTaskId=data.tasks.find(x=>!x.done)?.id||null;else if(!t.done&&!data.selectedTaskId)data.selectedTaskId=t.id;save();render();}
 if(del&&await ask('删除这项任务？','仅删除清单任务，已完成的学习记录仍会保留。')){const id=del.dataset.delete;data.deletedTaskIds=[...new Set([...(data.deletedTaskIds||[]),id])].slice(-1000);data.tasks=data.tasks.filter(x=>x.id!==id);if(data.selectedTaskId===id)data.selectedTaskId=data.tasks.find(x=>!x.done)?.id||null;save();render();}
});
function normalizeSyncCode(code){return String(code||'').trim().replace(/\s+/g,'');}
function persistSyncMeta(){try{localStorage.setItem(SYNC_META_KEY,JSON.stringify(syncMeta));}catch(e){}}
function syncCodeId(code){return crypto.subtle.digest('SHA-256',new TextEncoder().encode('one-moment-id:'+code)).then(b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,40));}
function b64(bytes){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
function unb64(s){const x=atob(s),out=new Uint8Array(x.length);for(let i=0;i<x.length;i++)out[i]=x.charCodeAt(i);return out;}
async function deriveSyncKey(code,salt){const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(code),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encryptCloud(payload,code){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await deriveSyncKey(code,salt),plain=new TextEncoder().encode(JSON.stringify(payload)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);return {app:'one-moment-study',v:1,alg:'PBKDF2-AES-GCM',salt:b64(salt),iv:b64(iv),cipher:b64(new Uint8Array(cipher))};}
async function decryptCloud(envelope,code){if(!envelope||envelope.app!=='one-moment-study'||envelope.v!==1)throw Error('云端内容不是一刻同步数据');const salt=unb64(envelope.salt),iv=unb64(envelope.iv),key=await deriveSyncKey(code,salt),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,unb64(envelope.cipher));return JSON.parse(new TextDecoder().decode(plain));}
function cloudState(){return {version:1,settings:data.settings,tasks:data.tasks,sessions:data.sessions,distractions:data.distractions,deletedTaskIds:data.deletedTaskIds||[],deletedDistractionIds:data.deletedDistractionIds||[]};}
function byLatest(local,remote,stamp){const map=new Map();for(const x of [...(local||[]),...(remote||[])]){if(!x?.id)continue;const old=map.get(x.id);if(!old||Number(x[stamp]||0)>=Number(old[stamp]||0))map.set(x.id,x);}return [...map.values()];}
function mergeCloud(remote,remoteMeta={}){
 if(!remote||remote.version!==1)throw Error('云端数据版本不支持');
 const oldTimer=data.timer,oldSelected=data.selectedTaskId,oldPending=data.pendingReview;
 const deletedTasks=[...new Set([...(data.deletedTaskIds||[]),...(remote.deletedTaskIds||[])])];
 const deletedDistractions=[...new Set([...(data.deletedDistractionIds||[]),...(remote.deletedDistractionIds||[])])];
 const localSettingsTs=Date.parse(syncMeta.settingsUpdatedAt||syncMeta.localUpdatedAt||0)||0,remoteSettingsTs=Date.parse(remoteMeta.settingsUpdatedAt||remoteMeta.localUpdatedAt||0)||0;
 const merged={...data,settings:remoteSettingsTs>localSettingsTs?remote.settings:data.settings,tasks:byLatest(data.tasks,remote.tasks,'updatedAt').filter(x=>!deletedTasks.includes(x.id)),sessions:byLatest(data.sessions,remote.sessions,'updatedAt'),distractions:byLatest(data.distractions,remote.distractions,'updatedAt').filter(x=>!deletedDistractions.includes(x.id)),deletedTaskIds:deletedTasks.slice(-1000),deletedDistractionIds:deletedDistractions.slice(-3000)};
 merged.timer=oldTimer;merged.cycle=(merged.cycle||0)%merged.settings.cycles;merged.selectedTaskId=merged.tasks.some(x=>x.id===oldSelected&&!x.done)?oldSelected:(merged.tasks.find(x=>!x.done)?.id||null);merged.pendingReview=oldPending;
 data=C.validate(merged);
 if(remoteSettingsTs>localSettingsTs)syncMeta.settingsUpdatedAt=remoteMeta.settingsUpdatedAt||remoteMeta.localUpdatedAt;
 return true;
}
function updateSyncUI(text){const status=$('#syncStatus'),input=$('#syncCodeInput');if(input&&document.activeElement!==input)input.value=syncMeta.code||'';if(!status)return;if(text){status.textContent=text;return;}if(!syncMeta.code){status.textContent='未设置同步码 · 当前仅保存在本机';return;}const t=syncMeta.cloudUpdatedAt?new Date(syncMeta.cloudUpdatedAt).toLocaleString('zh-CN',{hour12:false}):'尚未完成首次上传';status.textContent=`已启用 · 云端 ${t}`;}
function scheduleCloudPush(){if(!normalizeSyncCode(syncMeta.code)||corruptRaw)return;if(syncTimer)clearTimeout(syncTimer);syncTimer=setTimeout(()=>cloudSync('auto').catch(()=>{}),1500);}
async function fetchCloud(code){const id=await syncCodeId(code),res=await fetch(SYNC_API+'?code='+encodeURIComponent('om-'+id));const body=await res.json().catch(()=>({}));if(!res.ok||!body.ok)throw Error(body.error||('HTTP '+res.status));return body;}
async function putCloud(code,envelope){const id=await syncCodeId(code),res=await fetch(SYNC_API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:'om-'+id,state:envelope,device:syncMeta.deviceId})}),body=await res.json().catch(()=>({}));if(!res.ok||!body.ok)throw Error(body.error||('HTTP '+res.status));return body;}
async function cloudSync(mode='manual'){
 const code=normalizeSyncCode(syncMeta.code);if(!code||syncing)return null;if(!crypto?.subtle)throw Error('当前浏览器不支持加密同步');
 syncing=true;if(syncTimer){clearTimeout(syncTimer);syncTimer=null;}updateSyncUI('正在加密并合并云端历史…');
 try{
  const remote=await fetchCloud(code);
  if(remote.exists&&remote.state){let payload;try{payload=await decryptCloud(remote.state,code);}catch(e){throw Error('同步码不正确，或云端数据无法解密');}mergeCloud(payload.state,payload.meta||{});}
  const now=new Date().toISOString(),payload={state:cloudState(),meta:{localUpdatedAt:syncMeta.localUpdatedAt||now,settingsUpdatedAt:syncMeta.settingsUpdatedAt||syncMeta.localUpdatedAt||now}};
  const result=await putCloud(code,await encryptCloud(payload,code));
  syncMeta.cloudUpdatedAt=result.updatedAt||now;syncMeta.localUpdatedAt=syncMeta.cloudUpdatedAt;persistSyncMeta();localStorage.setItem(KEY,JSON.stringify(data));render();updateSyncUI();if(mode==='manual')toast(remote.exists?'同步完成，历史已合并':'云端空间已建立');return result;
 }catch(e){updateSyncUI('同步失败 · '+e.message);if(mode==='manual')toast(e.message);throw e;}finally{syncing=false;}
}
async function saveSyncCode(){const code=normalizeSyncCode($('#syncCodeInput').value);if(code&&code.length<8)return toast('同步码至少 8 位；建议使用生成的强同步码');if(code.length>64)return toast('同步码最多 64 位');if(!code){syncMeta.code='';syncMeta.cloudUpdatedAt=null;persistSyncMeta();updateSyncUI();toast('已关闭云同步，本机数据仍保留');return;}syncMeta.code=code;persistSyncMeta();updateSyncUI('同步码已保存，正在连接云端…');await cloudSync('manual').catch(()=>{});}
function generateSyncCode(){const bytes=crypto.getRandomValues(new Uint8Array(12)),parts=[];for(let i=0;i<bytes.length;i+=3)parts.push([...bytes.slice(i,i+3)].map(x=>x.toString(36).padStart(2,'0')).join(''));const code='om-'+parts.join('-');$('#syncCodeInput').value=code;$('#syncCodeInput').type='text';toast('已生成强同步码。请保存，并在其他设备填同一个。');}
function openSettings(){const f=$('#settingsForm');for(const [k,v]of Object.entries(data.settings)){if(typeof v==='boolean')f.elements[k].checked=v;else f.elements[k].value=v;}$$('[data-preset]').forEach(x=>x.classList.remove('active'));updateSyncUI();show($('#settingsDialog'));}
$('#settingsOpen').addEventListener('click',openSettings);$('#rhythmOpen').addEventListener('click',openSettings);
$('#saveSyncCodeBtn').addEventListener('click',saveSyncCode);$('#syncNowBtn').addEventListener('click',()=>cloudSync('manual').catch(()=>{}));$('#generateSyncCodeBtn').addEventListener('click',generateSyncCode);$('#showSyncCodeBtn').addEventListener('click',()=>{$('#syncCodeInput').type=$('#syncCodeInput').type==='password'?'text':'password';});$('#syncCodeInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveSyncCode();}});
$$('[data-preset]').forEach(b=>b.addEventListener('click',()=>{const p={practice:[25,5,15],lesson:[45,10,20],memory:[20,5,15]}[b.dataset.preset],f=$('#settingsForm');['focus','short','long'].forEach((k,i)=>f.elements[k].value=p[i]);$$('[data-preset]').forEach(x=>x.classList.toggle('active',x===b));}));
$('#settingsForm').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,patch={};['focus','short','long','cycles','goal'].forEach(k=>patch[k]=Number(f.elements[k].value));['sound','wake','notify','alarmRepeat'].forEach(k=>patch[k]=f.elements[k].checked);patch.examDate=f.elements.examDate.value;patch.cycleStart=f.elements.cycleStart.value;try{if(patch.notify&&typeof Notification!=='undefined'&&Notification.permission==='default'){const p=await Notification.requestPermission();if(p!=='granted')patch.notify=false;}C.configure(data,patch);syncMeta.settingsUpdatedAt=new Date().toISOString();save();$('#settingsDialog').close();render();syncWake();let msg='设置已保存';if(patch.wake&&!navigator.wakeLock)msg='设置已保存；此浏览器不支持保持常亮。';if(patch.notify&&(typeof Notification==='undefined'||Notification.permission!=='granted'))msg='设置已保存；系统通知未授权，到点仍靠页面声音。';toast(msg);}catch(err){toast(err.message);}});
$('#alarmAck').addEventListener('click',()=>{const kind=alarm?.kind;stopAlarm();if(kind==='focus'&&data.pendingReview)openReview(data.pendingReview);else toast(kind==='focus'?'先休息，再开始下一轮。':'准备好了，再开始下一个番茄。');});
$('#alarmDialog').addEventListener('cancel',e=>{e.preventDefault();});
$$('dialog').forEach(d=>{if(d.id==='alarmDialog')d.addEventListener('click',e=>e.stopPropagation());});
$$('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(d.id==='confirmDialog'||d.id==='alarmDialog'||e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
function saveReview(startBreak){const s=data.sessions.find(x=>x.id===reviewId);if(!s)return;s.note=$('#reviewNote').value.trim();s.nextStep=$('#reviewNext').value.trim();s.updatedAt=Date.now();if(data.pendingReview===s.id)data.pendingReview=null;save();$('#reviewDialog').close();if(startBreak&&!editingReview&&data.timer.phase!=='focus'&&data.timer.status==='idle'){unlockAudio();C.start(data);save();syncWake();}render();toast('学习收获已保存');}
$('#reviewForm').addEventListener('submit',e=>{e.preventDefault();saveReview(true);});$('#reviewOnly').addEventListener('click',()=>saveReview(false));
$('#reviewDialog').addEventListener('close',()=>{if(data.pendingReview===reviewId){data.pendingReview=null;save();}});
$('#historyList').addEventListener('click',e=>{const b=e.target.closest('[data-review]');if(b)openReview(b.dataset.review,true);});
$('#distractionOpen').addEventListener('click',()=>{show($('#distractionDialog'));$('#distractionText').focus();});
$('#distractionForm').addEventListener('submit',e=>{e.preventDefault();const text=$('#distractionText').value.trim();if(!text){toast('先写下一个念头');return;}if(data.distractions.length>=1000){toast('收纳盒满了，请先处理一些念头');return;}data.distractions.push({id:C.uid(),text,createdAt:Date.now(),updatedAt:Date.now()});$('#distractionText').value='';save();$('#distractionDialog').close();toast('已经收好，回到眼前这件事。');});
$('#distractionList').addEventListener('click',e=>{const b=e.target.closest('[data-distraction-done]');if(!b)return;const id=b.dataset.distractionDone;data.deletedDistractionIds=[...new Set([...(data.deletedDistractionIds||[]),id])].slice(-3000);data.distractions=data.distractions.filter(x=>x.id!==id);save();renderReport();toast('处理完一件小事');});
async function exportData(){
 const text=corruptRaw||JSON.stringify(data,null,2),name=`one-moment-${C.day()}${corruptRaw?'-original':''}.json`,blob=new Blob([text],{type:'application/json'});
 try{const file=new File([blob],name,{type:'application/json'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'一刻学习数据备份'});return;}}catch(e){if(e.name==='AbortError')return;}
 const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('已请求导出备份；请在下载或分享面板保存文件。');
}
$('#exportReport').addEventListener('click',exportData);$('#exportSettings').addEventListener('click',exportData);$('#importButton').addEventListener('click',()=>$('#importFile').click());
$('#importFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>15*1024*1024)throw Error('备份超过 15MB，请检查文件');const candidate=C.validate(JSON.parse(await file.text()));if(!await ask('用备份替换当前数据？',`将载入 ${candidate.tasks.length} 个任务、${candidate.sessions.length} 条学习记录。当前数据会被替换，建议先导出留底。`))return;data=candidate;corruptRaw=null;save();$('#settingsDialog').close();const r=C.finish(data);if(r)settled(r,false);else{render();syncWake();}toast(storageOK?'备份已恢复':'已载入，但本地保存失败，请保留备份');}catch(err){toast('无法恢复：'+(err instanceof SyntaxError?'不是有效的 JSON 备份':err.message));}finally{e.target.value='';}});
window.addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;try{data=C.validate(JSON.parse(e.newValue));render();syncWake();}catch(err){toast('另一个窗口的数据格式异常，未载入。');}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){tick();render();syncWake();}else syncWake();});
window.addEventListener('pageshow',()=>{tick();render();if(syncMeta.code)cloudSync('auto').catch(()=>{});});
window.addEventListener('online',()=>{if(syncMeta.code)cloudSync('auto').catch(()=>{});});
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(e.target.tagName)&&!$('dialog[open]')){e.preventDefault();$('#toggleTimer').click();}if(e.key==='Escape'&&document.body.classList.contains('zen')&&!$('dialog[open]'))$('#zenToggle').click();});
render();updateSyncUI();const restored=C.finish(data);if(restored)settled(restored);else if(data.pendingReview)startAlarm('focus');syncWake();if(syncMeta.code)cloudSync('auto').catch(()=>{});setInterval(tick,500);
})();
