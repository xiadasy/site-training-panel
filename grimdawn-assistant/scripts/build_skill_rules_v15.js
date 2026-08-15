#!/usr/bin/env node
const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..');
function loadAssigned(file,varName){const t=fs.readFileSync(file,'utf8');return JSON.parse(t.replace(new RegExp('^window\\.'+varName+'\\s*=\\s*'),'').replace(/;?\s*$/,''));}
const guide=loadAssigned(path.join(root,'data_js/guides.js'),'GD_DATA_GUIDES');
const rawRules=JSON.parse(fs.readFileSync('/tmp/skill_rules_raw.json','utf8'));
const w={engine:{milestones:[1,5,10,15,20,25,32,40,50]}}, milestones=w.engine.milestones;
function resolveSkill(id){
 const seen=new Set();let cur=(w.eSkills||{})[id]||{}, merged={...cur};
 while(cur&&!seen.has(cur)){seen.add(cur);let next=null;
   for(const k of ['buffSkillName','petSkillName','spawnObject']){const n=cur[k];if(!n)continue;next=(w.buffSkills||{})[n]||(w.ePetSkills||{})[n]||(w.eSkills||{})[n];if(next)break;}
   if(!next)break;merged={...merged,...next};cur=next;
 }
 return merged;
}
const out={version:15,milestones,classes:{},pointRule:{levelPoints:'2-50级每级3点；51-90级每级2点；91-100级每级1点',level100:237,questMax:13,totalMax:250}};
for(const m of guide.masteries){
 const rows=rawRules[m.id]||[];
 const byTag={};
 for(const row of rows){const [tag,max,ultimate,tier,x,y]=row;if(!tag)continue;const isMastery=/SkillName00/.test(tag);const req=isMastery?0:(milestones[Math.max(0,Number(tier)-1)]||1);
   byTag[tag]={tag,max:Number(max||1),ultimate:Number(ultimate||max||1),tier:Number(tier||0),masteryRequired:req,x:Number(x||0),y:Number(y||0)};
 }
 const skills=m.skills.map(sk=>({nameZh:sk.nameZh,tag:sk.tag,...(byTag[sk.tag]||{max:1,ultimate:1,tier:0,masteryRequired:1})}));
 out.classes[m.id]={id:m.id,nameZh:m.nameZh,nameEn:m.nameEn,masteryMax:50,skills};
}
fs.writeFileSync(path.join(root,'data_js/skill_rules.js'),'window.GD_SKILL_RULES = '+JSON.stringify(out)+';\n');
let miss=[];for(const c of Object.values(out.classes))for(const s of c.skills)if(!s.id)miss.push(s.nameZh);
console.log('classes',Object.keys(out.classes).length,'skills',Object.values(out.classes).reduce((n,c)=>n+c.skills.length,0),'missing',miss.length,miss.slice(0,10));
