(function(){
"use strict";

/* ---------- The Cut program (by weekday 0=Sun..6=Sat) ---------- */
var PROGRAM = {
  2:{name:"Push",type:"upper",tag:"Chest · shoulders · triceps",focus:"Heavy pressing, 2 reps shy of failure. Accessories closer to failure.",
     ex:[["Bench","4 × 6"],["Incline DB Press","3 × 8"],["Overhead Press","3 × 8"],["Lateral Raise","3 × 15"],["Triceps Pushdown","3 × 12"]]},
  5:{name:"Pull",type:"upper",tag:"Back · biceps",focus:"Row and pull with intent. Squeeze every rep, leave 1-2 in the tank on the heavy rows.",
     ex:[["Barbell Row","4 × 8"],["Lat Pulldown","3 × 10"],["Chest-Supported Row","3 × 10"],["Face Pull","3 × 15"],["Biceps Curl","3 × 12"]]},
  0:{name:"Legs",type:"lower",tag:"Your weekend leg day",focus:"Main lifts stop 2 reps short of failure. This + soccer is all the legs you need.",
     ex:[["Squat","4 × 5"],["Romanian Deadlift","3 × 8"],["Leg Press","3 × 12"],["Leg Curl","3 × 12"],["Standing Calf Raise","3 × 15"]]},
  3:{name:"Soccer",cardio:true,focus:"~2.5 hrs. This is your conditioning — don't add cardio on top.",note:"Hydrate hard."},
  1:{name:"Rest",rest:true,focus:"Recovery + Amy. Hit protein, get your steps.",note:""},
  4:{name:"Rest",rest:true,focus:"Recovery + Amy. Hit protein, get your steps.",note:""},
  6:{name:"Rest",rest:true,focus:"Recovery + Amy. Hit protein, get your steps.",note:""}
};
/* exercise library for the picker + rule-based suggestions, by day type */
var EXLIB = {
  upper:["Bench","Incline DB Press","Overhead Press","Barbell Row","Chest-Supported Row","Lat Pulldown","Pull-up","Seated Cable Row","Lateral Raise","Rear Delt Fly","Face Pull","Biceps Curl","Hammer Curl","Triceps Pushdown","Overhead Triceps Ext","Dip","Cable Fly"],
  lower:["Back Squat","Front Squat","Leg Press","Romanian Deadlift","Trap-Bar Deadlift","Split Squat","Walking Lunge","Bulgarian Split Squat","Leg Curl","Leg Extension","Hip Thrust","Standing Calf Raise","Seated Calf Raise","Hack Squat"],
  core:["Plank","Hanging Leg Raise","Cable Crunch","Ab Wheel","Russian Twist","Back Extension"]
};
var SHORT={0:"Legs",1:"Rest",2:"Push",3:"Soccer",4:"Rest",5:"Pull",6:"Rest"};
var LET=["S","M","T","W","T","F","S"];
var START=247, RUNGS=[247,235,225,215,205,195];
var LIFT_DAYS={0:1,2:1,3:1,5:1}; // training-macro default (Push Tue, Soccer Wed, Pull Fri, Legs Sun)

/* ---------- staple foods (per 100g unless noted) ---------- */
var OZ=28.35;
var STAPLES=[
  {n:"Chicken breast",note:"raw",u:"g",per:{cal:120,p:22.5,c:0,f:2.6,fib:0}},
  {n:"93/7 beef",note:"raw",u:"g",per:{cal:152,p:18.6,c:0,f:8.2,fib:0}},
  {n:"White rice",note:"cooked",u:"g",per:{cal:130,p:2.7,c:28,f:0.3,fib:0.4}},
  {n:"Potato",note:"raw",u:"g",per:{cal:77,p:2,c:17,f:0.1,fib:2.2}},
  {n:"Corn",note:"cooked",u:"g",per:{cal:96,p:3.4,c:21,f:1.5,fib:2.4}},
  {n:"Black beans",note:"cooked",u:"g",per:{cal:132,p:8.9,c:24,f:0.5,fib:8.7}},
  {n:"Greek yogurt",note:"nonfat",u:"g",per:{cal:59,p:10.3,c:3.6,f:0.4,fib:0}},
  {n:"Whey isolate",note:"1 scoop=30g",u:"scoop",g:30,per:{cal:370,p:83,c:8,f:3,fib:0}},
  {n:"Egg",note:"1 large=50g",u:"egg",g:50,per:{cal:143,p:12.6,c:0.7,f:9.5,fib:0}},
  {n:"Avocado oil",note:"1 tbsp=14g",u:"tbsp",g:14,per:{cal:884,p:0,c:0,f:100,fib:0}}
];

/* ---------- storage ---------- */
var KEY="platform.v2", CFGKEY="platform.cfg";
var db, cfg;
try{ db=JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ db={}; }
db.log=db.log||{}; db.weights=db.weights||[]; db.waist=db.waist||[]; db.lifts=db.lifts||[];
db.runs=db.runs||[]; db.food=db.food||{}; db.dtype=db.dtype||{}; db.meta=db.meta||{updated:0};
db.settings=db.settings||{eatBack:false};
db.meals=db.meals||[];
db.chat=db.chat||[];    // AI coach conversation (synced)
db.memory=db.memory||[]; // durable facts the coach remembers
db.recipes=db.recipes||[]; // saved recipes (per-serving macros)
if(db.health){delete db.health;} // health now lives server-side in its own store
var HEALTH={}; // Apple Health data, read-only from the backend (never synced up)
try{ cfg=JSON.parse(localStorage.getItem(CFGKEY))||{}; }catch(e){ cfg={}; }

var TODAY=new Date(), viewing=new Date(TODAY);
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function weekStart(d){var x=new Date(d);x.setDate(x.getDate()-x.getDay());return x;}

/* ---------- cloud sync ---------- */
var syncTimer=null, syncing=false;
function setSync(s){var d=document.getElementById("syncDot"); if(d) d.setAttribute("data-s",s);}
function localSave(){try{localStorage.setItem(KEY,JSON.stringify(db));}catch(e){}}
function save(){ db.meta.updated=Date.now(); localSave(); queuePush(); }
function queuePush(){
  if(!cfg.url||!cfg.tok){ setSync(""); return; }
  setSync("sync");
  if(syncTimer) clearTimeout(syncTimer);
  syncTimer=setTimeout(push,900);
}
function pullHealth(){
  if(!cfg.url||!cfg.tok) return;
  fetch(cfg.url.replace(/\/$/,"")+"/health",{headers:{"Authorization":"Bearer "+cfg.tok}})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(h){ if(h){ HEALTH=h; drawHealthStats(); drawRuns(); if(document.getElementById("v-food").classList.contains("on")) drawFood(); } })
   .catch(function(){});
}
function push(){
  if(!cfg.url||!cfg.tok) return;
  syncing=true;
  fetch(cfg.url.replace(/\/$/,"")+"/state",{method:"PUT",
    headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},
    body:JSON.stringify(db)})
   .then(function(r){ setSync(r.ok?"ok":"off"); })
   .catch(function(){ setSync("off"); })
   .then(function(){ syncing=false; });
}
function pull(cb){
  if(!cfg.url||!cfg.tok){ if(cb)cb(); return; }
  setSync("sync");
  fetch(cfg.url.replace(/\/$/,"")+"/state",{headers:{"Authorization":"Bearer "+cfg.tok}})
   .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
   .then(function(remote){
     if(remote && remote.meta && (remote.meta.updated||0) > (db.meta.updated||0)){
       db=remote;
       db.log=db.log||{};db.weights=db.weights||[];db.waist=db.waist||[];db.lifts=db.lifts||[];
       db.runs=db.runs||[];db.food=db.food||{};db.dtype=db.dtype||{};db.meta=db.meta||{updated:0};
       db.settings=db.settings||{eatBack:false};db.meals=db.meals||[];
       db.chat=db.chat||[];db.memory=db.memory||[];db.recipes=db.recipes||[];
       localSave();
     }
     setSync("ok"); if(cb)cb();
   })
   .catch(function(){ setSync("off"); if(cb)cb(); });
}

/* ---------- tabs ---------- */
Array.prototype.forEach.call(document.querySelectorAll(".tab"),function(t){
  t.addEventListener("click",function(){
    Array.prototype.forEach.call(document.querySelectorAll(".tab"),function(x){x.setAttribute("aria-selected","false");});
    Array.prototype.forEach.call(document.querySelectorAll(".view"),function(v){v.classList.remove("on");});
    t.setAttribute("aria-selected","true");
    var v=t.dataset.view;
    var ve=document.getElementById("v-"+v); ve.classList.add("on");
    ve.classList.remove("anim"); void ve.offsetWidth; ve.classList.add("anim"); // retrigger entrance animation
    var db2=document.getElementById("dateBar"); if(db2) db2.style.display=(v==="home")?"none":"";
    if(v==="home") drawHome();
    if(v==="food") pullHealth();
    window.scrollTo(0,0);
  });
});
/* center + FAB — quick log from any tab */
(function(){var f=document.getElementById("logFab"); if(!f)return;
  f.addEventListener("click",function(){
    document.getElementById("fmTitle").textContent="Quick log";
    document.getElementById("fmBody").innerHTML=
      '<button class="btn gold full" id="qlTalk" style="margin-bottom:10px">🎤 Talk or type what you ate</button>'+
      '<button class="btn full" id="qlQuick">➕ Quick add (calories/macros)</button>';
    openModal("foodModal");
    document.getElementById("qlTalk").addEventListener("click",function(){closeModal("foodModal");document.getElementById("talkBtn").click();});
    document.getElementById("qlQuick").addEventListener("click",function(){closeModal("foodModal");openQuickAdd();});
  });
})();
// hide the date bar on the default Home view at load
(function(){var d=document.getElementById("dateBar"); if(d) d.style.display="none";})();

/* ---------- TRAIN: rail + card ---------- */
function schemeTarget(scheme){var n=parseInt(scheme,10);return isNaN(n)?1:n;}
function dayEntry(k){return db.log[k]||(db.log[k]={done:false});}
// Editable per-day session. Migrates old {sets:{i:count}} → named exercise list; seeds from program.
function session(k,dow){
  var p=PROGRAM[dow];
  var e=db.log[k]||(db.log[k]={});
  if(!e.exercises){
    e.exercises=(p.ex||[]).map(function(x,i){
      return {name:x[0],scheme:x[1],target:schemeTarget(x[1]),done:(e.sets&&e.sets[i])?e.sets[i]:0};
    });
    if(e.sets)delete e.sets;
    if(e.finished===undefined)e.finished=false;
  }
  return e;
}
function totalSets(k,dow){var s=session(k,dow);return s.exercises.reduce(function(a,x){return a+(x.target||0);},0);}
function doneSets(k,dow){var s=session(k,dow);return s.exercises.reduce(function(a,x){return a+Math.min(x.done||0,x.target||0);},0);}
function isDayDone(k,dow){
  var p=PROGRAM[dow];if(p.rest)return false;
  var e=db.log[k];if(!e)return false;
  if(p.cardio)return !!e.done;
  if(e.finished)return true;
  if(!e.exercises||!e.exercises.length)return false;
  return e.exercises.every(function(x){return (x.done||0)>=(x.target||0);});
}

function drawRail(){
  var ws=weekStart(viewing),html="";
  for(var i=0;i<7;i++){
    var d=new Date(ws);d.setDate(ws.getDate()+i);var k=iso(d),dow=d.getDay();
    html+='<button class="day" data-i="'+i+'"'+(k===iso(viewing)?' data-viewing="1"':'')+
      (k===iso(TODAY)?' data-today="1"':'')+(isDayDone(k,dow)?' data-done="1"':'')+
      '><span class="dl">'+LET[dow]+'</span><span class="dt">'+SHORT[dow]+'</span></button>';
  }
  document.getElementById("rail").innerHTML=html;
  Array.prototype.forEach.call(document.querySelectorAll("#rail .day"),function(b){
    b.addEventListener("click",function(){var d=new Date(weekStart(viewing));d.setDate(d.getDate()+ +b.dataset.i);setViewing(d);});
  });
}
function drawTrainCard(){
  var k=iso(viewing),dow=viewing.getDay(),p=PROGRAM[dow],isToday=k===iso(TODAY);
  var label=viewing.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  var h='<div class="head"><h2>'+p.name+(p.optional?' <span style="font-size:11px;color:var(--muted)">optional</span>':'')+
    '</h2><span class="date">'+(isToday?"Today &middot; ":"")+label+'</span></div>'+
    '<div class="focus"><b>'+(p.tag||"Plan")+'.</b> '+p.focus+'</div>';
  if(p.rest){
    h+='<div class="cardio"><div class="big">Rest day</div><p>'+p.focus+'</p></div>';
  }else if(p.cardio){
    var e=dayEntry(k);
    h+='<div class="cardio"><div class="big">'+(e.done?"Logged":"Not logged yet")+'</div><p>'+p.note+'</p>'+
      '<button class="btn '+(e.done?"done":"")+'" id="cardioBtn">'+(e.done?"✓ Complete":"Mark complete")+'</button></div>';
  }else{
    var s0=session(k,dow), ex=s0.exercises;
    var tot=ex.reduce(function(a,x){return a+(x.target||0);},0);
    var got=ex.reduce(function(a,x){return a+Math.min(x.done||0,x.target||0);},0);
    var pct=tot?Math.round(got/tot*100):0, allDone=isDayDone(k,dow);
    h+='<div class="bar'+(pct>=100?" full":"")+'"><span style="width:'+pct+'%"></span></div>'+
      '<div class="barlabel"><span>'+(s0.finished?"Workout finished":(pct>=100?"All sets done":"Sets logged"))+'</span><span class="num">'+ex.length+' ex &middot; '+got+' / '+tot+' sets</span></div><ul class="ex">';
    ex.forEach(function(x,i){var n=x.target||0,c=x.done||0;
      h+='<li'+(c>=n?' data-complete="1"':'')+'><div class="exname">'+esc(x.name)+'<small>'+esc(x.scheme||"")+'</small></div><div class="sets">';
      for(var st=1;st<=n;st++)h+='<button class="set" data-ex="'+i+'" data-s="'+st+'" aria-pressed="'+(st<=c)+'">'+st+'</button>';
      h+='<button class="exdel" data-exdel="'+i+'" aria-label="Remove '+esc(x.name)+'">×</button>';
      h+='</div></li>';});
    h+='</ul>';
    h+='<div class="sessbtns">'+
      '<button class="btn ghost" id="addExBtn">➕ Add exercise</button>'+
      '<button class="btn ghost" id="suggestBtn">💡 Suggest more</button>'+
      '</div>'+
      '<div id="suggestBox"></div>'+
      '<button class="btn full '+(s0.finished?"done":"")+'" id="finishBtn" style="margin-top:10px">'+(s0.finished?"✓ Workout finished — reopen":"✅ Finish workout")+'</button>';
  }
  document.getElementById("trainCard").innerHTML=h;
  var cb=document.getElementById("cardioBtn");
  if(cb)cb.addEventListener("click",function(){var e=dayEntry(k);e.done=!e.done;save();drawRail();drawTrainCard();});
  Array.prototype.forEach.call(document.querySelectorAll("#trainCard .set"),function(b){
    b.addEventListener("click",function(){var s=session(k,dow),i=+b.dataset.ex,v=+b.dataset.s;var x=s.exercises[i];var was=x.done;x.done=(x.done===v)?v-1:v;
      if(x.done>was && iso(viewing)===iso(TODAY)) rtStart((db.settings&&db.settings.restSec)||90); // completing a set starts rest
      save();drawRail();drawTrainCard();});
  });
  Array.prototype.forEach.call(document.querySelectorAll("#trainCard .exdel"),function(b){
    b.addEventListener("click",function(){var s=session(k,dow);s.exercises.splice(+b.dataset.exdel,1);save();drawRail();drawTrainCard();});
  });
  var ab=document.getElementById("addExBtn"); if(ab)ab.addEventListener("click",function(){openExPicker(k,dow);});
  var sg=document.getElementById("suggestBtn"); if(sg)sg.addEventListener("click",function(){drawSuggestions(k,dow);});
  var fb=document.getElementById("finishBtn"); if(fb)fb.addEventListener("click",function(){var s=session(k,dow);s.finished=!s.finished;save();drawRail();drawTrainCard();toast(s.finished?"Workout logged":"Reopened");});
}
/* exercise picker modal */
var exPickCtx=null;
function openExPicker(k,dow){
  exPickCtx={k:k,dow:dow,filter:(PROGRAM[dow].type||"upper")};
  drawExPicker();
  document.getElementById("exCustomName").value="";
  document.getElementById("exCustomSets").value="";
  openModal("exModal");
}
function drawExPicker(){
  var f=exPickCtx.filter;
  var filters=[["upper","Upper"],["lower","Lower"],["core","Core"]];
  document.getElementById("exFilters").innerHTML=filters.map(function(x){
    return '<button data-f="'+x[0]+'"'+(f===x[0]?' class="on"':'')+'>'+x[1]+'</button>';
  }).join("");
  var have={}; session(exPickCtx.k,exPickCtx.dow).exercises.forEach(function(x){have[x.name.toLowerCase()]=1;});
  var pool=(EXLIB[f]||[]).filter(function(n){return !have[n.toLowerCase()];});
  document.getElementById("exChips").innerHTML=pool.length?pool.map(function(n){
    return '<button class="sugchip" data-add="'+esc(n)+'">+ '+esc(n)+'</button>';
  }).join(""):'<div style="color:var(--muted);font-size:12.5px;padding:8px 0">All '+f+' exercises are already in today.</div>';
  Array.prototype.forEach.call(document.querySelectorAll("#exFilters button"),function(b){
    b.addEventListener("click",function(){exPickCtx.filter=b.dataset.f;drawExPicker();});
  });
  Array.prototype.forEach.call(document.querySelectorAll("#exChips .sugchip"),function(b){
    b.addEventListener("click",function(){addExercise(exPickCtx.k,exPickCtx.dow,b.dataset.add,"3 × 10");drawExPicker();toast("Added "+b.dataset.add);});
  });
}
(function(){
  var add=document.getElementById("exCustomAdd");
  if(add)add.addEventListener("click",function(){
    var n=document.getElementById("exCustomName").value.trim();
    var sc=document.getElementById("exCustomSets").value.trim()||"3 × 10";
    if(!n)return;
    addExercise(exPickCtx.k,exPickCtx.dow,n,sc);
    document.getElementById("exCustomName").value="";document.getElementById("exCustomSets").value="";
    closeModal("exModal");
  });
})();

/* add an exercise to the day's session */
function addExercise(k,dow,name,scheme){
  var s=session(k,dow);
  s.exercises.push({name:name,scheme:scheme||"3 × 10",target:schemeTarget(scheme||"3 × 10"),done:0,added:true});
  save(); drawRail(); drawTrainCard();
}
/* rule-based suggestions filtered by the day's type (upper/lower), excluding what's already in */
function suggestList(k,dow){
  var p=PROGRAM[dow], type=p.type||"upper";
  var have={}; session(k,dow).exercises.forEach(function(x){have[x.name.toLowerCase()]=1;});
  var pool=(EXLIB[type]||[]).concat(EXLIB.core);
  return pool.filter(function(n){return !have[n.toLowerCase()];}).slice(0,6);
}
function drawSuggestions(k,dow){
  var box=document.getElementById("suggestBox"); if(!box)return;
  var list=suggestList(k,dow), type=(PROGRAM[dow].type||"upper");
  var chips=list.map(function(n){return '<button class="sugchip" data-sug="'+esc(n)+'">+ '+esc(n)+'</button>';}).join("");
  box.innerHTML='<div class="sugwrap"><div class="eyebrow" style="margin:4px 0 8px">'+type.toUpperCase()+'-day ideas</div>'+
    '<div class="sugchips">'+chips+'</div>'+
    '<button class="btn ghost full" id="askCoachBtn" style="margin-top:8px">🤖 Ask coach for a smart pick</button>'+
    '<div id="askCoachOut" style="font-size:12.5px;color:var(--muted);margin-top:8px"></div></div>';
  Array.prototype.forEach.call(box.querySelectorAll(".sugchip"),function(b){
    b.addEventListener("click",function(){addExercise(k,dow,b.dataset.sug,"3 × 10");});
  });
  var ac=document.getElementById("askCoachBtn"); if(ac)ac.addEventListener("click",function(){askCoachSuggest(k,dow);});
}
function askCoachSuggest(k,dow){
  var out=document.getElementById("askCoachOut"); if(!out)return;
  if(!cfg.url||!cfg.tok){out.textContent="Connect cloud sync first (⤢) to use the AI pick.";return;}
  var p=PROGRAM[dow]; var done=session(k,dow).exercises.map(function(x){return x.name;});
  out.textContent="Thinking…";
  fetch(cfg.url.replace(/\/$/,"")+"/ai/suggest",{method:"POST",
    headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},
    body:JSON.stringify({dayType:p.type||"upper",dayName:p.name,focus:p.focus,done:done})})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(j){
     var s=(j&&j.suggestions)||[];
     if(!s.length){out.textContent="No pick right now — try the ideas above.";return;}
     out.innerHTML=s.map(function(x){return '<button class="sugchip" data-n="'+esc(x.name)+'" data-sc="'+esc(x.scheme||"3 × 10")+'">+ '+esc(x.name)+' <span style="opacity:.7">'+esc(x.scheme||"")+'</span></button>'+(x.why?('<div style="margin:2px 0 8px;font-size:11.5px">'+esc(x.why)+'</div>'):"");}).join("");
     Array.prototype.forEach.call(out.querySelectorAll(".sugchip"),function(b){
       b.addEventListener("click",function(){addExercise(k,dow,b.dataset.n,b.dataset.sc);});
     });
   })
   .catch(function(){out.textContent="Couldn't reach the coach. Try again.";});
}

/* ---------- strength + runs ---------- */
function drawLifts(){
  var rows=db.lifts.slice().reverse().slice(0,8);
  document.getElementById("sEmpty").style.display=rows.length?"none":"block";
  document.getElementById("sBody").innerHTML=rows.map(function(x){
    var idx=db.lifts.indexOf(x);
    var best=db.lifts.filter(function(y){return y.lift.toLowerCase()===x.lift.toLowerCase();}).every(function(y){return x.wt>=y.wt;});
    return "<tr><td>"+esc(x.lift)+(best&&db.lifts.length>1?'<span class="pr">PR</span>':"")+'</td><td class="n">'+x.wt+'</td><td class="n">'+x.reps+'</td><td class="n">'+x.d.slice(5)+'</td><td class="n"><button class="xdel" data-del-lift="'+idx+'" aria-label="Delete">×</button></td></tr>';
  }).join("");
}
function delLift(i){ if(i<0||i>=db.lifts.length)return; db.lifts.splice(i,1); save(); drawLifts(); toast("Removed"); }
function delRun(i){ if(i<0||i>=db.runs.length)return; db.runs.splice(i,1); save(); drawRuns(); toast("Removed"); }
document.addEventListener("click",function(e){
  var t=e.target;
  if(t&&t.getAttribute&&t.getAttribute("data-del-lift")!==null){ delLift(parseInt(t.getAttribute("data-del-lift"),10)); }
  else if(t&&t.getAttribute&&t.getAttribute("data-del-run")!==null){ delRun(parseInt(t.getAttribute("data-del-run"),10)); }
});
function pace(mi,t){var p=String(t).split(":").map(Number);if(p.some(isNaN)||!mi)return "—";var sec=p.length===3?p[0]*3600+p[1]*60+p[2]:p.length===2?p[0]*60+p[1]:p[0];var per=sec/mi;return Math.floor(per/60)+":"+String(Math.round(per%60)).padStart(2,"0");}
function appleRuns(){
  // Pull run-type workouts (with distance) out of the Apple Health store.
  var out=[];
  Object.keys(HEALTH).forEach(function(d){
    (HEALTH[d].workouts||[]).forEach(function(w){
      var t=(w.type||"").toLowerCase();
      if(w.mi==null||!(t.indexOf("run")>=0||t.indexOf("jog")>=0))return;
      out.push({mi:w.mi,min:w.min||0,d:d,src:"apple"});
    });
  });
  return out;
}
function drawRuns(){
  // Manual runs (deletable) + Apple Health runs (auto, read-only), newest first.
  var manual=db.runs.map(function(x,i){return {mi:x.mi,t:x.t,d:x.d,idx:i,src:"manual"};});
  var auto=appleRuns().filter(function(a){
    // skip an Apple run that duplicates a manual one on the same day (±0.3 mi)
    return !manual.some(function(mm){return mm.d===a.d && Math.abs(mm.mi-a.mi)<0.3;});
  });
  var all=manual.concat(auto).sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:0;}).slice(0,8);
  document.getElementById("rEmpty").style.display=all.length?"none":"block";
  document.getElementById("rBody").innerHTML=all.map(function(x){
    var tstr, pc;
    if(x.src==="apple"){
      var mm=Math.round(x.min);
      tstr=(mm>=60?(Math.floor(mm/60)+"h"+(mm%60)+"m"):(mm+" min"));
      if(x.min&&x.mi){var sec=(x.min*60)/x.mi;pc=Math.floor(sec/60)+":"+String(Math.round(sec%60)).padStart(2,"0");}else{pc="—";}
    } else { tstr=x.t; pc=pace(x.mi,x.t); }
    var last=x.src==="apple"
      ? '<td class="n"><span class="wtag">⌚</span></td>'
      : '<td class="n"><button class="xdel" data-del-run="'+x.idx+'" aria-label="Delete">×</button></td>';
    return "<tr><td>"+x.mi.toFixed(1)+" mi</td><td class='n'>"+esc(tstr)+"</td><td class='n'>"+pc+"</td><td class='n'>"+x.d.slice(5)+"</td>"+last+"</tr>";
  }).join("");
  var races=[["Peachtree Road Race 10K","Done · 1:11",1],["PNC Atlanta 10 Miler","Fall 2026",0],["Thanksgiving Half Marathon","Nov 2026",0]];
  document.getElementById("races").innerHTML='<div style="display:flex;flex-direction:column;gap:9px">'+races.map(function(r,i){
    return '<div class="race" data-done="'+r[2]+'" style="display:flex;align-items:center;gap:11px;font-size:13px"><span class="medal" style="width:22px;height:22px;border-radius:50%;flex:none;border:1.5px solid var(--gold-dim);color:var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--mono);'+(r[2]?'background:var(--gold);border-color:var(--gold);color:#17161A':'')+'">'+(r[2]?"✓":(i+1))+'</span><div>'+r[0]+'<small style="display:block;color:var(--muted);font-size:11px">'+r[1]+'</small></div></div>';
  }).join("")+'</div>';
}

/* ---------- BODY: weight trend + waist ---------- */
function drawWeight(){
  var w=db.weights.slice().sort(function(a,b){return a.d<b.d?-1:1;});
  var cur=w.length?w[w.length-1].v:null;
  document.getElementById("wNow").textContent=cur!==null?cur.toFixed(1):"—";
  var last7=w.slice(-7),avg=last7.length?last7.reduce(function(a,x){return a+x.v;},0)/last7.length:null;
  var del=document.getElementById("wDelta");
  del.textContent=cur!==null?((cur-START)<=0?"":"+")+(cur-START).toFixed(1)+" from start":"";
  document.getElementById("wAvg").textContent=avg!==null?("7-day avg "+avg.toFixed(1)+" lb"+(w.length>=7?"":" ("+w.length+"/7 logged)")):"Log daily — the trend is the only number that matters.";
  var ref=avg!==null?avg:cur;
  document.getElementById("ladder").innerHTML=RUNGS.map(function(r){return '<div class="rung"'+(ref!==null&&ref<=r?' data-hit="1"':'')+'><div class="t"></div><span class="n">'+r+'</span></div>';}).join("");
  drawWeightChart(w);
}
// MacroFactor-style trend line: faint daily dots + a smoothed moving-average line
function drawWeightChart(w){
  var wrap=document.getElementById("wChartWrap"), svg=document.getElementById("wChart"); if(!svg) return;
  var pts=w.slice(-30);
  if(pts.length<2){ wrap.style.display="none"; return; }
  wrap.style.display="";
  var W=320,H=96,padX=6,padY=10;
  // 7-point trailing moving average = "trend weight"
  var trend=pts.map(function(_,i){var s=Math.max(0,i-6),seg=pts.slice(s,i+1);return seg.reduce(function(a,x){return a+x.v;},0)/seg.length;});
  var vals=pts.map(function(p){return p.v;}).concat(trend);
  var goal=195, showGoal=(Math.min.apply(null,vals)<=goal+8);
  if(showGoal) vals.push(goal);
  var lo=Math.min.apply(null,vals), hi=Math.max.apply(null,vals); if(hi-lo<2){hi+=1;lo-=1;}
  var x=function(i){return padX+(W-2*padX)*(pts.length<2?0:i/(pts.length-1));};
  var y=function(v){return padY+(H-2*padY)*(1-(v-lo)/(hi-lo));};
  var dots=pts.map(function(p,i){return '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(p.v).toFixed(1)+'" r="2" fill="var(--muted)" opacity="0.45"/>';}).join("");
  var line=trend.map(function(v,i){return (i?"L":"M")+x(i).toFixed(1)+","+y(v).toFixed(1);}).join(" ");
  var goalLine=showGoal?'<line x1="'+padX+'" y1="'+y(goal).toFixed(1)+'" x2="'+(W-padX)+'" y2="'+y(goal).toFixed(1)+'" stroke="var(--gold)" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>':"";
  var lastX=x(pts.length-1), lastY=y(trend[trend.length-1]);
  svg.innerHTML=goalLine+dots+
    '<path d="'+line+'" fill="none" stroke="var(--red)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>'+
    '<circle cx="'+lastX.toFixed(1)+'" cy="'+lastY.toFixed(1)+'" r="3.5" fill="var(--red)"/>';
  document.getElementById("wChartLegend").innerHTML=
    '<span><b style="color:var(--red)">—</b> trend</span><span style="opacity:.7">• daily</span>'+(showGoal?'<span><b style="color:var(--gold)">- -</b> goal 195</span>':'')+
    '<span style="margin-left:auto">last '+pts.length+'</span>';
}

/* ---------- Apple Health stats (Body tab) ---------- */
function drawHealthStats(){
  var el=document.getElementById("healthStats"); if(!el) return;
  var hd=HEALTH[iso(viewing)]||{}, m=hd.metrics||{}, burned=Math.round(hd.kcalToday||0);
  var have=burned||m.steps!=null||m.move!=null||m.exerciseMin!=null||m.distanceMi!=null;
  document.getElementById("healthPanel").style.display=have?"block":"none";
  if(!have) return;
  function tile(v,l){return '<div class="ring"><div class="rv num">'+v+'</div><div class="rk">'+l+'</div></div>';}
  var h="";
  if(m.steps!=null) h+=tile(Math.round(m.steps).toLocaleString(),"steps");
  if(m.move!=null) h+=tile(Math.round(m.move),"move cal");
  if(m.exerciseMin!=null) h+=tile(Math.round(m.exerciseMin),"exercise min");
  if(m.distanceMi!=null) h+=tile(m.distanceMi.toFixed(2),"miles");
  if(burned) h+=tile(burned,"workout cal");
  el.innerHTML=h;
}

/* ---------- FOOD ---------- */
function dtypeFor(k){ if(db.dtype[k]) return db.dtype[k]; return LIFT_DAYS[new Date(k+"T12:00:00").getDay()]?"train":"rest"; }
var DEFAULT_TARGETS={train:{cal:1900,p:186,c:165,f:55,fib:30},rest:{cal:1825,p:185,c:150,f:55,fib:30}};
function targets(k){ var t=dtypeFor(k); var ct=db.settings.targets; return (ct&&ct[t])?ct[t]:DEFAULT_TARGETS[t]; }
function foodFor(k){ return db.food[k]||(db.food[k]=[]); }
function dayTotals(k){ return foodFor(k).reduce(function(a,x){a.cal+=x.cal||0;a.p+=x.protein||0;a.c+=x.carbs||0;a.f+=x.fat||0;a.fib+=x.fiber||0;return a;},{cal:0,p:0,c:0,f:0,fib:0}); }

function drawFood(){
  var k=iso(viewing);
  document.getElementById("foodDate").textContent=viewing.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
  var dt=dtypeFor(k);
  Array.prototype.forEach.call(document.querySelectorAll("#dayType button"),function(b){b.setAttribute("aria-pressed",b.dataset.t===dt?"true":"false");});
  var tg=targets(k),tot=dayTotals(k);
  var hd=HEALTH[k]||{kcalToday:0,workouts:[]};
  var burned=Math.round(hd.kcalToday||0);
  var eatBack=!!db.settings.eatBack;
  var calTarget=tg.cal + (eatBack?burned:0);
  function ring(cls,val,tgt,unit,label){
    var pct=Math.min(100,Math.round(val/tgt*100));
    return '<div class="ring '+cls+'"'+(val>tgt?' data-over="1"':'')+'><div class="rv num">'+Math.round(val)+'</div>'+
      '<div class="rt">/ '+tgt+' '+unit+'</div><div class="rk">'+label+'</div><div class="mbar"><span style="width:'+pct+'%"></span></div></div>';
  }
  var netCarbs=!!db.settings.netCarbs;
  var carbVal=netCarbs?Math.max(0,tot.c-tot.fib):tot.c;
  var carbTgt=netCarbs?Math.max(0,tg.c-tg.fib):tg.c;
  document.getElementById("rings").innerHTML=
    ring("cal",tot.cal,calTarget,"kcal","calories")+ring("prot",tot.p,tg.p,"g","protein")+
    ring("carb",carbVal,carbTgt,"g",netCarbs?"net carbs":"carbs")+ring("fat",tot.f,tg.f,"g","fat")+ring("",tot.fib,tg.fib,"g","fiber");
  // MyFitnessPal-style exercise line (from Apple Health)
  var ex=document.getElementById("exercise");
  var remaining=calTarget-Math.round(tot.cal);
  var wlist=(hd.workouts||[]).map(function(w){return '<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--border)"><span>'+esc(w.type)+(w.min?(' · '+w.min+' min'):'')+'</span><span class="num" style="color:var(--gold)">'+w.kcal+' kcal</span></div>';}).join("");
  ex.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'+
      '<div style="font-size:13.5px">🔥 <b>Exercise</b> <span style="color:var(--muted)">— Apple Health</span><br>'+
      '<span class="num" style="font-size:20px;color:var(--gold)">'+burned+'</span> <span style="color:var(--muted);font-size:12px">kcal burned today</span></div>'+
      '<div style="display:flex;flex-direction:column;gap:6px">'+
      '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer">'+
        '<input type="checkbox" id="eatBack" '+(eatBack?"checked":"")+' style="flex:none;width:18px;height:18px"> add to budget</label>'+
      '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer">'+
        '<input type="checkbox" id="netCarbsTgl" '+(netCarbs?"checked":"")+' style="flex:none;width:18px;height:18px"> net carbs</label>'+
      '</div>'+
    '</div>'+
    (wlist?('<div style="margin-top:10px">'+wlist+'</div>'):'')+
    '<div style="margin-top:10px;font-size:12.5px;color:var(--muted)">Remaining today: <b class="num" style="color:'+(remaining<0?"var(--red)":"var(--green)")+'">'+remaining+'</b> kcal'+
      (eatBack?' <span style="color:var(--muted)">(budget +'+burned+' for exercise)</span>':(burned?' <span style="color:var(--muted)">· '+burned+' available if you eat back</span>':''))+'</div>';
  var ebc=document.getElementById("eatBack");
  if(ebc) ebc.addEventListener("change",function(){db.settings.eatBack=ebc.checked;save();drawFood();});
  var ncc=document.getElementById("netCarbsTgl");
  if(ncc) ncc.addEventListener("change",function(){db.settings.netCarbs=ncc.checked;save();drawFood();});
  // staples
  document.getElementById("staples").innerHTML=STAPLES.map(function(s,i){
    return '<button class="staple" data-i="'+i+'">'+esc(s.n)+'<small>'+s.note+'</small></button>';
  }).join("");
  Array.prototype.forEach.call(document.querySelectorAll("#staples .staple"),function(b){
    b.addEventListener("click",function(){openStaple(STAPLES[+b.dataset.i]);});
  });
  // log — grouped by meal (Breakfast / Lunch / Dinner / Snacks), each with a subtotal
  var list=foodFor(k);
  document.getElementById("foodEmpty").style.display=list.length?"none":"block";
  var MEALS=[["breakfast","Breakfast"],["lunch","Lunch"],["dinner","Dinner"],["snack","Snacks"]];
  var html="";
  MEALS.forEach(function(mm){
    var items=[]; list.forEach(function(x,i){ if(mealOf(x)===mm[0]) items.push({x:x,i:i}); });
    if(!items.length) return;
    var st=items.reduce(function(a,o){a.cal+=o.x.cal||0;a.p+=o.x.protein||0;return a;},{cal:0,p:0});
    html+='<div class="mealgroup"><div class="mealhd"><span>'+mm[1]+'</span><span class="num">'+Math.round(st.cal)+' kcal · '+Math.round(st.p)+'g P</span></div>';
    html+=items.map(function(o){var x=o.x,i=o.i;
      return '<div class="foodrow"><div class="fn">'+esc(x.name)+'<small>'+esc(x.amt||"")+' · '+Math.round(x.carbs||0)+'C '+Math.round(x.fat||0)+'F</small></div>'+
        '<div class="fk">'+Math.round(x.cal)+' kcal<br><span style="color:var(--gold)">'+Math.round(x.protein)+'p</span></div>'+
        '<select class="mealsel" data-i="'+i+'" aria-label="Move to meal">'+
          MEALS.map(function(m2){return '<option value="'+m2[0]+'"'+(mealOf(x)===m2[0]?' selected':'')+'>'+m2[1]+'</option>';}).join("")+
        '</select>'+
        '<button class="del" data-i="'+i+'" aria-label="Remove">×</button></div>';
    }).join("");
    html+='</div>';
  });
  document.getElementById("foodLog").innerHTML=html;
  Array.prototype.forEach.call(document.querySelectorAll("#foodLog .del"),function(b){
    b.addEventListener("click",function(){foodFor(k).splice(+b.dataset.i,1);save();drawFood();});
  });
  Array.prototype.forEach.call(document.querySelectorAll("#foodLog .mealsel"),function(sel){
    sel.addEventListener("change",function(){foodFor(k)[+sel.dataset.i].meal=sel.value;save();drawFood();});
  });
  drawStreak(); drawRecent(); drawMeals();
}
// which meal an item belongs to — stored value, else inferred from its logged time
function mealForHour(h){ return h<11?"breakfast":h<15?"lunch":h<21?"dinner":"snack"; }
function mealOf(x){ if(x.meal) return x.meal; var d=x.ts?new Date(x.ts):new Date(); return mealForHour(d.getHours()); }

/* ---------- MyFitnessPal-style reuse: streak, recent, saved meals, copy day ---------- */
function foodStreak(){
  // consecutive days (ending today or yesterday) with at least one logged food
  var d=new Date(TODAY), n=0;
  if(!(foodFor(iso(d)).length)){ d.setDate(d.getDate()-1); } // allow "not logged yet today"
  while(foodFor(iso(d)).length>0){ n++; d.setDate(d.getDate()-1); }
  return n;
}
function drawStreak(){
  var el=document.getElementById("streak"); if(!el)return;
  var n=foodStreak();
  if(n>=2){ el.style.display=""; el.textContent="🔥 "+n+"-day logging streak"; }
  else{ el.style.display="none"; }
}
function recentFoods(){
  // most-recent distinct items (by name+amt) from the last ~30 logged days, today excluded
  var days=Object.keys(db.food).filter(function(d){return d!==iso(viewing)&&db.food[d]&&db.food[d].length;}).sort().reverse();
  var seen={}, out=[];
  for(var i=0;i<days.length && out.length<8;i++){
    var arr=db.food[days[i]];
    for(var j=arr.length-1;j>=0 && out.length<8;j--){
      var it=arr[j], key=(it.name||"")+"|"+(it.amt||"");
      if(seen[key])continue; seen[key]=1; out.push(it);
    }
  }
  return out;
}
function drawRecent(){
  var wrap=document.getElementById("recentWrap"),box=document.getElementById("recentFoods");
  if(!box)return;
  var r=recentFoods();
  if(!r.length){ wrap.style.display="none"; return; }
  wrap.style.display="";
  box.innerHTML=r.map(function(it,i){
    return '<button class="staple" data-r="'+i+'">'+esc(it.name)+'<small>'+esc(it.amt||"")+' · '+Math.round(it.protein)+'p</small></button>';
  }).join("");
  window._recent=r;
  Array.prototype.forEach.call(box.querySelectorAll(".staple"),function(b){
    b.addEventListener("click",function(){
      var it=window._recent[+b.dataset.r];
      addFood({name:it.name,amt:it.amt,cal:it.cal,protein:it.protein,carbs:it.carbs,fat:it.fat,fiber:it.fiber,src:"recent",ts:Date.now()});
    });
  });
}
function drawMeals(){
  var wrap=document.getElementById("mealsWrap"),box=document.getElementById("savedMeals");
  if(!box)return;
  if(!db.meals.length){ wrap.style.display="none"; return; }
  wrap.style.display="";
  box.innerHTML=db.meals.map(function(m,i){
    var t=m.items.reduce(function(a,x){a.c+=x.cal||0;a.p+=x.protein||0;return a;},{c:0,p:0});
    return '<div class="mealrow"><div class="mn">'+esc(m.name)+'<small>'+m.items.length+' items · '+Math.round(t.c)+' kcal · '+Math.round(t.p)+'g protein</small></div>'+
      '<button class="logmeal" data-m="'+i+'">Log</button><button class="delmeal" data-dm="'+i+'" aria-label="Delete meal">×</button></div>';
  }).join("");
  Array.prototype.forEach.call(box.querySelectorAll(".logmeal"),function(b){
    b.addEventListener("click",function(){ logMeal(+b.dataset.m); });
  });
  Array.prototype.forEach.call(box.querySelectorAll(".delmeal"),function(b){
    b.addEventListener("click",function(){ db.meals.splice(+b.dataset.dm,1); save(); drawMeals(); toast("Meal deleted"); });
  });
}
function logMeal(i){
  var m=db.meals[i]; if(!m)return; var k=iso(viewing);
  m.items.forEach(function(x){ foodFor(k).push({name:x.name,amt:x.amt,cal:x.cal,protein:x.protein,carbs:x.carbs,fat:x.fat,fiber:x.fiber,src:"meal",ts:Date.now()}); });
  save(); drawFood(); toast("Logged "+m.name);
}
function copyYesterday(){
  var y=new Date(viewing); y.setDate(y.getDate()-1);
  var src=db.food[iso(y)]||[];
  if(!src.length){ toast("Nothing logged the day before"); return; }
  var k=iso(viewing);
  src.forEach(function(x){ foodFor(k).push({name:x.name,amt:x.amt,cal:x.cal,protein:x.protein,carbs:x.carbs,fat:x.fat,fiber:x.fiber,src:"copy",ts:Date.now()}); });
  save(); drawFood(); toast("Copied "+src.length+" items from yesterday");
}
function saveTodayAsMeal(){
  var list=foodFor(iso(viewing));
  if(!list.length){ toast("Log some food first"); return; }
  var name=window.prompt("Name this meal (e.g. \"Breakfast\", \"Post-workout\"):","");
  if(!name||!name.trim())return;
  db.meals.push({name:name.trim().slice(0,40),items:list.map(function(x){return {name:x.name,amt:x.amt,cal:x.cal,protein:x.protein,carbs:x.carbs,fat:x.fat,fiber:x.fiber};})});
  save(); drawMeals(); toast("Saved “"+name.trim()+"”");
}
document.getElementById("copyYest").addEventListener("click",copyYesterday);
document.getElementById("saveMeal").addEventListener("click",saveTodayAsMeal);
Array.prototype.forEach.call(document.querySelectorAll("#dayType button"),function(b){
  b.addEventListener("click",function(){db.dtype[iso(viewing)]=b.dataset.t;save();drawFood();});
});

function addFood(item){ if(!item.meal) item.meal=mealForHour(new Date().getHours()); foodFor(iso(viewing)).push(item); save(); drawFood(); toast("Logged "+Math.round(item.protein)+"g protein"); }
function scaleMacros(per,grams){var f=grams/100;return {cal:per.cal*f,protein:per.p*f,carbs:per.c*f,fat:per.f*f,fiber:per.fib*f};}

/* modals */
function openModal(id){document.getElementById(id).classList.add("on");}
function closeModal(id){document.getElementById(id).classList.remove("on");}
Array.prototype.forEach.call(document.querySelectorAll("[data-close]"),function(b){
  b.addEventListener("click",function(){b.closest(".modal").classList.remove("on");});
});
Array.prototype.forEach.call(document.querySelectorAll(".modal"),function(m){
  m.addEventListener("click",function(e){if(e.target===m)m.classList.remove("on");});
});

function openStaple(s){
  document.getElementById("fmTitle").textContent=s.n;
  var unitOpts = s.u==="g" ? '<select id="fmUnit" style="flex:.7"><option value="g">g</option><option value="oz">oz</option></select>'
                           : '<span style="flex:.7;align-self:center;color:var(--muted);font-family:var(--mono)">'+s.u+(s.u==="scoop"||s.u==="egg"||s.u==="tbsp"?"(s)":"")+'</span>';
  document.getElementById("fmBody").innerHTML=
    '<div class="amtrow"><input id="fmAmt" type="number" step="'+(s.u==="g"?"5":"1")+'" min="0" placeholder="amount ('+s.u+')" style="flex:1">'+unitOpts+'</div>'+
    '<div class="prev" id="fmPrev">—</div><button class="btn full" id="fmAdd">Add to log</button>';
  var amt=document.getElementById("fmAmt"),prev=document.getElementById("fmPrev");
  function grams(){var v=parseFloat(amt.value)||0;if(s.u==="g"){var u=document.getElementById("fmUnit");return u&&u.value==="oz"?v*OZ:v;}return v*(s.g||1);}
  function refresh(){var g=grams(),m=scaleMacros(s.per,g);prev.innerHTML=g?('<b>'+Math.round(m.cal)+'</b> kcal · <b>'+Math.round(m.protein)+'g</b> protein · '+Math.round(m.carbs)+'c · '+Math.round(m.fat)+'f · '+Math.round(m.fiber)+' fib'):"—";}
  amt.addEventListener("input",refresh);
  var us=document.getElementById("fmUnit"); if(us)us.addEventListener("change",refresh);
  document.getElementById("fmAdd").addEventListener("click",function(){
    var g=grams(); if(!g)return; var m=scaleMacros(s.per,g);
    var label=(s.u==="g")?(Math.round((document.getElementById("fmUnit").value==="oz"?parseFloat(amt.value):g))+" "+(document.getElementById("fmUnit").value)):(amt.value+" "+s.u+(amt.value>1?"s":""));
    m.name=s.n; m.amt=label; m.src="staple"; m.ts=Date.now();
    addFood(m); closeModal("foodModal");
  });
  openModal("foodModal"); setTimeout(function(){amt.focus();},100);
}
/* Quick Add — calories (+ optional macros/name), no food lookup */
function openQuickAdd(){
  document.getElementById("fmTitle").textContent="Quick add";
  document.getElementById("fmBody").innerHTML=
    '<input id="qaName" placeholder="Name (optional)" style="width:100%;margin-bottom:8px">'+
    '<div class="amtrow"><input id="qaCal" type="number" min="0" placeholder="calories" style="flex:1"><input id="qaP" type="number" min="0" placeholder="protein g" style="flex:1"></div>'+
    '<div class="amtrow" style="margin-top:8px"><input id="qaC" type="number" min="0" placeholder="carbs g" style="flex:1"><input id="qaF" type="number" min="0" placeholder="fat g" style="flex:1"><input id="qaFib" type="number" min="0" placeholder="fiber g" style="flex:1"></div>'+
    '<button class="btn full" id="qaAdd" style="margin-top:12px">Add to log</button>';
  document.getElementById("qaAdd").addEventListener("click",function(){
    var cal=parseFloat(document.getElementById("qaCal").value)||0;
    if(!cal){toast("Enter calories");return;}
    addFood({name:document.getElementById("qaName").value.trim()||"Quick add",amt:"",
      cal:cal,protein:parseFloat(document.getElementById("qaP").value)||0,
      carbs:parseFloat(document.getElementById("qaC").value)||0,fat:parseFloat(document.getElementById("qaF").value)||0,
      fiber:parseFloat(document.getElementById("qaFib").value)||0,src:"quick",ts:Date.now()});
    closeModal("foodModal");
  });
  openModal("foodModal"); setTimeout(function(){document.getElementById("qaCal").focus();},100);
}
document.getElementById("quickAddBtn").addEventListener("click",openQuickAdd);

/* AI talk/type */
document.getElementById("talkBtn").addEventListener("click",function(){
  document.getElementById("fmTitle").textContent="Talk or type what you ate";
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  document.getElementById("fmBody").innerHTML=
    '<div class="aiorb" id="aiOrb"><span class="glow"></span><span class="core"></span></div>'+
    '<div class="aitalkrow"><textarea id="aiText" rows="3" placeholder="e.g. 8 oz chicken, a cup of rice, half a cup of black beans" style="width:100%"></textarea>'+
    (SR?'<button class="micbtn" id="aiMic" aria-label="Speak">🎤</button>':'')+'</div>'+
    '<p style="font-size:11.5px;color:var(--muted);margin:6px 0 12px" id="aiTip">'+(SR?'Tap 🎤 and speak — your words appear as you talk.':'Tip: tap the 🎤 on your keyboard to say it out loud.')+'</p>'+
    '<button class="btn gold full" id="aiGo">Parse it</button><div id="aiOut" style="margin-top:14px"></div>';
  openModal("foodModal"); setTimeout(function(){document.getElementById("aiText").focus();},100);
  // live speech-to-text (interim results stream into the box)
  if(SR){ var rec=null,recOn=false,baseText="";
    document.getElementById("aiMic").addEventListener("click",function(){
      var mic=document.getElementById("aiMic"),orb=document.getElementById("aiOrb"),ta=document.getElementById("aiText");
      if(recOn && rec){ rec.stop(); return; }
      try{ rec=new SR(); }catch(e){ return; }
      rec.lang="en-US"; rec.interimResults=true; rec.continuous=true;
      baseText=ta.value?ta.value+" ":"";
      rec.onresult=function(ev){ var s="";for(var i=ev.resultIndex;i<ev.results.length;i++)s+=ev.results[i][0].transcript; ta.value=baseText+s; ta.dispatchEvent(new Event("input")); };
      rec.onend=function(){ recOn=false; mic.classList.remove("on"); orb.classList.remove("thinking"); document.getElementById("aiTip").textContent="Tap 🎤 and speak — your words appear as you talk."; baseText=ta.value?ta.value+" ":""; };
      rec.onerror=function(){ recOn=false; mic.classList.remove("on"); orb.classList.remove("thinking"); };
      rec.start(); recOn=true; mic.classList.add("on"); orb.classList.add("thinking"); document.getElementById("aiTip").textContent="Listening… tap 🎤 again to stop.";
    });
  }
  document.getElementById("aiGo").addEventListener("click",function(){
    if(!cfg.url||!cfg.tok){document.getElementById("aiOut").innerHTML='<p style="color:var(--red);font-size:12.5px">Connect cloud sync first (⤢ up top) — the AI runs through your synced backend.</p>';return;}
    var text=document.getElementById("aiText").value.trim(); if(!text)return;
    var orb=document.getElementById("aiOrb"); if(orb)orb.classList.add("thinking");
    var out=document.getElementById("aiOut"); out.innerHTML='<p style="color:var(--muted);font-size:12.5px">Thinking…</p>';
    fetch(cfg.url.replace(/\/$/,"")+"/ai/parse",{method:"POST",headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},body:JSON.stringify({text:text})})
     .then(function(r){return r.json();})
     .then(function(j){
       if(orb)orb.classList.remove("thinking");
       var items=(j&&j.items)||[];
       if(!items.length){out.innerHTML='<p style="color:var(--muted);font-size:12.5px">Couldn\'t find a food in that. Try again.</p>';return;}
       out.innerHTML=items.map(function(it,i){
         return '<div class="aiitem" data-i="'+i+'"><div class="aihead"><b>'+esc(it.name)+'</b><span class="num">'+Math.round(it.cal)+' kcal · '+Math.round(it.protein)+'g</span></div>'+
           '<div style="font-size:11.5px;color:var(--muted);margin-top:2px">'+esc((it.qty||"")+" "+(it.unit||""))+' · '+Math.round(it.carbs||0)+'c '+Math.round(it.fat||0)+'f '+Math.round(it.fiber||0)+'fib</div></div>';
       }).join("")+'<button class="btn full" id="aiAdd" style="margin-top:6px">Add all '+items.length+' to log</button>';
       document.getElementById("aiAdd").addEventListener("click",function(){
         items.forEach(function(it){addFood({name:it.name,amt:((it.qty||"")+" "+(it.unit||"")).trim(),cal:it.cal||0,protein:it.protein||0,carbs:it.carbs||0,fat:it.fat||0,fiber:it.fiber||0,src:"ai",ts:Date.now()});});
         closeModal("foodModal");
       });
     })
     .catch(function(){if(orb)orb.classList.remove("thinking");out.innerHTML='<p style="color:var(--red);font-size:12.5px">Network error. Check your connection.</p>';});
  });
});


function toast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("on");setTimeout(function(){t.classList.remove("on");},1600);}

/* ---------- rest timer (auto-starts when a set is completed) ---------- */
var _rt={left:0,iv:null};
function rtFmt(s){s=Math.max(0,s);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function rtRender(){var el=document.getElementById("rtTime");if(el)el.textContent=rtFmt(_rt.left);}
function rtStop(){var box=document.getElementById("restTimer");if(_rt.iv){clearInterval(_rt.iv);_rt.iv=null;}if(box){box.classList.remove("on");box.classList.remove("done");box.setAttribute("aria-hidden","true");}}
function rtStart(sec){
  var box=document.getElementById("restTimer");if(!box)return;
  _rt.left=sec; box.classList.remove("done"); box.classList.add("on"); box.setAttribute("aria-hidden","false"); rtRender();
  if(_rt.iv)clearInterval(_rt.iv);
  _rt.iv=setInterval(function(){
    _rt.left--; rtRender();
    if(_rt.left<=0){ clearInterval(_rt.iv);_rt.iv=null; box.classList.add("done");
      try{navigator.vibrate&&navigator.vibrate([120,60,120]);}catch(e){}
      try{var C=window.AudioContext||window.webkitAudioContext;if(C){var a=new C(),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=880;g.gain.value=0.05;o.start();setTimeout(function(){o.stop();a.close();},250);}}catch(e){}
      setTimeout(rtStop,4000);
    }
  },1000);
}
function rtAdjust(d){ if(!document.getElementById("restTimer").classList.contains("on"))return; _rt.left=Math.max(5,_rt.left+d); if(!_rt.iv)rtStart(_rt.left); else rtRender(); }
(function(){
  var m=document.getElementById("rtMinus"),p=document.getElementById("rtPlus"),s=document.getElementById("rtSkip");
  if(m)m.addEventListener("click",function(){rtAdjust(-15);});
  if(p)p.addEventListener("click",function(){rtAdjust(15);});
  if(s)s.addEventListener("click",rtStop);
})();

/* ---------- forms ---------- */
document.getElementById("wForm").addEventListener("submit",function(ev){ev.preventDefault();
  var v=parseFloat(document.getElementById("wIn").value);if(isNaN(v))return;var k=iso(viewing);
  db.weights=db.weights.filter(function(x){return x.d!==k;});db.weights.push({d:k,v:v});save();
  document.getElementById("wIn").value="";drawWeight();});
document.getElementById("sForm").addEventListener("submit",function(ev){ev.preventDefault();
  var l=document.getElementById("sLift").value.trim(),w=parseFloat(document.getElementById("sWt").value),r=parseInt(document.getElementById("sReps").value,10);
  if(!l||isNaN(w)||isNaN(r))return;
  var prior=db.lifts.filter(function(x){return x.lift.toLowerCase()===l.toLowerCase();});
  var priorBest=prior.length?Math.max.apply(null,prior.map(function(x){return x.wt;})):null;
  db.lifts.push({lift:l,wt:w,reps:r,d:iso(viewing)});save();this.reset();drawLifts();
  if(priorBest!==null && w>priorBest) prFlash(l,w);});
function prFlash(lift,wt){
  var el=document.getElementById("prFlash")||(function(){var d=document.createElement("div");d.id="prFlash";d.className="prflash";document.body.appendChild(d);return d;})();
  el.textContent="🏆 PR — "+lift+" "+wt+" lb!";
  el.classList.add("on"); try{navigator.vibrate&&navigator.vibrate([60,40,120]);}catch(e){}
  setTimeout(function(){el.classList.remove("on");},2200);
}
document.getElementById("rForm").addEventListener("submit",function(ev){ev.preventDefault();
  var m=parseFloat(document.getElementById("rMi").value),t=document.getElementById("rTime").value.trim();
  if(isNaN(m)||!t)return;db.runs.push({mi:m,t:t,d:iso(viewing)});save();this.reset();drawRuns();});

/* export / import / reset */
document.getElementById("exportBtn").addEventListener("click",function(){
  var blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="the-platform-backup-"+iso(TODAY)+".json";a.click();
});
document.getElementById("importBtn").addEventListener("click",function(){
  var inp=document.createElement("input");inp.type="file";inp.accept="application/json";
  inp.onchange=function(){var f=inp.files[0];if(!f)return;var fr=new FileReader();
    fr.onload=function(){try{var d=JSON.parse(fr.result);db=d;db.meta=db.meta||{};db.meta.updated=Date.now();localSave();queuePush();renderAll();toast("Imported");}catch(e){alert("Bad file.");}};fr.readAsText(f);};
  inp.click();
});
document.getElementById("reset").addEventListener("click",function(){
  if(confirm("Erase all logged data on this device? (Cloud copy stays unless you re-sync.)")){
    db={log:{},weights:[],waist:[],lifts:[],runs:[],food:{},dtype:{},meta:{updated:Date.now()}};localSave();renderAll();}
});

/* settings / cloud */
document.getElementById("syncDot").addEventListener("click",function(){
  document.getElementById("cfgUrl").value=cfg.url||"https://the-platform-api.jozuna.workers.dev";
  document.getElementById("cfgTok").value=cfg.tok||"";
  document.getElementById("cfgStatus").textContent=cfg.url&&cfg.tok?"Connected.":"Not connected yet.";
  openModal("setModal");
});
document.getElementById("cfgSave").addEventListener("click",function(){
  cfg.url=document.getElementById("cfgUrl").value.trim();cfg.tok=document.getElementById("cfgTok").value.trim();
  try{localStorage.setItem(CFGKEY,JSON.stringify(cfg));}catch(e){}
  var st=document.getElementById("cfgStatus");st.textContent="Testing…";
  fetch(cfg.url.replace(/\/$/,"")+"/state",{headers:{"Authorization":"Bearer "+cfg.tok}})
   .then(function(r){ if(r.status===401){st.textContent="Token rejected — check it.";setSync("off");return;}
     if(!r.ok)throw new Error(r.status);
     st.textContent="Connected ✓ pulling your data…";
     pullHealth();
     pull(function(){renderAll();updateFoot();setTimeout(function(){closeModal("setModal");},700);});})
   .catch(function(){st.textContent="Couldn't reach the backend.";setSync("off");});
});
function updateFoot(){document.getElementById("footNote").innerHTML=(cfg.url&&cfg.tok?"Cloud sync on":"Cloud sync off")+' &middot; <span id="streak">'+streakText()+'</span>';}
function streakText(){var n=0,d=new Date(TODAY);for(var i=0;i<400;i++){if(isDayDone(iso(d),d.getDay()))n++;else if(i>0)break;d.setDate(d.getDate()-1);}return n>1?(n+"-day streak"):"";}

/* theme */
(function(){var r=document.documentElement,b=document.getElementById("themeBtn"),s=null;
  try{s=localStorage.getItem("platform.theme");}catch(e){}if(s)r.setAttribute("data-theme",s);
  b.addEventListener("click",function(){var cur=r.getAttribute("data-theme");if(!cur)cur=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var next=cur==="dark"?"light":"dark";r.setAttribute("data-theme",next);try{localStorage.setItem("platform.theme",next);}catch(e){}});
})();

/* ---------- color themes (palettes) ---------- */
var THEMES=[
  {id:"default",name:"Blood & Chalk",sw:["#C8102E","#D4A63C","#0B0B0C"]},
  {id:"iron",name:"Iron",sw:["#FF4D2E","#AEB6BF","#0C0C0D"],vars:{"--bg":"#0C0C0D","--surface":"#161619","--surface-2":"#1F1F23","--text":"#ECECEC","--muted":"#8A8A90","--border":"#2C2C32","--red":"#FF4D2E","--red-dim":"#D93A1E","--gold":"#AEB6BF","--green":"#4E9F63","--accent-ink":"#fff"}},
  {id:"volt",name:"Volt",sw:["#CDFF00","#F2F4EC","#0B0C0A"],vars:{"--bg":"#0B0C0A","--surface":"#16170F","--surface-2":"#1F211A","--text":"#F2F4EC","--muted":"#8E9184","--border":"#2C2E26","--red":"#CDFF00","--red-dim":"#AEDA00","--gold":"#E9EDDF","--green":"#8FE04B","--accent-ink":"#0B0C0A"}},
  {id:"ember",name:"Ember",sw:["#FF7A18","#E0A64B","#120B08"],vars:{"--bg":"#120B08","--surface":"#1F1611","--surface-2":"#2A1D15","--text":"#F3EAE2","--muted":"#A08B7C","--border":"#3A2A1E","--red":"#FF7A18","--red-dim":"#DA6410","--gold":"#E0A64B","--green":"#4E9F63","--accent-ink":"#120B08"}},
  {id:"arctic",name:"Arctic",sw:["#22D3EE","#E2E8F0","#0A0F14"],vars:{"--bg":"#0A0F14","--surface":"#111A22","--surface-2":"#182530","--text":"#E7EEF4","--muted":"#7C8A99","--border":"#243543","--red":"#22D3EE","--red-dim":"#12AEC7","--gold":"#E2E8F0","--green":"#34D399","--accent-ink":"#0A0F14"}},
  {id:"stealth",name:"Stealth",sw:["#E5E5E5","#9AA0A6","#0A0A0B"],vars:{"--bg":"#0A0A0B","--surface":"#151517","--surface-2":"#1E1E21","--text":"#F0F0F0","--muted":"#8A8A90","--border":"#2A2A2E","--red":"#E5E5E5","--red-dim":"#C4C4C4","--gold":"#9AA0A6","--green":"#6E9E86","--accent-ink":"#0A0A0B"}}
];
var THEME_KEYS=["--bg","--surface","--surface-2","--text","--muted","--border","--red","--red-dim","--gold","--green","--accent-ink"];
function applyTheme(id){
  var r=document.documentElement, t=THEMES.filter(function(x){return x.id===id;})[0]||THEMES[0];
  THEME_KEYS.forEach(function(k){r.style.removeProperty(k);});
  if(t.vars){ Object.keys(t.vars).forEach(function(k){r.style.setProperty(k,t.vars[k]);}); }
  try{localStorage.setItem("platform.palette",id);}catch(e){}
}
(function(){var id="default";try{id=localStorage.getItem("platform.palette")||"default";}catch(e){}applyTheme(id);})();
function drawThemeSwatches(){
  var box=document.getElementById("themeSwatches"); if(!box) return;
  var cur="default"; try{cur=localStorage.getItem("platform.palette")||"default";}catch(e){}
  box.innerHTML=THEMES.map(function(t){
    return '<button class="swatch'+(t.id===cur?" on":"")+'" data-theme-id="'+t.id+'">'+
      '<span class="dots">'+t.sw.map(function(c){return '<i style="background:'+c+'"></i>';}).join("")+'</span>'+
      '<span class="nm">'+t.name+'</span></button>';
  }).join("");
  Array.prototype.forEach.call(box.querySelectorAll(".swatch"),function(b){
    b.addEventListener("click",function(){applyTheme(b.dataset.themeId);drawThemeSwatches();});
  });
}
drawThemeSwatches();

/* ---------- date navigation (calendar flow across all tabs) ---------- */
function setViewing(d){ viewing=new Date(d); viewing.setHours(0,0,0,0); drawDateBar(); renderAll(); }
function shiftDay(n){ var d=new Date(viewing); d.setDate(d.getDate()+n); setViewing(d); }
function drawDateBar(){
  var lbl=document.getElementById("dateLabel"), tb=document.getElementById("dateToday");
  if(!lbl) return;
  var isToday=iso(viewing)===iso(TODAY);
  var y=new Date(TODAY); y.setDate(y.getDate()-1);
  var tm=new Date(TODAY); tm.setDate(tm.getDate()+1);
  var txt = isToday ? "Today" : iso(viewing)===iso(y) ? "Yesterday" : iso(viewing)===iso(tm) ? "Tomorrow"
          : viewing.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
  lbl.textContent="📅 "+txt;
  tb.classList.toggle("show",!isToday);
}
document.getElementById("datePrev").addEventListener("click",function(){shiftDay(-1);});
document.getElementById("dateNext").addEventListener("click",function(){shiftDay(1);});
document.getElementById("dateToday").addEventListener("click",function(){setViewing(new Date());});
document.getElementById("dateLabel").addEventListener("click",openCalendar);

/* ---------- month calendar ---------- */
var calMonth=null; // Date anchored to first of the shown month
function openCalendar(){ calMonth=new Date(viewing.getFullYear(),viewing.getMonth(),1); drawCalendar(); openModal("calModal"); }
function drawCalendar(){
  document.getElementById("calTitle").textContent=calMonth.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  var first=new Date(calMonth), startDow=first.getDay();
  var daysIn=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,0).getDate();
  var cells="";
  for(var i=0;i<startDow;i++) cells+='<div class="calcell empty"></div>';
  for(var day=1;day<=daysIn;day++){
    var d=new Date(calMonth.getFullYear(),calMonth.getMonth(),day), k=iso(d);
    var hasFood=db.food[k]&&db.food[k].length;
    var hasTrain=isDayDone(k,d.getDay());
    var cls="calcell"+(k===iso(TODAY)?" today":"")+(k===iso(viewing)?" sel":"");
    var dots=(hasFood?'<span class="dot food"></span>':"")+(hasTrain?'<span class="dot train"></span>':"");
    cells+='<button class="'+cls+'" data-d="'+k+'">'+day+(dots?'<span class="dots">'+dots+'</span>':"")+'</button>';
  }
  document.getElementById("calGrid").innerHTML=cells;
  Array.prototype.forEach.call(document.querySelectorAll("#calGrid .calcell[data-d]"),function(b){
    b.addEventListener("click",function(){ var p=b.dataset.d.split("-"); setViewing(new Date(+p[0],+p[1]-1,+p[2])); closeModal("calModal"); });
  });
}
document.getElementById("calPrev").addEventListener("click",function(){calMonth.setMonth(calMonth.getMonth()-1);drawCalendar();});
document.getElementById("calNext").addEventListener("click",function(){calMonth.setMonth(calMonth.getMonth()+1);drawCalendar();});
Array.prototype.forEach.call(document.querySelectorAll("#calModal [data-close]"),function(b){b.addEventListener("click",function(){closeModal("calModal");});});
document.getElementById("calModal").addEventListener("click",function(e){if(e.target===this)closeModal("calModal");});

/* ---------- render ---------- */
/* ---------- editable targets ---------- */
function drawTargets(){
  var el=document.getElementById("tgtPanel"); if(!el) return;
  var tr=targets("2026-01-06"); // a Tuesday = training day
  var rt=DEFAULT_TARGETS.rest; var ct=db.settings.targets; var rest=(ct&&ct.rest)?ct.rest:rt;
  function block(title,t){
    return '<div style="margin-bottom:6px"><div class="eyebrow" style="margin-bottom:6px">'+title+'</div>'+
      '<div class="macros" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;text-align:center">'+
      '<div class="ring"><div class="rv num">'+t.cal+'</div><div class="rk">kcal</div></div>'+
      '<div class="ring"><div class="rv num">'+t.p+'</div><div class="rk">protein</div></div>'+
      '<div class="ring"><div class="rv num">'+t.c+'</div><div class="rk">carbs</div></div>'+
      '<div class="ring"><div class="rv num">'+t.f+'</div><div class="rk">fat</div></div>'+
      '<div class="ring"><div class="rv num">'+t.fib+'</div><div class="rk">fiber</div></div>'+
      '</div></div>';
  }
  el.innerHTML=block("Training day",tr)+block("Rest day",rest);
}
function openTargets(){
  var ct=db.settings.targets||DEFAULT_TARGETS;
  var tr=ct.train||DEFAULT_TARGETS.train, rt=ct.rest||DEFAULT_TARGETS.rest;
  function row(day,t){
    return '<div class="eyebrow" style="margin:8px 0 6px">'+day+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">'+
      ['cal','p','c','f','fib'].map(function(kk){return '<input type="number" data-d="'+day.toLowerCase().slice(0,4)+'" data-k="'+kk+'" value="'+t[kk]+'" aria-label="'+day+' '+kk+'">';}).join("")+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-top:3px"><span>kcal</span><span>protein</span><span>carbs</span><span>fat</span><span>fiber</span></div>';
  }
  document.getElementById("tgtForm").innerHTML=row("Train",tr)+row("Rest",rt);
  openModal("tgtModal");
}
document.getElementById("editTgt").addEventListener("click",openTargets);
document.getElementById("tgtSave").addEventListener("click",function(){
  var t={train:{},rest:{}};
  Array.prototype.forEach.call(document.querySelectorAll("#tgtForm input"),function(inp){
    var d=inp.dataset.d==="trai"?"train":"rest"; t[d][inp.dataset.k]=parseFloat(inp.value)||0;
  });
  db.settings.targets=t; save(); drawTargets(); drawFood(); closeModal("tgtModal"); toast("Targets saved");
});
document.getElementById("tgtReset").addEventListener("click",function(){
  delete db.settings.targets; save(); drawTargets(); drawFood(); closeModal("tgtModal"); toast("Reset to defaults");
});

/* ---------- recipe box ---------- */
function drawRecipes(){
  var box=document.getElementById("recipeList"),empty=document.getElementById("recipeEmpty");
  if(!box)return;
  empty.style.display=db.recipes.length?"none":"block";
  box.innerHTML=db.recipes.map(function(r,i){
    var p=r.per||{};
    return '<div class="mealrow"><div class="mn">'+esc(r.name)+'<small>per serving · '+Math.round(p.cal||0)+' kcal · '+Math.round(p.protein||0)+'g P · '+Math.round(p.carbs||0)+'C '+Math.round(p.fat||0)+'F</small></div>'+
      '<button class="logmeal" data-lr="'+i+'">Log</button><button class="delmeal" data-dr="'+i+'" aria-label="Delete recipe">×</button></div>';
  }).join("");
  Array.prototype.forEach.call(box.querySelectorAll(".logmeal"),function(b){b.addEventListener("click",function(){logRecipe(+b.dataset.lr);});});
  Array.prototype.forEach.call(box.querySelectorAll(".delmeal"),function(b){b.addEventListener("click",function(){db.recipes.splice(+b.dataset.dr,1);save();drawRecipes();toast("Recipe deleted");});});
}
function logRecipe(i){
  var r=db.recipes[i]; if(!r)return; var p=r.per||{};
  addFood({name:r.name+" (1 serving)",amt:"",cal:p.cal||0,protein:p.protein||0,carbs:p.carbs||0,fat:p.fat||0,fiber:p.fiber||0,src:"recipe",ts:Date.now()});
}
var rcCalcResult=null;
function openNewRecipe(){
  document.getElementById("rcName").value="";document.getElementById("rcServ").value="1";
  document.getElementById("rcText").value="";document.getElementById("rcPrev").textContent="—";
  document.getElementById("rcSave").style.display="none"; rcCalcResult=null;
  openModal("recipeModal");
}
document.getElementById("newRecipe").addEventListener("click",openNewRecipe);
document.getElementById("rcCalc").addEventListener("click",function(){
  var text=document.getElementById("rcText").value.trim(); var prev=document.getElementById("rcPrev");
  if(!text){prev.textContent="Add some ingredients first.";return;}
  if(!cfg.url||!cfg.tok){prev.textContent="Connect cloud sync first (⤢).";return;}
  prev.textContent="Calculating…";
  fetch(cfg.url.replace(/\/$/,"")+"/ai/parse",{method:"POST",headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},body:JSON.stringify({text:text})})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(j){
     var items=(j&&j.items)||[]; if(!items.length){prev.textContent="Couldn't read the ingredients. Try rephrasing.";return;}
     var tot=items.reduce(function(a,x){a.cal+=+x.cal||0;a.p+=+x.protein||0;a.c+=+x.carbs||0;a.f+=+x.fat||0;a.fib+=+x.fiber||0;return a;},{cal:0,p:0,c:0,f:0,fib:0});
     var serv=Math.max(1,parseInt(document.getElementById("rcServ").value,10)||1);
     var per={cal:tot.cal/serv,protein:tot.p/serv,carbs:tot.c/serv,fat:tot.f/serv,fiber:tot.fib/serv};
     rcCalcResult=per;
     prev.innerHTML='<b>Per serving ('+serv+'):</b> '+Math.round(per.cal)+' kcal · '+Math.round(per.protein)+'g protein · '+Math.round(per.carbs)+'C · '+Math.round(per.fat)+'F · '+Math.round(per.fiber)+' fib';
     document.getElementById("rcSave").style.display="block";
   })
   .catch(function(){prev.textContent="Lookup failed. Try again.";});
});
document.getElementById("rcSave").addEventListener("click",function(){
  var name=document.getElementById("rcName").value.trim(); if(!name){toast("Name the recipe");return;}
  if(!rcCalcResult){toast("Calculate macros first");return;}
  db.recipes.push({name:name.slice(0,50),per:rcCalcResult}); save(); drawRecipes(); closeModal("recipeModal"); toast("Recipe saved");
});

/* ---------- weekly digest ---------- */
function weekStats(){
  var days=[]; for(var i=0;i<7;i++){var d=new Date(TODAY);d.setDate(d.getDate()-i);days.push(iso(d));}
  var logged=0,cal=0,p=0,c=0,f=0,fib=0,workouts=0;
  days.forEach(function(k){
    var arr=db.food[k]||[];
    if(arr.length){logged++; arr.forEach(function(x){cal+=x.cal||0;p+=x.protein||0;c+=x.carbs||0;f+=x.fat||0;fib+=x.fiber||0;});}
    var dow=new Date(k+"T12:00:00").getDay(); if(isDayDone(k,dow))workouts++;
  });
  var w=db.weights.slice().sort(function(a,b){return a.d<b.d?-1:1;});
  var wk=w.filter(function(x){return days.indexOf(x.d)>=0;});
  var wChange=wk.length>=2?(wk[wk.length-1].v-wk[0].v):null;
  var n=logged||1;
  return {daysLogged:logged, avgCal:Math.round(cal/n), avgProtein:Math.round(p/n), avgCarbs:Math.round(c/n), avgFat:Math.round(f/n), avgFiber:Math.round(fib/n),
    workoutsDone:workouts, weightChangeLb:wChange!=null?Math.round(wChange*10)/10:null, latestWeight:w.length?w[w.length-1].v:null, goal:"247 -> 195 cut"};
}
document.getElementById("digestBtn").addEventListener("click",function(){
  var body=document.getElementById("digestBody"); openModal("digestModal");
  if(!cfg.url||!cfg.tok){body.textContent="Connect cloud sync first (⤢) to generate the digest.";return;}
  var s=weekStats();
  body.innerHTML='<div style="color:var(--muted)">Crunching your week…</div>';
  fetch(cfg.url.replace(/\/$/,"")+"/ai/digest",{method:"POST",headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},body:JSON.stringify(s)})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(j){
     var stat='<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:12px">'+
       '<div class="ring"><div class="rv num">'+s.avgCal+'</div><div class="rk">avg kcal</div></div>'+
       '<div class="ring"><div class="rv num">'+s.avgProtein+'</div><div class="rk">avg protein</div></div>'+
       '<div class="ring"><div class="rv num">'+s.daysLogged+'/7</div><div class="rk">days logged</div></div>'+
       '<div class="ring"><div class="rv num">'+(s.weightChangeLb!=null?(s.weightChangeLb>0?"+":"")+s.weightChangeLb:"—")+'</div><div class="rk">lb change</div></div>'+
       '</div>';
     body.innerHTML=stat+'<div style="white-space:pre-wrap">'+esc(mdlite((j&&j.text)||"Couldn't generate a recap."))+'</div>';
   })
   .catch(function(){body.textContent="Couldn't reach the coach. Try again.";});
});

/* ---------- HOME dashboard ---------- */
function drawHome(){
  var box=document.getElementById("homeBody"); if(!box) return;
  var k=iso(TODAY), tg=targets(k), tot=dayTotals(k);
  var hd=HEALTH[k]||{}, burned=Math.round(hd.kcalToday||0), m=hd.metrics||{};
  var eatBack=!!db.settings.eatBack, calTarget=tg.cal+(eatBack?burned:0);
  var remain=calTarget-Math.round(tot.cal), pRemain=tg.p-Math.round(tot.p);
  var over=remain<0;
  // today's workout
  var dow=TODAY.getDay(), p=PROGRAM[dow], woV;
  if(p.rest){ woV="Rest day"; }
  else if(p.cardio){ var e=db.log[k]; woV=p.name+(e&&e.done?" · done ✓":" · not logged"); }
  else { var s=session(k,dow), dn=s.exercises.reduce(function(a,x){return a+Math.min(x.done||0,x.target||0);},0),
        tt=s.exercises.reduce(function(a,x){return a+(x.target||0);},0);
        woV=p.name+" · "+dn+"/"+tt+" sets"+(isDayDone(k,dow)?" ✓":""); }
  // weight
  var w=db.weights.slice().sort(function(a,b){return a.d<b.d?-1:1;}), cur=w.length?w[w.length-1].v:null;
  var wV=cur!==null?(cur.toFixed(1)+" lb · goal 195"):"No weigh-in yet";
  var streak=foodStreak();
  var hStats=[];
  if(m.steps!=null)hStats.push(Math.round(m.steps).toLocaleString()+" steps");
  if(m.move!=null)hStats.push(Math.round(m.move)+" move");
  if(burned)hStats.push(burned+" workout cal");
  var greeting=(TODAY.getHours()<12?"Good morning":TODAY.getHours()<18?"Good afternoon":"Good evening");
  function card(view,ic,t,v){return '<button class="homecard" data-go="'+view+'"><span class="hc-ic">'+ic+'</span><span class="hc-main"><span class="hc-t">'+t+'</span><span class="hc-v">'+esc(v)+'</span></span><span class="hc-arrow">›</span></button>';}
  box.innerHTML=
    '<div style="margin:6px 0 12px;color:var(--muted);font-size:13px">'+greeting+', John.'+(streak>=2?' <b style="color:var(--gold)">🔥 '+streak+"-day streak</b>":"")+'</div>'+
    '<button class="hero-cal" data-go="food" style="display:block;width:100%;border-width:1px 1px 1px 3px;cursor:pointer">'+
      '<div class="big'+(over?" over":"")+'">'+(over?"+"+Math.abs(remain):remain)+'</div>'+
      '<div class="cap">'+(over?"calories over":"calories left")+'</div>'+
      '<div class="sub"><b>'+Math.round(tot.cal)+'</b> / '+calTarget+' kcal &nbsp;·&nbsp; protein <b>'+Math.round(tot.p)+'</b>/'+tg.p+'g'+(pRemain>0?" ("+pRemain+" to go)":" ✓")+'</div>'+
    '</button>'+
    card("train","🏋️","Today's workout",woV)+
    card("body","📊","Bodyweight",wV)+
    card("food","🍽️","Eaten today",Math.round(tot.cal)+" kcal · "+Math.round(tot.p)+"g P · "+foodFor(k).length+" items")+
    (hStats.length?card("body","⌚","Apple Health",hStats.join(" · ")):"");
  Array.prototype.forEach.call(box.querySelectorAll(".homecard,.hero-cal"),function(b){
    b.addEventListener("click",function(){var v=b.dataset.go;var t=document.querySelector('.tab[data-view="'+v+'"]');if(t)t.click();});
  });
}
/* ---- Native shell: Apple Health device-sync panel (only inside the iOS app) ---- */
function nhSend(action){ try{ if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.platformHealth){ window.webkit.messageHandlers.platformHealth.postMessage({action:action}); } }catch(e){} }
window.__platformHealth={ state:null, update:function(s){ this.state=s; drawNativeHealth(); } };
function drawNativeHealth(){
  var p=document.getElementById("nativeHealthPanel"); if(!p)return;
  if(!window.__isNativeApp){ p.style.display="none"; return; }
  p.style.display="block";
  var s=window.__platformHealth.state;
  var dot=document.getElementById("nhDot"), st=document.getElementById("nhStatus"), sum=document.getElementById("nhSummary");
  if(!s){ dot.style.background="var(--muted)"; st.textContent="Tap Resync to pull your latest Apple Health data."; sum.textContent=""; return; }
  var ok=!!s.connected;
  dot.style.background=ok?"var(--green)":"#E0A64B";
  if(s.error){ st.innerHTML='<b style="color:var(--red)">'+esc(s.error)+'</b>'; }
  else { st.innerHTML=ok?('Connected &middot; last sync <b>'+esc(s.syncedAt||"")+'</b>'):'Not synced yet'; }
  sum.textContent=s.summary||"";
}
(function(){
  function wire(id,act){ var b=document.getElementById(id); if(b)b.addEventListener("click",function(){ nhSend(act); if(act!=="openSettings"){ document.getElementById("nhStatus").textContent="Syncing…"; } }); }
  wire("nhResync","resync"); wire("nhReconnect","reconnect"); wire("nhSettings","openSettings");
  if(window.__isNativeApp){ drawNativeHealth(); nhSend("status"); }
})();
function renderAll(){drawHome();drawRail();drawTrainCard();drawLifts();drawRuns();drawWeight();drawFood();drawHealthStats();drawNativeHealth();drawTargets();drawRecipes();updateFoot();}
drawDateBar();
renderAll();
setSync(cfg.url&&cfg.tok?"ok":"");
if(cfg.url&&cfg.tok){ pull(function(){renderAll();}); pullHealth(); }
// keep Apple Health fresh: on foreground, on Food tab, and every 60s
document.addEventListener("visibilitychange",function(){if(!document.hidden)pullHealth();});
var foodTab=document.querySelector('.tab[data-view="food"]'); if(foodTab)foodTab.addEventListener("click",pullHealth);
setInterval(pullHealth,60000);

/* ---------- AI Coach (available on every tab) ---------- */
function mdlite(s){ return String(s)
  .replace(/\*\*(.+?)\*\*/g,"$1").replace(/__(.+?)__/g,"$1")
  .replace(/`(.+?)`/g,"$1")
  .replace(/^#{1,6}\s*/gm,"").replace(/^\s*[-*]\s+/gm,"• "); }
function coachContext(){
  var k=iso(TODAY), tg=targets(k), tot=dayTotals(k);
  var hd=HEALTH[k]||{}; var burned=Math.round(hd.kcalToday||0);
  var eatBack=!!db.settings.eatBack, calTarget=tg.cal+(eatBack?burned:0);
  var w=db.weights.slice().sort(function(a,b){return a.d<b.d?-1:1;});
  var curWeight=w.length?w[w.length-1].v:START;
  // full weekly split from the program
  var split={};
  for(var d=0;d<7;d++){ var pp=PROGRAM[d]; var dn=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d];
    split[dn]=pp.rest?"Rest":(pp.cardio?pp.name:(pp.name+": "+pp.ex.map(function(e){return e[0]+" "+e[1];}).join(", ")+(pp.optional?" (optional)":""))); }
  var dow=TODAY.getDay(), p=PROGRAM[dow];
  var todayW = p.rest ? {type:"Rest day", focus:p.focus}
             : p.cardio ? {type:p.name, focus:p.focus}
             : {name:p.name, type:p.type, focus:p.focus, plannedExercises:p.ex.map(function(e){return e[0]+" "+e[1];})};
  // what he's ACTUALLY done/edited today (flexible session)
  if(!p.rest && !p.cardio){
    var le=db.log[k];
    if(le&&le.exercises){ todayW.actualSession=le.exercises.map(function(x){return x.name+" "+(x.done||0)+"/"+(x.target||0)+" sets";}); todayW.finished=!!le.finished; }
  }
  return {
    today:k, trainingDay:dtypeFor(k), goal:"247 -> 195 lb cut",
    profile:{ startWeight:START, goalWeight:195, currentWeight:curWeight,
      meetBests:{squat:485,bench:309,deadlift:562}, gymLifts:{squat1RM:385,bench1RM:260},
      training:"The Cut program: lifts 3-4x/week (squat/bench/deadlift focus) + Wednesday soccer for conditioning. Cut targets ~1900 kcal/186g protein training days, 1825/185 rest days." },
    todayWorkout:todayW,
    weeklySplit:split,
    calories:{eaten:Math.round(tot.cal),target:calTarget,remaining:calTarget-Math.round(tot.cal)},
    protein:{eaten:Math.round(tot.p),target:tg.p,remaining:tg.p-Math.round(tot.p)},
    carbs:{eaten:Math.round(tot.c),target:tg.c,remaining:tg.c-Math.round(tot.c)},
    fat:{eaten:Math.round(tot.f),target:tg.f,remaining:tg.f-Math.round(tot.f)},
    fiber:{eaten:Math.round(tot.fib),target:tg.fib},
    exerciseBurnedToday:burned, eatBackOn:eatBack,
    foodLoggedToday:foodFor(k).map(function(x){return x.name+(x.amt?(" "+x.amt):"")+" ("+Math.round(x.protein)+"p/"+Math.round(x.cal)+"kcal)";}),
    recentWeights:w.slice(-5).map(function(x){return x.d+": "+x.v+"lb";}),
    recentLifts:db.lifts.slice(-5).map(function(x){return x.lift+" "+x.wt+"x"+x.reps;}),
    todayWorkouts:(hd.workouts||[]).map(function(x){return x.type+" "+x.kcal+"kcal";}),
    loggingStreak:foodStreak()
  };
}
var COACH_CHIPS=["How much protein do I have left?","What should I eat for dinner?","How's my week going?","Am I on track for my cut?","What's my workout today?"];
function coachRender(){
  var box=document.getElementById("coachMsgs");
  if(!db.chat.length){
    box.innerHTML='<div id="coachEmpty">👋 I\'m your coach. I see your macros, weight, workouts and program — and I remember what you tell me.'+
      '<div class="coachchips">'+COACH_CHIPS.map(function(c){return '<button data-chip="'+esc(c)+'">'+esc(c)+'</button>';}).join("")+'</div></div>';
    Array.prototype.forEach.call(box.querySelectorAll(".coachchips button"),function(b){
      b.addEventListener("click",function(){document.getElementById("coachText").value=b.dataset.chip;coachSend();});
    });
    return;
  }
  box.innerHTML=db.chat.map(function(m){
    var cls=m.role==="user"?"user":(m.role==="act"?"act":"bot");
    return '<div class="cmsg '+cls+'">'+esc(mdlite(m.content))+'</div>';
  }).join("");
  box.scrollTop=box.scrollHeight;
}
// live data strip at top of the coach panel (the "data card" always in view)
function drawCoachStrip(){
  var el=document.getElementById("coachStrip"); if(!el)return;
  var k=iso(TODAY), tg=targets(k), tot=dayTotals(k);
  var hd=HEALTH[k]||{}, burned=Math.round(hd.kcalToday||0), eatBack=!!db.settings.eatBack;
  var calLeft=(tg.cal+(eatBack?burned:0))-Math.round(tot.cal), pLeft=tg.p-Math.round(tot.p);
  var w=db.weights.slice().sort(function(a,b){return a.d<b.d?-1:1;}), cur=w.length?w[w.length-1].v:null;
  function cs(v,l){return '<div class="cs"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>';}
  el.innerHTML=cs(calLeft,"cal left")+cs((pLeft>0?pLeft:"✓"),"protein left")+cs(Math.round(burned),"burned")+(cur!==null?cs(cur.toFixed(1),"weight"):"");
}
function coachTone(){ return (db.settings&&db.settings.coachTone)||"encouraging"; }
function drawToneBtn(){ var b=document.getElementById("coachTone"); if(b)b.textContent=coachTone()==="direct"?"Direct":"Encouraging"; }
function coachOpen(){ document.getElementById("coachPanel").classList.add("on"); document.getElementById("coachPanel").setAttribute("aria-hidden","false"); drawCoachStrip(); drawToneBtn(); coachRender(); setTimeout(function(){document.getElementById("coachText").focus();},100); }
function coachClose(){ document.getElementById("coachPanel").classList.remove("on"); document.getElementById("coachPanel").setAttribute("aria-hidden","true"); }
function coachApply(a){
  if(!a||!a.tool)return null;
  var k=iso(TODAY);
  if(a.tool==="log_food"){
    var items=(a.input&&a.input.items)||[]; if(!items.length)return null;
    items.forEach(function(x){ foodFor(k).push({name:x.name,amt:x.amt||"",cal:+x.cal||0,protein:+x.protein||0,carbs:+x.carbs||0,fat:+x.fat||0,fiber:+x.fiber||0,src:"coach",ts:Date.now()}); });
    var p=items.reduce(function(s,x){return s+(+x.protein||0);},0), c=items.reduce(function(s,x){return s+(+x.cal||0);},0);
    drawFood(); return "✓ Logged "+items.length+" item"+(items.length>1?"s":"")+" · "+Math.round(c)+" kcal / "+Math.round(p)+"g protein";
  }
  if(a.tool==="log_weight"){ var lb=+a.input.lb; if(!lb)return null; db.weights=db.weights.filter(function(x){return x.d!==k;}); db.weights.push({d:k,v:lb}); drawWeight(); return "✓ Logged weight "+lb+" lb"; }
  if(a.tool==="log_lift"){ var i=a.input; if(!i.lift)return null; db.lifts.push({lift:i.lift,wt:+i.wt||0,reps:+i.reps||0,d:k}); drawLifts(); return "✓ Logged "+i.lift+" "+(+i.wt||0)+"×"+(+i.reps||0); }
  if(a.tool==="remember"){ var n=(a.input.note||"").trim(); if(!n)return null; if(db.memory.indexOf(n)<0)db.memory.push(n); return "🧠 Saved to memory: "+n; }
  return null;
}
var coachBusy=false;
function coachSend(){
  if(coachBusy)return;
  var ta=document.getElementById("coachText"), text=ta.value.trim(); if(!text)return;
  if(!cfg.url||!cfg.tok){ db.chat.push({role:"bot",content:"Connect cloud sync first (⤢ up top) — the coach runs through your synced backend."}); coachRender(); return; }
  db.chat.push({role:"user",content:text}); ta.value=""; ta.style.height="auto";
  coachBusy=true; coachRender();
  var box=document.getElementById("coachMsgs");
  var think=document.createElement("div"); think.className="cmsg think"; think.textContent="Coach is thinking…"; box.appendChild(think); box.scrollTop=box.scrollHeight;
  var apiMsgs=db.chat.filter(function(m){return m.role==="user"||m.role==="assistant";}).map(function(m){return {role:m.role==="assistant"?"assistant":"user",content:m.content};});
  fetch(cfg.url.replace(/\/$/,"")+"/ai/chat",{method:"POST",
    headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},
    body:JSON.stringify({messages:apiMsgs,context:coachContext(),memory:db.memory,tone:coachTone()})})
   .then(function(r){return r.ok?r.json():r.text().then(function(t){throw new Error(t);});})
   .then(function(out){
     if(out.reply) db.chat.push({role:"assistant",content:out.reply});
     (out.actions||[]).forEach(function(a){ var note=coachApply(a); if(note) db.chat.push({role:"act",content:note}); });
     save(); coachBusy=false; coachRender(); drawCoachStrip();
   })
   .catch(function(e){ coachBusy=false; db.chat.push({role:"bot",content:"Something went wrong reaching the coach. Try again."}); coachRender(); });
}
document.getElementById("coachFab").addEventListener("click",coachOpen);
document.getElementById("coachClose").addEventListener("click",coachClose);
document.getElementById("coachSend").addEventListener("click",coachSend);
document.getElementById("coachTone").addEventListener("click",function(){db.settings.coachTone=(coachTone()==="direct")?"encouraging":"direct";save();drawToneBtn();toast("Coach tone: "+(coachTone()==="direct"?"Direct":"Encouraging"));});
(function(){ var ta=document.getElementById("coachText");
  ta.addEventListener("input",function(){ ta.style.height="auto"; ta.style.height=Math.min(120,ta.scrollHeight)+"px"; });
  ta.addEventListener("keydown",function(e){ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); coachSend(); } });
})();

/* PWA */
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js?v=24").catch(function(){}); }

/* ---------- auto-update: tell John when a new version is live ---------- */
var APPVER=26; // bump this + version.json + ?v= on every release
function checkUpdate(){
  fetch("version.json?t="+Date.now(),{cache:"no-store"})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(j){ if(j && j.v && j.v>APPVER){ document.getElementById("updateBar").classList.add("on"); } })
   .catch(function(){});
}
function doUpdate(){
  var btn=document.getElementById("updateGo"); if(btn)btn.textContent="Updating…";
  var jobs=[];
  if(window.caches){ jobs.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));})); }
  if(navigator.serviceWorker){ jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(x){return x.unregister();}));})); }
  // Only reload AFTER caches + SW are actually cleared (avoids the half-update race).
  Promise.all(jobs).then(function(){ location.reload(); }).catch(function(){ location.reload(); });
}
document.getElementById("updateGo").addEventListener("click",doUpdate);
checkUpdate();
document.addEventListener("visibilitychange",function(){if(!document.hidden)checkUpdate();});
setInterval(checkUpdate,120000);
})();
