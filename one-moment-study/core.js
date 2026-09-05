/* One Moment / local-first study timer. No external services. */
(function(root){
'use strict';
const PHASES=['focus','short','long'];
const SUBJECTS=['安全管理','安全技术','安全实务','安全法规','其他'];
const SUBJECT_SHORT={安全管理:'管理',安全技术:'技术',安全实务:'实务',安全法规:'法规',其他:'其他'};
const uid=()=>globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
const day=(t=Date.now())=>{const d=new Date(t);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const shiftDay=(key,n)=>{const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+n);return day(d.getTime());};
const isDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(new Date(s+'T12:00:00').getTime());
function defaultSettings(){return {focus:25,short:5,long:15,cycles:4,goal:4,sound:true,wake:false,notify:true,alarmRepeat:true,examDate:'2026-10-26',cycleStart:day()};}
function makeTimer(d,phase='focus'){return {phase,status:'idle',durationMs:d.settings[phase]*60000,remainingMs:d.settings[phase]*60000,endAt:null,startedAt:null,sessionId:null,taskId:null,taskTitle:'自由专注',subject:'其他'};}
function initial(){const d={version:1,settings:defaultSettings(),tasks:[],selectedTaskId:null,sessions:[],distractions:[],cycle:0,pendingReview:null};d.timer=makeTimer(d);return d;}
function remaining(d,now=Date.now()){const t=d.timer;return Math.min(t.durationMs,Math.max(0,t.status==='running'?t.endAt-now:t.remainingMs));}
function start(d,now=Date.now()){
 const t=d.timer;if(t.status==='running')return;
 if(t.status==='idle'){const task=d.tasks.find(x=>x.id===d.selectedTaskId&&!x.done);t.startedAt=now;t.sessionId=uid();t.taskId=task?.id||null;t.taskTitle=task?.title||'自由专注';t.subject=task?.subject||'其他';}
 t.endAt=now+t.remainingMs;t.status='running';
}
function pause(d,now=Date.now()){if(d.timer.status!=='running')return;d.timer.remainingMs=remaining(d,now);d.timer.status='paused';d.timer.endAt=null;}
function record(d,completed,now){
 const t=d.timer;if(t.phase!=='focus'||!t.sessionId)return null;
 const seconds=completed?Math.round(t.durationMs/1000):Math.floor((t.durationMs-remaining(d,now))/1000);
 if(seconds<1)return null;
 const existing=d.sessions.find(x=>x.id===t.sessionId);if(existing)return existing;
 const s={id:t.sessionId,completed,seconds,startedAt:t.startedAt,endedAt:now,date:day(now),taskId:t.taskId,taskTitle:t.taskTitle,subject:t.subject,note:'',nextStep:''};
 d.sessions.push(s);return s;
}
function nextPhase(d,completed){if(d.timer.phase!=='focus')return 'focus';if(completed)d.cycle=(d.cycle+1)%d.settings.cycles;return completed&&d.cycle===0?'long':'short';}
function finish(d,now=Date.now()){
 const t=d.timer;if(t.status!=='running'||remaining(d,now)>0)return null;
 const phase=t.phase;const s=record(d,true,t.endAt);const next=nextPhase(d,true);d.timer=makeTimer(d,next);
 if(s)d.pendingReview=s.id;return {phase,sessionId:s?.id||null,next};
}
function skip(d,now=Date.now()){if(d.timer.status==='idle')return;record(d,false,now);const p=nextPhase(d,false);d.timer=makeTimer(d,p);}
function reset(d){d.timer=makeTimer(d,d.timer.phase);}
function setPhase(d,phase,now=Date.now()){if(!PHASES.includes(phase))throw Error('计时模式无效');if(d.timer.phase===phase)return;record(d,false,now);d.timer=makeTimer(d,phase);}
function configure(d,patch){
 const ranges={focus:[1,120],short:[1,30],long:[1,60],cycles:[2,8],goal:[1,20]};
 const flags=['sound','wake','notify','alarmRepeat'];
 for(const [k,v] of Object.entries(patch)){
  if(k in ranges){const [lo,hi]=ranges[k];if(!Number.isInteger(v)||v<lo||v>hi)throw Error('请填写范围内的整数');}
  else if(flags.includes(k)){if(typeof v!=='boolean')throw Error('设置格式不正确');}
  else if(k==='examDate'||k==='cycleStart'){if(!isDate(v))throw Error('日期格式应为 YYYY-MM-DD');}
  else throw Error('未知设置');
 }
 Object.assign(d.settings,patch);d.cycle=d.cycle%d.settings.cycles;if(d.timer.status==='idle')d.timer=makeTimer(d,d.timer.phase);
}
function addTask(d,title,subject='其他',target=1){title=String(title).trim();if(!title||title.length>120)throw Error('任务填写 1–120 个字');if(!SUBJECTS.includes(subject))throw Error('请选择管理、技术、实务等科目');if(d.tasks.length>=300)throw Error('清单已满，请先删除不需要的任务');if(!Number.isInteger(target)||target<1||target>20)throw Error('预计番茄数须为 1–20');const task={id:uid(),title,subject,target,done:false,createdAt:Date.now()};d.tasks.push(task);if(!d.selectedTaskId)d.selectedTaskId=task.id;return task;}
function stats(d,date=day()){
 const list=d.sessions.filter(s=>s.date===date);return {count:list.filter(s=>s.completed).length,seconds:list.reduce((a,s)=>a+s.seconds,0),list};
}
function streak(d,today=day()){const days=new Set(d.sessions.filter(s=>s.completed).map(s=>s.date));let key=days.has(today)?today:shiftDay(today,-1),n=0;while(days.has(key)){n++;key=shiftDay(key,-1);}return n;}
function week(d,today=day()){return Array.from({length:7},(_,i)=>{const date=shiftDay(today,i-6);return {date,...stats(d,date)};});}
function hours(seconds){return Math.round(seconds/360)/10;}
function daysUntil(date,today=day()){if(!isDate(date))return null;return Math.round((new Date(date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);}
function subjectStats(d,from,to){
 const map=Object.fromEntries(SUBJECTS.map(s=>[s,{name:s,short:SUBJECT_SHORT[s],seconds:0,count:0}]));
 for(const sess of d.sessions){
  if(from&&sess.date<from)continue;if(to&&sess.date>to)continue;
  const key=SUBJECTS.includes(sess.subject)?sess.subject:'其他';
  map[key].seconds+=sess.seconds;if(sess.completed)map[key].count+=1;
 }
 return SUBJECTS.map(s=>map[s]);
}
function validate(raw){
 const fail=()=>{throw Error('备份内容不完整或格式不正确');};
 if(!raw||typeof raw!=='object'||raw.version!==1)fail();
 const finite=(n)=>typeof n==='number'&&Number.isFinite(n);
 const time=n=>finite(n)&&n>=0&&n<=8640000000000000;
 const str=(s,max)=>typeof s==='string'&&s.length<=max;
 const id=s=>str(s,120)&&s.length>0;
 const optid=s=>s===null||id(s);
 const boolean=x=>typeof x==='boolean';
 const d=initial();
 const settings={...defaultSettings(),...(raw.settings&&typeof raw.settings==='object'?raw.settings:{})};
 if(!(raw.settings&&raw.settings.cycleStart)&&Array.isArray(raw.sessions)&&raw.sessions.length){
  const dates=raw.sessions.map(s=>s.date).filter(isDate).sort();
  if(dates[0])settings.cycleStart=dates[0];
 }
 configure(d,settings);
 if(!Array.isArray(raw.tasks)||raw.tasks.length>300||!Array.isArray(raw.sessions)||raw.sessions.length>50000||!Array.isArray(raw.distractions)||raw.distractions.length>1000)fail();
 const taskIds=new Set(),sessionIds=new Set();
 d.tasks=raw.tasks.map(t=>{if(!t||!id(t.id)||taskIds.has(t.id)||!str(t.title,120)||!t.title.trim()||!SUBJECTS.includes(t.subject)||!Number.isInteger(t.target)||t.target<1||t.target>20||!boolean(t.done)||!time(t.createdAt))fail();taskIds.add(t.id);return {id:t.id,title:t.title,subject:t.subject,target:t.target,done:t.done,createdAt:t.createdAt};});
 d.sessions=raw.sessions.map(s=>{const subject=SUBJECTS.includes(s.subject)?s.subject:(s.subject==='管理'?'安全管理':s.subject==='技术'?'安全技术':s.subject==='实务'?'安全实务':'其他');if(!s||!id(s.id)||sessionIds.has(s.id)||!boolean(s.completed)||!Number.isInteger(s.seconds)||s.seconds<1||s.seconds>7200||!time(s.startedAt)||!time(s.endedAt)||s.endedAt<s.startedAt||!str(s.date,10)||!isDate(s.date)||!optid(s.taskId)||!str(s.taskTitle,120)||!str(s.note,1000)||!str(s.nextStep,1000))fail();sessionIds.add(s.id);return {id:s.id,completed:s.completed,seconds:s.seconds,startedAt:s.startedAt,endedAt:s.endedAt,date:s.date,taskId:s.taskId,taskTitle:s.taskTitle,subject,note:s.note,nextStep:s.nextStep};});
 d.distractions=raw.distractions.map(x=>{if(!x||!id(x.id)||!str(x.text,300)||!time(x.createdAt))fail();return {id:x.id,text:x.text,createdAt:x.createdAt};});
 const t=raw.timer;if(!t||!PHASES.includes(t.phase)||!['idle','running','paused'].includes(t.status)||!finite(t.durationMs)||t.durationMs<60000||t.durationMs>7200000||!finite(t.remainingMs)||t.remainingMs<0||t.remainingMs>t.durationMs||!optid(t.sessionId)||!optid(t.taskId)||!str(t.taskTitle,120)||!str(t.subject,30))fail();
 if(t.status==='running'&&(!time(t.endAt)||!time(t.startedAt)||!t.sessionId||t.endAt<t.startedAt))fail();
 if(t.status==='paused'&&(!time(t.startedAt)||t.endAt!==null||!t.sessionId))fail();
 if(t.status==='idle'&&(t.endAt!==null||t.startedAt!==null||t.sessionId!==null))fail();
 if(!Number.isInteger(raw.cycle)||raw.cycle<0||raw.cycle>=d.settings.cycles||!optid(raw.selectedTaskId)||!optid(raw.pendingReview))fail();
 d.timer={phase:t.phase,status:t.status,durationMs:t.durationMs,remainingMs:t.remainingMs,endAt:t.endAt,startedAt:t.startedAt,sessionId:t.sessionId,taskId:t.taskId,taskTitle:t.taskTitle,subject:SUBJECTS.includes(t.subject)?t.subject:'其他'};
 d.cycle=raw.cycle;d.selectedTaskId=taskIds.has(raw.selectedTaskId)?raw.selectedTaskId:null;d.pendingReview=sessionIds.has(raw.pendingReview)?raw.pendingReview:null;return d;
}
const api={SUBJECTS,SUBJECT_SHORT,uid,day,shiftDay,isDate,defaultSettings,initial,remaining,start,pause,finish,skip,reset,setPhase,configure,addTask,stats,streak,week,hours,daysUntil,subjectStats,validate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FocusCore=api;
})(typeof window!=='undefined'?window:globalThis);
