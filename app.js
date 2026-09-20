(function(){
"use strict";

/* ---------- Training days are FREEFORM: John picks the kind of day, then logs exercises as he goes ---------- */
var DAY_KINDS={
  push:{name:"Push",short:"Push",type:"upper",tag:"Chest · shoulders · triceps",focus:"Heavy pressing 2 reps shy of failure. Accessories closer to failure."},
  pull:{name:"Pull",short:"Pull",type:"upper",tag:"Back · biceps",focus:"Row and pull with intent. Leave 1-2 in the tank on the heavy rows."},
  legs:{name:"Legs",short:"Legs",type:"lower",tag:"Quads · hams · calves",focus:"Main lifts stop 2 reps short. Heavy legs from running? Drop a set, not the session."},
  arms:{name:"Shoulders & Arms",short:"Arms",type:"arms",tag:"Delts · biceps · triceps",focus:"Pump work. Moderate loads, full range, chase the burn not the number."},
  full:{name:"Full body",short:"Full",type:"full",tag:"A bit of everything",focus:"One big lift per pattern, then accessories."},
  soccer:{name:"Soccer",short:"Soccer",cardio:true,focus:"This is your conditioning. Electrolytes before, hydrate hard.",note:"~2.5 hrs."},
  rest:{name:"Rest",short:"Rest",rest:true,focus:"No lifting. Hit protein, get your steps."}
};
var KIND_ORDER=["push","pull","legs","arms","full","soccer","rest"];
/* optional one-tap starters (his usual sessions) — never prescribed, only offered */
var TEMPLATES={
  push:[["Bench","4 × 6"],["Incline DB Press","3 × 8"],["Overhead Press","3 × 8"],["Lateral Raise","3 × 15"],["Triceps Pushdown","3 × 12"]],
  pull:[["Barbell Row","4 × 8"],["Lat Pulldown","3 × 10"],["Chest-Supported Row","3 × 10"],["Face Pull","3 × 15"],["Biceps Curl","3 × 12"]],
  legs:[["Squat","4 × 5"],["Romanian Deadlift","3 × 8"],["Leg Press","3 × 12"],["Leg Curl","3 × 12"],["Standing Calf Raise","3 × 15"]],
  arms:[["Overhead Press","3 × 8"],["Lateral Raise","3 × 15"],["Rear Delt Fly","3 × 15"],["Biceps Curl","3 × 12"],["Hammer Curl","3 × 10"],["Triceps Pushdown","3 × 12"],["Overhead Triceps Ext","3 × 12"]],
  full:[["Squat","3 × 5"],["Bench","3 × 6"],["Barbell Row","3 × 8"],["Romanian Deadlift","3 × 8"],["Overhead Press","3 × 8"]]
};
/* exercise library for the picker + rule-based suggestions, by focus */
var EXLIB = {
  upper:["Bench","Incline DB Press","Overhead Press","Barbell Row","Chest-Supported Row","Lat Pulldown","Pull-up","Seated Cable Row","Lateral Raise","Rear Delt Fly","Face Pull","Biceps Curl","Hammer Curl","Triceps Pushdown","Overhead Triceps Ext","Dip","Cable Fly"],
  lower:["Back Squat","Front Squat","Leg Press","Romanian Deadlift","Trap-Bar Deadlift","Split Squat","Walking Lunge","Bulgarian Split Squat","Leg Curl","Leg Extension","Hip Thrust","Standing Calf Raise","Seated Calf Raise","Hack Squat"],
  arms:["Overhead Press","Arnold Press","Lateral Raise","Rear Delt Fly","Face Pull","Upright Row","Shrug","Biceps Curl","Hammer Curl","Preacher Curl","Incline DB Curl","Triceps Pushdown","Overhead Triceps Ext","Skull Crusher","Dip"],
  core:["Plank","Hanging Leg Raise","Cable Crunch","Ab Wheel","Russian Twist","Back Extension"]
};
EXLIB.full=EXLIB.upper.concat(EXLIB.lower);
var LEGACY_KIND={0:"legs",2:"push",3:"soccer",5:"pull"}; // the old fixed weekday split — only used to label days logged BEFORE freeform
var LET=["S","M","T","W","T","F","S"];
var START=247, RUNGS=[247,235,225,215,205,195];
var LIFT_DAYS={0:1,2:1,3:1,5:1,6:1}; // training-macro default (Push Tue, Soccer Wed, Pull Fri, Sat long run, Legs Sun)

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
db.feel=db.feel||{};       // daily check-in {date:{mood,tags,ts}} the run coach reads
db.coachToday=db.coachToday||{}; // cached run-coach card per day {date:{key,headline,why,call,ts}}
db.runPlan=db.runPlan||{};   // plan edits by date: {type,mi,note} to override/add, or {removed:true}
db.races=db.races||{};       // race edits by name: {d,where,dist,goal,done,result} or {removed:true}
if(db.health){delete db.health;} // health now lives server-side in its own store
var HEALTH={}; // Apple Health data, read-only from the backend (never synced up)
try{ cfg=JSON.parse(localStorage.getItem(CFGKEY))||{}; }catch(e){ cfg={}; }

var TODAY=new Date(), viewing=new Date(TODAY);
function iso(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function weekStart(d){var x=new Date(d);x.setDate(x.getDate()-x.getDay());return x;}

/* ---------- cloud sync ---------- */
var syncTimer=null, syncing=false;
var synced=false; // true once the first pull() has reconciled with the cloud; automatic writers wait for it
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
       db.feel=db.feel||{};db.coachToday=db.coachToday||{};db.runPlan=db.runPlan||{};db.races=db.races||{};
       localSave();
     }
     synced=true;
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
    var db2=document.getElementById("dateBar"); if(db2) db2.style.display=(v==="home"||v==="run")?"none":"";
    if(v==="home") drawHome();
    if(v==="food") pullHealth();
    if(v==="run"){ drawRun(); pullStrava(false); }
    var sc=document.querySelector(".wrap"); if(sc) sc.scrollTop=0; // .wrap is the scroller (body is a fixed app shell)
  });
});
/* any element with data-go="view" jumps to that tab */
document.addEventListener("click",function(e){
  var el=e.target&&e.target.closest?e.target.closest("[data-go]"):null; if(!el)return;
  var t=document.querySelector('.tab[data-view="'+el.getAttribute("data-go")+'"]'); if(t)t.click();
});
/* floating + — quick log from any tab */
(function(){var f=document.getElementById("logFab"); if(!f)return;
  f.addEventListener("click",function(){
    document.getElementById("fmTitle").textContent="Quick log";
    document.getElementById("fmBody").innerHTML=
      '<button class="btn gold full" id="qlTalk" style="margin-bottom:10px">🎤 Talk or type what you ate</button>'+
      '<button class="btn full" id="qlQuick" style="margin-bottom:10px">➕ Quick add (calories/macros)</button>'+
      '<div style="display:flex;gap:8px"><button class="btn ghost full" id="qlWeight">⚖️ Log weight</button><button class="btn ghost full" id="qlFeel">🏃 Run check-in</button></div>';
    openModal("foodModal");
    document.getElementById("qlTalk").addEventListener("click",function(){closeModal("foodModal");document.getElementById("talkBtn").click();});
    document.getElementById("qlQuick").addEventListener("click",function(){closeModal("foodModal");openQuickAdd();});
    document.getElementById("qlWeight").addEventListener("click",function(){closeModal("foodModal");var t=document.querySelector('.tab[data-view="body"]');if(t)t.click();setTimeout(function(){var i=document.getElementById("wIn");if(i){i.scrollIntoView({block:"center",behavior:"smooth"});i.focus();}},260);});
    document.getElementById("qlFeel").addEventListener("click",function(){closeModal("foodModal");var t=document.querySelector('.tab[data-view="run"]');if(t)t.click();setTimeout(function(){var m=document.querySelector(".feelrow");if(m)m.scrollIntoView({block:"center",behavior:"smooth"});},260);});
  });
})();
// hide the date bar on the default Home view at load
(function(){var d=document.getElementById("dateBar"); if(d) d.style.display="none";})();

/* ---------- TRAIN: rail + card ---------- */
function schemeTarget(scheme){var n=parseInt(scheme,10);return isNaN(n)?1:n;}
function dayEntry(k){return db.log[k]||(db.log[k]={done:false});}
// What kind of day is this? Explicit choice wins; days logged under the old fixed split get their legacy label; else nothing.
function dayKind(k){
  var e=db.log[k]; if(!e)return null;
  if(e.kind)return e.kind;
  if((e.exercises&&e.exercises.length)||e.done||e.finished||e.sets){ var lk=LEGACY_KIND[new Date(k+"T12:00:00").getDay()]; if(lk)return lk; }
  return null;
}
function dayInfo(k){var kind=dayKind(k);return kind?Object.assign({kind:kind},DAY_KINDS[kind]):null;}
// Editable per-day session. Blank by default. Migrates the very old {sets:{i:count}} shape via the legacy template.
function session(k){
  var e=db.log[k]||(db.log[k]={});
  if(!e.exercises){
    var tpl=(e.sets&&TEMPLATES[dayKind(k)])||[];
    e.exercises=tpl.map(function(x,i){return {name:x[0],scheme:x[1],target:schemeTarget(x[1]),done:(e.sets&&e.sets[i])?e.sets[i]:0};});
    if(e.sets)delete e.sets;
    if(e.finished===undefined)e.finished=false;
  }
  return e;
}
function lastSessionOf(kind,before){
  var keys=Object.keys(db.log).filter(function(d){return d<before&&dayKind(d)===kind&&db.log[d].exercises&&db.log[d].exercises.length;}).sort();
  if(!keys.length)return null; var d=keys[keys.length-1]; return {k:d,exercises:db.log[d].exercises};
}
function setDayKind(k,kind){
  var e=db.log[k]||(db.log[k]={}); e.kind=kind;
  if(DAY_KINDS[kind].rest||DAY_KINDS[kind].cardio){ if(e.exercises&&!e.exercises.length)delete e.exercises; }
  else { e.exercises=e.exercises||[]; if(e.finished===undefined)e.finished=false; }
  save(); drawRail(); drawTrainCard(); drawHome(); drawFood();
}
function applyTemplate(k,which){
  var kind=dayKind(k); if(!kind)return; var s=session(k);
  var rows=which==="last"?((lastSessionOf(kind,k)||{}).exercises||[]).map(function(x){return [x.name,x.scheme||"3 × 10"];}):(TEMPLATES[kind]||[]);
  rows.forEach(function(x){ if(!s.exercises.some(function(y){return y.name.toLowerCase()===x[0].toLowerCase();})) s.exercises.push({name:x[0],scheme:x[1],target:schemeTarget(x[1]),done:0}); });
  save(); drawRail(); drawTrainCard(); toast(rows.length?("Added "+rows.length+" exercises"):"Nothing to copy");
}
function totalSets(k){var s=session(k);return s.exercises.reduce(function(a,x){return a+(x.target||0);},0);}
function doneSets(k){var s=session(k);return s.exercises.reduce(function(a,x){return a+Math.min(x.done||0,x.target||0);},0);}
function isDayDone(k){
  var info=dayInfo(k); if(!info||info.rest)return false;
  var e=db.log[k];if(!e)return false;
  if(info.cardio)return !!e.done;
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
      '><span class="dl">'+LET[dow]+'</span><span class="dt">'+railLabel(k)+'</span></button>';
  }
  document.getElementById("rail").innerHTML=html;
  Array.prototype.forEach.call(document.querySelectorAll("#rail .day"),function(b){
    b.addEventListener("click",function(){var d=new Date(weekStart(viewing));d.setDate(d.getDate()+ +b.dataset.i);setViewing(d);});
  });
}
function drawTrainCard(){
  var k=iso(viewing),isToday=k===iso(TODAY),info=dayInfo(k),pr=planFor(k);
  var label=viewing.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  var runLine=pr?'<div class="focus" style="display:flex;align-items:center;gap:8px">🏃 <span style="flex:1"><b>'+esc(planLabel(pr))+'</b> is on the run plan</span><button class="lk" data-go="run" style="text-decoration:underline;flex:none">open Run</button></div>':'';
  var h;
  if(!info){
    // blank day: he picks what he's training (nothing is prescribed by weekday)
    h='<div class="head"><h2>'+(isToday?"Today":"Train")+'</h2><span class="date">'+label+'</span></div>'+runLine+
      '<div class="eyebrow" style="margin:16px 0 9px">What are you training?</div>'+
      '<div class="kinds">'+KIND_ORDER.map(function(kk){var d=DAY_KINDS[kk];return '<button class="kind" data-kind="'+kk+'"><b>'+esc(d.name)+'</b><small>'+esc(d.tag||d.note||"")+'</small></button>';}).join("")+'</div>';
  } else {
    h='<div class="head"><h2>'+esc(info.name)+'</h2><span class="date">'+(isToday?"Today &middot; ":"")+label+'</span></div>'+
      '<div class="focus"><b>'+esc(info.tag||info.name)+'.</b> '+esc(info.focus)+' <button class="lk" id="changeKind" style="text-decoration:underline;margin-left:4px">change</button></div>'+runLine;
    if(info.rest){
      h+='<div class="cardio"><div class="big">Rest day</div><p>'+esc(info.focus)+'</p></div>';
    }else if(info.cardio){
      var e=dayEntry(k);
      h+='<div class="cardio"><div class="big">'+(e.done?"Logged":"Not logged yet")+'</div><p>'+esc(info.note||"")+'</p>'+
        '<button class="btn '+(e.done?"done":"")+'" id="cardioBtn">'+(e.done?"✓ Complete":"Mark complete")+'</button></div>';
    }else{
      var s0=session(k), ex=s0.exercises;
      if(!ex.length){
        var last=lastSessionOf(info.kind,k);
        h+='<div class="eyebrow" style="margin:14px 0 8px">Start from</div><div class="sugchips">'+
          (last?'<button class="sugchip" data-tpl="last">↺ Last '+esc(info.name)+' · '+last.k.slice(5).replace("-","/")+'</button>':'')+
          (TEMPLATES[info.kind]?'<button class="sugchip" data-tpl="usual">📋 Usual '+esc(info.name)+'</button>':'')+
          '<button class="sugchip" id="tplBlank">✏️ Add exercises myself</button></div>';
      } else {
        var tot=ex.reduce(function(a,x){return a+(x.target||0);},0);
        var got=ex.reduce(function(a,x){return a+Math.min(x.done||0,x.target||0);},0);
        var pct=tot?Math.round(got/tot*100):0;
        h+='<div class="bar'+(pct>=100?" full":"")+'"><span style="--p:'+(pct/100)+'"></span></div>'+
          '<div class="barlabel"><span>'+(s0.finished?"Workout finished":(pct>=100?"All sets done":"Sets logged"))+'</span><span class="num">'+ex.length+' ex &middot; '+got+' / '+tot+' sets</span></div><ul class="ex">';
        ex.forEach(function(x,i){var n=x.target||0,c=x.done||0;
          h+='<li'+(c>=n?' data-complete="1"':'')+'><div class="exname">'+esc(x.name)+'<small>'+esc(x.scheme||"")+'</small></div><div class="sets">';
          for(var st=1;st<=n;st++)h+='<button class="set" data-ex="'+i+'" data-s="'+st+'" aria-pressed="'+(st<=c)+'">'+st+'</button>';
          h+='<button class="exdel" data-exdel="'+i+'" aria-label="Remove '+esc(x.name)+'">×</button>';
          h+='</div></li>';});
        h+='</ul>';
      }
      h+='<div class="sessbtns">'+
        '<button class="btn ghost" id="addExBtn">➕ Add exercise</button>'+
        '<button class="btn ghost" id="suggestBtn">💡 Suggest more</button>'+
        '</div>'+
        '<div id="suggestBox"></div>'+
        (ex.length?'<button class="btn full '+(s0.finished?"done":"")+'" id="finishBtn" style="margin-top:10px">'+(s0.finished?"✓ Workout finished — reopen":"✅ Finish workout")+'</button>':'');
    }
  }
  document.getElementById("trainCard").innerHTML=h;
  Array.prototype.forEach.call(document.querySelectorAll("#trainCard .kind"),function(b){b.addEventListener("click",function(){setDayKind(k,b.dataset.kind);toast(DAY_KINDS[b.dataset.kind].name+" day");});});
  var ck=document.getElementById("changeKind"); if(ck)ck.addEventListener("click",function(){var e=db.log[k]; if(e){delete e.kind; if(e.exercises&&!e.exercises.length)delete e.exercises;} save();drawRail();drawTrainCard();drawHome();});
  Array.prototype.forEach.call(document.querySelectorAll("#trainCard [data-tpl]"),function(b){b.addEventListener("click",function(){applyTemplate(k,b.dataset.tpl);});});
  var tb=document.getElementById("tplBlank"); if(tb)tb.addEventListener("click",function(){openExPicker(k);});
  var cb=document.getElementById("cardioBtn");
  if(cb)cb.addEventListener("click",function(){var e=dayEntry(k);e.done=!e.done;save();drawRail();drawTrainCard();drawHome();});
  Array.prototype.forEach.call(document.querySelectorAll("#trainCard .set"),function(b){
    b.addEventListener("click",function(){var s=session(k),i=+b.dataset.ex,v=+b.dataset.s;var x=s.exercises[i];var was=x.done;x.done=(x.done===v)?v-1:v;
      if(x.done>was && iso(viewing)===iso(TODAY)) rtStart((db.settings&&db.settings.restSec)||90); // completing a set starts rest
      save();drawRail();drawTrainCard();});
  });
  Array.prototype.forEach.call(document.querySelectorAll("#trainCard .exdel"),function(b){
    b.addEventListener("click",function(){var s=session(k);s.exercises.splice(+b.dataset.exdel,1);save();drawRail();drawTrainCard();});
  });
  var ab=document.getElementById("addExBtn"); if(ab)ab.addEventListener("click",function(){openExPicker(k);});
  var sg=document.getElementById("suggestBtn"); if(sg)sg.addEventListener("click",function(){drawSuggestions(k);});
  var fb=document.getElementById("finishBtn"); if(fb)fb.addEventListener("click",function(){var s=session(k);s.finished=!s.finished;save();drawRail();drawTrainCard();drawHome();toast(s.finished?"Workout logged":"Reopened");});
}
/* exercise picker modal */
var exPickCtx=null;
function openExPicker(k){
  var info=dayInfo(k), t=info&&EXLIB[info.type]?info.type:"upper";
  exPickCtx={k:k,filter:(t==="full"?"upper":t)};
  drawExPicker();
  document.getElementById("exCustomName").value="";
  document.getElementById("exCustomSets").value="";
  openModal("exModal");
}
function drawExPicker(){
  var f=exPickCtx.filter;
  var filters=[["upper","Upper"],["lower","Lower"],["arms","Arms"],["core","Core"]];
  document.getElementById("exFilters").innerHTML=filters.map(function(x){
    return '<button data-f="'+x[0]+'"'+(f===x[0]?' class="on"':'')+'>'+x[1]+'</button>';
  }).join("");
  var have={}; session(exPickCtx.k).exercises.forEach(function(x){have[x.name.toLowerCase()]=1;});
  var pool=(EXLIB[f]||[]).filter(function(n){return !have[n.toLowerCase()];});
  document.getElementById("exChips").innerHTML=pool.length?pool.map(function(n){
    return '<button class="sugchip" data-add="'+esc(n)+'">+ '+esc(n)+'</button>';
  }).join(""):'<div style="color:var(--muted);font-size:12.5px;padding:8px 0">All '+f+' exercises are already in today.</div>';
  Array.prototype.forEach.call(document.querySelectorAll("#exFilters button"),function(b){
    b.addEventListener("click",function(){exPickCtx.filter=b.dataset.f;drawExPicker();});
  });
  Array.prototype.forEach.call(document.querySelectorAll("#exChips .sugchip"),function(b){
    b.addEventListener("click",function(){addExercise(exPickCtx.k,b.dataset.add,"3 × 10");drawExPicker();toast("Added "+b.dataset.add);});
  });
}
(function(){
  var add=document.getElementById("exCustomAdd");
  if(add)add.addEventListener("click",function(){
    var n=document.getElementById("exCustomName").value.trim();
    var sc=document.getElementById("exCustomSets").value.trim()||"3 × 10";
    if(!n)return;
    addExercise(exPickCtx.k,n,sc);
    document.getElementById("exCustomName").value="";document.getElementById("exCustomSets").value="";
    closeModal("exModal");
  });
})();

/* add an exercise to the day's session */
function addExercise(k,name,scheme){
  var s=session(k);
  s.exercises.push({name:name,scheme:scheme||"3 × 10",target:schemeTarget(scheme||"3 × 10"),done:0,added:true});
  save(); drawRail(); drawTrainCard();
}
/* rule-based suggestions filtered by the day's focus, excluding what's already in */
function suggestList(k){
  var info=dayInfo(k), type=(info&&EXLIB[info.type])?info.type:"upper";
  var have={}; session(k).exercises.forEach(function(x){have[x.name.toLowerCase()]=1;});
  var pool=(EXLIB[type]||[]).concat(EXLIB.core);
  return pool.filter(function(n){return !have[n.toLowerCase()];}).slice(0,6);
}
function drawSuggestions(k){
  var box=document.getElementById("suggestBox"); if(!box)return;
  var info=dayInfo(k), list=suggestList(k), type=(info&&info.type)||"upper";
  var chips=list.map(function(n){return '<button class="sugchip" data-sug="'+esc(n)+'">+ '+esc(n)+'</button>';}).join("");
  box.innerHTML='<div class="sugwrap"><div class="eyebrow" style="margin:4px 0 8px">'+esc(type.toUpperCase())+'-day ideas</div>'+
    '<div class="sugchips">'+chips+'</div>'+
    '<button class="btn ghost full" id="askCoachBtn" style="margin-top:8px">🤖 Ask coach for a smart pick</button>'+
    '<div id="askCoachOut" style="font-size:12.5px;color:var(--muted);margin-top:8px"></div></div>';
  Array.prototype.forEach.call(box.querySelectorAll(".sugchip"),function(b){
    b.addEventListener("click",function(){addExercise(k,b.dataset.sug,"3 × 10");});
  });
  var ac=document.getElementById("askCoachBtn"); if(ac)ac.addEventListener("click",function(){askCoachSuggest(k);});
}
function askCoachSuggest(k){
  var out=document.getElementById("askCoachOut"); if(!out)return;
  if(!cfg.url||!cfg.tok){out.textContent="Connect cloud sync first (⤢) to use the AI pick.";return;}
  var info=dayInfo(k)||DAY_KINDS.full; var done=session(k).exercises.map(function(x){return x.name;});
  out.textContent="Thinking…";
  fetch(cfg.url.replace(/\/$/,"")+"/ai/suggest",{method:"POST",
    headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},
    body:JSON.stringify({dayType:info.type||"upper",dayName:info.name,focus:info.focus,done:done})})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(j){
     var s=(j&&j.suggestions)||[];
     if(!s.length){out.textContent="No pick right now — try the ideas above.";return;}
     out.innerHTML=s.map(function(x){return '<button class="sugchip" data-n="'+esc(x.name)+'" data-sc="'+esc(x.scheme||"3 × 10")+'">+ '+esc(x.name)+' <span style="opacity:.7">'+esc(x.scheme||"")+'</span></button>'+(x.why?('<div style="margin:2px 0 8px;font-size:11.5px">'+esc(x.why)+'</div>'):"");}).join("");
     Array.prototype.forEach.call(out.querySelectorAll(".sugchip"),function(b){
       b.addEventListener("click",function(){addExercise(k,b.dataset.n,b.dataset.sc);});
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
  // Manual runs (deletable) + auto runs (Strava when connected, else Apple Health; read-only), newest first.
  var manual=db.runs.map(function(x,i){return {mi:x.mi,t:x.t,d:x.d,idx:i,src:"manual"};});
  var auto=(STRAVA.connected?STRAVA.acts.filter(isRunAct).map(function(a){return {mi:a.mi,min:a.min,d:a.date,src:"strava",paceSec:a.paceSec};}):appleRuns()).filter(function(a){
    // skip an auto run that duplicates a manual one on the same day (±0.3 mi)
    return !manual.some(function(mm){return mm.d===a.d && Math.abs(mm.mi-a.mi)<0.3;});
  });
  var all=manual.concat(auto).sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:0;}).slice(0,8);
  document.getElementById("rEmpty").style.display=all.length?"none":"block";
  document.getElementById("rBody").innerHTML=all.map(function(x){
    var tstr, pc;
    if(x.src!=="manual"){
      var mm=Math.round(x.min);
      tstr=(mm>=60?(Math.floor(mm/60)+"h"+(mm%60)+"m"):(mm+" min"));
      if(x.paceSec){pc=fmtPace(x.paceSec);} // Strava's exact pace
      else if(x.min&&x.mi){var sec=(x.min*60)/x.mi;pc=Math.floor(sec/60)+":"+String(Math.round(sec%60)).padStart(2,"0");}else{pc="—";}
    } else { tstr=x.t; pc=pace(x.mi,x.t); }
    var last=x.src!=="manual"
      ? '<td class="n"><span class="wtag" title="'+(x.src==="strava"?"Strava":"Apple Health")+'">⌚</span></td>'
      : '<td class="n"><button class="xdel" data-del-run="'+x.idx+'" aria-label="Delete">×</button></td>';
    return "<tr><td>"+x.mi.toFixed(1)+" mi</td><td class='n'>"+esc(tstr)+"</td><td class='n'>"+pc+"</td><td class='n'>"+x.d.slice(5)+"</td>"+last+"</tr>";
  }).join("");
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
// training-day macros: explicit toggle wins; else the day he logged (rest = rest); else a planned run; else the weekday default
function dtypeFor(k){ if(db.dtype[k]) return db.dtype[k]; var info=dayInfo(k); if(info) return info.rest?"rest":"train"; if(planFor(k)) return "train"; return LIFT_DAYS[new Date(k+"T12:00:00").getDay()]?"train":"rest"; }
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
      '<div class="rt">/ '+tgt+' '+unit+'</div><div class="rk">'+label+'</div><div class="mbar"><span style="--p:'+(pct/100)+'"></span></div></div>';
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
  drawStravaSettings();
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
     pullHealth(); pullStrava(false,drawStravaSettings);
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

/* ---------- RUN: races, the 10-week Half plan, Strava, coach card ---------- */
var RACES=[
  {d:"2026-07-04",name:"Peachtree Road Race 10K",where:"Atlanta",done:true,result:"1:11"},
  {d:"2026-10-18",name:"Miche 5K",where:"Piedmont Park",dist:"5K"},
  {d:"2026-10-25",name:"PNC Atlanta 10 Miler",where:"Atlantic Station · Buckhead loop",dist:"10 mi"},
  {d:"2026-10-31",name:"Día de Muertos 5K",where:"Plaza Fiesta · Chamblee",dist:"5K"},
  {d:"2026-11-26",name:"Thanksgiving Half Marathon",where:"Center Parc Stadium",dist:"13.1 mi",goal:true}
];
var PLAN_START="2026-09-21", PLAN_WEEKS=10;
// [date, type, planned mi, note] · Mon easy · Thu quality · Sat long · (Sun legs + Wed soccer stay as they are)
var RUN_PLAN=[
  ["2026-09-21","easy",3],["2026-09-24","easy",3,"finish with 4 × 20s strides"],["2026-09-26","long",4],
  ["2026-09-28","easy",3],["2026-10-01","tempo",3,"middle 10 min comfortably hard"],["2026-10-03","long",5],
  ["2026-10-05","easy",3],["2026-10-08","easy",4],["2026-10-10","long",6],
  ["2026-10-12","easy",3],["2026-10-15","tempo",4,"2 × 8 min comfortably hard"],["2026-10-17","long",5,"easy, you race tomorrow"],["2026-10-18","race",3.1,"Miche 5K"],
  ["2026-10-19","easy",3],["2026-10-22","easy",3],["2026-10-24","shake",2,"shakeout, race tomorrow"],["2026-10-25","race",10,"PNC Atlanta 10 Miler = this week's long run"],
  ["2026-10-26","easy",3],["2026-10-29","tempo",4,"3 × 6 min comfortably hard"],["2026-10-31","race",7,"Día de Muertos 5K, then 4 easy miles"],
  ["2026-11-02","easy",4],["2026-11-05","easy",4],["2026-11-07","long",9],
  ["2026-11-09","easy",4],["2026-11-12","tempo",5,"20 min comfortably hard"],["2026-11-14","long",11,"peak long run"],
  ["2026-11-16","easy",3],["2026-11-19","easy",4],["2026-11-21","long",7,"taper"],
  ["2026-11-23","easy",3],["2026-11-24","shake",2,"shakeout"],["2026-11-26","race",13.1,"Thanksgiving Half"]
].map(function(r){return {d:r[0],type:r[1],mi:r[2],note:r[3]||""};});
var PLAN_BY={}; RUN_PLAN.forEach(function(p){PLAN_BY[p.d]=p;});
// The base plan + John's / Rocky's edits (db.runPlan, synced). Edits win; {removed:true} hides a base run.
function allPlan(){ var out={}; RUN_PLAN.forEach(function(p){out[p.d]=p;});
  Object.keys(db.runPlan||{}).forEach(function(d){var o=db.runPlan[d]; if(!o)return; if(o.removed){delete out[d];return;} out[d]={d:d,type:o.type||(out[d]&&out[d].type)||"easy",mi:+o.mi||(out[d]&&out[d].mi)||3,note:o.note!=null?o.note:((out[d]&&out[d].note)||""),edited:true};});
  return Object.keys(out).sort().map(function(d){return out[d];}); }
function editPlan(d,change){ db.runPlan=db.runPlan||{}; if(change===null||(change&&change.removed)) db.runPlan[d]={removed:true}; else { var cur=planFor(d)||{}; db.runPlan[d]={type:change.type||cur.type||"easy",mi:change.mi!=null?+change.mi:(cur.mi||3),note:change.note!=null?String(change.note):(cur.note||"")}; }
  save(); drawRun(); drawRail(); drawTrainCard(); drawHome(); }
function racesAll(){ var out={}; RACES.forEach(function(r){out[r.name]=r;});
  Object.keys(db.races||{}).forEach(function(n){var o=db.races[n]; if(!o)return; if(o.removed){delete out[n];return;} out[n]=Object.assign({name:n},out[n]||{},o);});
  return Object.keys(out).map(function(n){return out[n];}).sort(function(x,y){return x.d<y.d?-1:1;}); }
function editRace(name,change){ db.races=db.races||{}; db.races[name]=change===null?{removed:true}:Object.assign({},db.races[name]||{},change); save(); drawRun(); drawHome(); }
var RUN_TYPE={easy:{n:"Easy",pace:"conversational · ~11:30–12:30/mi"},tempo:{n:"Tempo",pace:"comfortably hard in the work · ~10:00–10:30/mi"},long:{n:"Long run",pace:"easy pace · slower is fine"},race:{n:"Race",pace:"run it, enjoy it"},shake:{n:"Shakeout",pace:"very easy"}};
function planFor(k){var o=(db.runPlan||{})[k]; if(o){ if(o.removed)return null; var b=PLAN_BY[k]||{}; return {d:k,type:o.type||b.type||"easy",mi:o.mi!=null?+o.mi:(b.mi||3),note:o.note!=null?o.note:(b.note||""),edited:true}; } return PLAN_BY[k]||null;}
function planLabel(p){return p.type==="race"?(p.note||"Race"):(RUN_TYPE[p.type].n+" "+p.mi+" mi");}
function planShort(p){return p.type==="race"?"Race":p.type==="long"?"Long "+p.mi:p.type==="tempo"?"Tempo "+p.mi:p.type==="shake"?"Shake":"Easy "+p.mi;}
function railLabel(k){var info=dayInfo(k); if(info)return info.short; var p=planFor(k); if(p)return p.type==="long"?"Long":p.type==="race"?"Race":"Run"; return "–";}
function planWeekIndex(d){var s=new Date(PLAN_START+"T12:00:00"),x=new Date(d||TODAY);x.setHours(12,0,0,0);return Math.floor((x-s)/(7*86400000))+1;} // <1 = before the plan
function planPhase(w){return w<1?"Pre-season":w<=3?"Base":w<=6?"Race tune-ups":w<=8?"Peak":w<=9?"Taper":"Race week";}
function daysUntil(k){var a=new Date(iso(TODAY)+"T12:00:00"),b=new Date(k+"T12:00:00");return Math.round((b-a)/86400000);}
function weekStartMon(d){var x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}
function niceDate(k,o){return new Date(k+"T12:00:00").toLocaleDateString(undefined,o||{weekday:"short",month:"short",day:"numeric"});}

/* Strava: read-only mirror of the backend cache (tokens never reach the phone; nothing here is written to db) */
var STRAVA={acts:[],fetchedAt:0,connected:null,athlete:null};
function actType(a){return String(a.type||"").toLowerCase();}
function isGlitch(a){return a.paceSec!=null&&(a.paceSec<300||a.paceSec>1200);} // GPS junk: faster than 5:00 or slower than 20:00/mi
function isRunAct(a){var t=actType(a);return (t==="run"||t==="trailrun"||t==="virtualrun")&&!isGlitch(a)&&a.mi>=0.5;}
function isTrainAct(a){var t=actType(a);return !(t==="walk"||(t==="hike"&&a.mi<2));}
function runsOn(k){return STRAVA.acts.filter(function(a){return a.date===k&&isRunAct(a);});}
function planDone(p){var rs=runsOn(p.d);if(!rs.length)return null;var mi=rs.reduce(function(s,a){return s+a.mi;},0);if(p.type==="race"||mi>=p.mi*0.7)return {mi:Math.round(mi*100)/100,runs:rs};return null;}
function fmtPace(sec){if(!sec)return "—";return Math.floor(sec/60)+":"+String(Math.round(sec%60)).padStart(2,"0");}
function fmtMin(min){var m=Math.round(min);return m>=60?(Math.floor(m/60)+"h "+(m%60)+"m"):(m+" min");}
function weekMiles(n){var out=[],ws=weekStartMon(TODAY);
  for(var i=n-1;i>=0;i--){var s=new Date(ws);s.setDate(s.getDate()-7*i);var e=new Date(s);e.setDate(e.getDate()+7);var mi=0,runs=0;
    STRAVA.acts.forEach(function(a){if(!isRunAct(a))return;var d=new Date(a.date+"T12:00:00");if(d>=s&&d<e){mi+=a.mi;runs++;}});
    out.push({start:iso(s),mi:Math.round(mi*10)/10,runs:runs});}
  return out;}
function trainStreak(){var days={};STRAVA.acts.forEach(function(a){if(isTrainAct(a))days[a.date]=1;});
  var n=0,d=new Date(TODAY);if(!days[iso(d)])d.setDate(d.getDate()-1);while(days[iso(d)]){n++;d.setDate(d.getDate()-1);}return n;}
function thisWeekPlan(){var ws=weekStartMon(TODAY),out=[];for(var i=0;i<7;i++){var d=new Date(ws);d.setDate(d.getDate()+i);var k=iso(d),p=planFor(k);out.push({k:k,dow:d.getDay(),p:p,done:p?planDone(p):null,runs:runsOn(k)});}return out;}

function pullStrava(force,cb){
  if(!cfg.url||!cfg.tok){ if(cb)cb(); return; }
  fetch(cfg.url.replace(/\/$/,"")+"/strava/activities?days=70"+(force?"&force=1":""),{headers:{"Authorization":"Bearer "+cfg.tok}})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(j){ if(!j){ if(cb)cb(); return; }
     STRAVA.connected=!!j.connected; STRAVA.acts=j.acts||[]; STRAVA.fetchedAt=j.fetchedAt||Date.now(); STRAVA.athlete=j.athlete||null;
     drawRun(); drawRuns(); drawHome(); coachToday(false); if(cb)cb(); })
   .catch(function(){ if(cb)cb(); });
}
function stravaConnect(){
  if(!cfg.url||!cfg.tok){toast("Connect cloud sync first (⤢)");return;}
  fetch(cfg.url.replace(/\/$/,"")+"/strava/connect",{method:"POST",headers:{"Authorization":"Bearer "+cfg.tok}})
   .then(function(r){return r.json();})
   .then(function(j){ if(j&&j.url) location.href=j.url; else toast("Strava isn't set up on the backend yet"); })
   .catch(function(){toast("Couldn't reach the backend");});
}
function stravaDisconnect(){
  if(!confirm("Disconnect Strava? The plan will stop checking itself off."))return;
  fetch(cfg.url.replace(/\/$/,"")+"/strava/disconnect",{method:"POST",headers:{"Authorization":"Bearer "+cfg.tok}})
   .then(function(){ STRAVA={acts:[],fetchedAt:Date.now(),connected:false,athlete:null}; drawRun(); drawRuns(); drawStravaSettings(); toast("Strava disconnected"); })
   .catch(function(){toast("Couldn't reach the backend");});
}
function drawStravaSettings(){
  var st=document.getElementById("stravaStatus"),b=document.getElementById("stravaBtn"); if(!st||!b)return;
  if(!cfg.url||!cfg.tok){ st.textContent="Connect cloud sync above first."; b.style.display="none"; return; }
  b.style.display="";
  if(STRAVA.connected){ st.textContent="Connected"+(STRAVA.athlete&&STRAVA.athlete.name?" as "+STRAVA.athlete.name:"")+" · "+STRAVA.acts.length+" activities in the last 70 days."; b.textContent="Disconnect Strava"; b.onclick=stravaDisconnect; }
  else { st.textContent=STRAVA.connected===false?"Not connected. The plan won't auto-check until you connect.":"Checking…"; b.textContent="Connect Strava"; b.onclick=stravaConnect; }
}

/* what he actually lifted recently (freeform), newest first — feeds the coach */
function recentSessions(n){
  var out=[]; for(var i=0;i<n;i++){ var d=new Date(TODAY); d.setDate(d.getDate()-i); var k=iso(d), info=dayInfo(k); if(!info)continue;
    var e=db.log[k]||{}; var ex=(e.exercises||[]);
    out.push(k+" "+info.name+(info.rest?"":info.cardio?(e.done?" (done)":" (not logged)"):(" · "+ex.length+" ex · "+ex.reduce(function(a,x){return a+Math.min(x.done||0,x.target||0);},0)+" sets"+(e.finished?" · finished":"")+(ex.length?(": "+ex.map(function(x){return x.name;}).join(", ")):"")))); }
  return out;
}

/* daily feel check-in → the coach card + chat both read it */
var MOODS=[["wrecked","😵","Wrecked"],["tired","😴","Tired"],["good","🙂","Good"],["great","🔥","Great"]];
var FEEL_TAGS=["sore legs","slept bad","cramping","stressed"];
function feelFor(k){return (db.feel||{})[k]||null;}
function setFeel(mood,tags){var k=iso(TODAY);db.feel=db.feel||{};var f=db.feel[k]||{mood:null,tags:[]};if(mood)f.mood=mood;if(tags)f.tags=tags;f.ts=Date.now();db.feel[k]=f;save();drawRun();coachToday(true);}

/* the one card he reads before training: cached per day, regenerated only when its inputs change */
function todayKey(){var k=iso(TODAY),p=planFor(k),f=feelFor(k),d=p?planDone(p):null;
  return [k,p?p.type+p.mi:"none",f?(f.mood||"")+"|"+(f.tags||[]).join(","):"",d?"done":"todo",trainStreak(),isDayDone(k,TODAY.getDay())?"lift":"",Math.round(dayTotals(k).cal/300)].join("#");}
function todayPayload(){
  var k=iso(TODAY),p=planFor(k),dow=TODAY.getDay(),li=dayInfo(k),d=p?planDone(p):null,tot=dayTotals(k),hd=HEALTH[k]||{},m=hd.metrics||{};
  var since=new Date(TODAY);since.setDate(since.getDate()-14);var sk=iso(since),wk=planWeekIndex();
  return {
    today:k, weekday:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow], localTime:TODAY.getHours()+":"+String(TODAY.getMinutes()).padStart(2,"0"),
    plannedRun:p?{type:p.type,mi:p.mi,label:planLabel(p),note:p.note,paceGuide:RUN_TYPE[p.type].pace,done:!!d,actual:d?d.runs.map(function(a){return a.mi+" mi @ "+fmtPace(a.paceSec)+(a.hr?" · HR "+a.hr:"");}):null}:null,
    unplannedRunsToday:(!p&&runsOn(k).length)?runsOn(k).map(function(a){return a.mi+" mi @ "+fmtPace(a.paceSec);}):undefined,
    lifting:{today:li?li.name:"not chosen yet (he picks push/pull/legs/arms/full/soccer/rest when he trains)",done:isDayDone(k),recentDays:recentSessions(10)},
    feel:feelFor(k), consecutiveTrainingDays:trainStreak(),
    planWeek:(wk>=1&&wk<=PLAN_WEEKS)?(wk+" of "+PLAN_WEEKS+" ("+planPhase(wk)+")"):(wk<1?"plan starts "+PLAN_START:"plan complete"),
    thisWeek:thisWeekPlan().filter(function(x){return x.p;}).map(function(x){return x.k+" "+planLabel(x.p)+(x.done?" (done)":"");}),
    weeklyMiles:weekMiles(5),
    recentActivities:STRAVA.acts.filter(function(a){return a.date>=sk;}).map(function(a){return {date:a.date,type:a.type,mi:a.mi,min:a.min,pace:a.paceSec?fmtPace(a.paceSec):null,hr:a.hr,name:a.name,glitch:isGlitch(a)||undefined};}),
    foodToday:{kcal:Math.round(tot.cal),protein:Math.round(tot.p),itemsLogged:foodFor(k).length},
    health:{steps:m.steps!=null?Math.round(m.steps):null,moveKcal:m.move!=null?Math.round(m.move):null,workoutKcal:Math.round(hd.kcalToday||0)},
    upcomingRaces:racesAll().filter(function(r){return !r.done&&r.d>=k;}).map(function(r){return r.name+" · "+r.d+" · in "+daysUntil(r.d)+"d"+(r.goal?" (GOAL)":"");}),
    memory:db.memory.slice(-12)
  };
}
var todayBusy=false;
function coachToday(force){
  var k=iso(TODAY),key=todayKey(),c=(db.coachToday||{})[k];
  if(!force&&c&&c.key===key){ renderTodayCoach(c); return; }
  // wait for cloud reconcile (synced) so this never pushes a stale local db over the phone's data
  if(!cfg.url||!cfg.tok||!STRAVA.fetchedAt||!synced||todayBusy){ if(c)renderTodayCoach(c); return; }
  todayBusy=true; renderTodayCoach(null);
  fetch(cfg.url.replace(/\/$/,"")+"/ai/today",{method:"POST",headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},body:JSON.stringify(todayPayload())})
   .then(function(r){return r.ok?r.json():null;})
   .then(function(j){ todayBusy=false;
     if(!j||!j.headline){ renderTodayCoach(c||{headline:"Coach is unavailable right now.",why:"",call:"go"}); return; }
     db.coachToday=db.coachToday||{}; db.coachToday[k]={key:key,headline:j.headline,why:j.why||"",call:j.call||"go",ts:Date.now()};
     var old=iso(new Date(TODAY.getTime()-7*86400000)); Object.keys(db.coachToday).forEach(function(d){if(d<old)delete db.coachToday[d];});
     localSave(); // device cache only; the card rides along on the next user-driven save, never forces a push
     renderTodayCoach(db.coachToday[k]); drawHome(); })
   .catch(function(){ todayBusy=false; renderTodayCoach(c||{headline:"Couldn't reach the coach.",why:"",call:"go"}); });
}
function renderTodayCoach(c){
  var el=document.getElementById("coachCard"); if(!el)return;
  if(!c){ el.innerHTML='<div class="skel" style="height:18px;width:70%;margin-bottom:8px">&nbsp;</div><div class="skel" style="height:13px;width:95%">&nbsp;</div><div class="skel" style="height:13px;width:60%;margin-top:6px">&nbsp;</div>'; return; }
  var tag={go:"Go",easy:"Take it easy",rest:"Rest",swap:"Change of plan",race:"Race day",done:"Logged"}[c.call]||"Go";
  el.innerHTML='<div class="ccall" data-call="'+esc(c.call)+'">'+tag+'</div><div class="chead">'+esc(c.headline)+'</div>'+(c.why?'<div class="cwhy">'+esc(c.why)+'</div>':'');
}

var runSel=null; // day selected in the plan rail (iso); null = today
function openPlanEditor(d){
  var p=d?planFor(d):null, isNew=!p;
  document.getElementById("fmTitle").textContent=isNew?"Add a run":"Edit run";
  var types=Object.keys(RUN_TYPE).map(function(t){return '<option value="'+t+'"'+((p?p.type:"easy")===t?' selected':'')+'>'+RUN_TYPE[t].n+'</option>';}).join("");
  document.getElementById("fmBody").innerHTML=
    '<label class="eyebrow">Date</label><input id="peDate" type="date" value="'+(d||iso(TODAY))+'" style="width:100%;margin:6px 0 12px">'+
    '<div class="amtrow" style="margin:0 0 12px"><select id="peType" style="flex:1.4">'+types+'</select><input id="peMi" type="number" step="0.5" min="0.5" placeholder="miles" value="'+(p?p.mi:"")+'" style="flex:1"></div>'+
    '<input id="peNote" placeholder="note (optional)" value="'+esc(p?p.note:"")+'" style="width:100%;margin-bottom:12px">'+
    '<button class="btn full" id="peSave">'+(isNew?"Add run":"Save")+'</button>'+
    (isNew?'':'<button class="btn ghost full" id="peRemove" style="margin-top:8px">Remove this run</button>');
  openModal("foodModal");
  document.getElementById("peSave").addEventListener("click",function(){
    var nd=document.getElementById("peDate").value, mi=parseFloat(document.getElementById("peMi").value);
    if(!nd||isNaN(mi)){toast("Need a date and miles");return;}
    if(d&&nd!==d) editPlan(d,null); // moved to another day
    editPlan(nd,{type:document.getElementById("peType").value,mi:mi,note:document.getElementById("peNote").value.trim()});
    closeModal("foodModal"); toast(isNew?"Run added":"Plan updated");
  });
  var rm=document.getElementById("peRemove"); if(rm)rm.addEventListener("click",function(){editPlan(d,null);closeModal("foodModal");toast("Run removed");});
}
function drawRun(){
  var box=document.getElementById("runBody"); if(!box)return;
  var k=iso(TODAY),p=planFor(k),d=p?planDone(p):null,wk=planWeekIndex(),conn=STRAVA.connected;
  var goal=racesAll().filter(function(r){return r.goal;})[0],next=racesAll().filter(function(r){return !r.done&&r.d>=k;})[0];
  // race strip + plan progress
  var pct=Math.max(0,Math.min(100,Math.round(((wk-1)/PLAN_WEEKS)*100)));
  var strip='<div class="racestrip">'+racesAll().filter(function(r){return !r.done;}).map(function(r){var du=daysUntil(r.d);
    return '<div class="racechip'+(r.goal?" goal":"")+(r===next?" next":"")+'"><div class="rc-n">'+(r.goal?"🏁 ":"")+esc(r.name)+'</div><div class="rc-d">'+niceDate(r.d)+' · <b>'+(du===0?"today":du<0?"done":"in "+du+"d")+'</b></div></div>';}).join("")+'</div>';
  var prog='<div class="planprog"><div class="pp-l"><span>'+(wk<1?"Plan starts Mon Sep 21":wk>PLAN_WEEKS?"Plan complete":"Week "+wk+" of "+PLAN_WEEKS+" · "+planPhase(wk))+'</span><span class="num">'+daysUntil(goal.d)+'d to the Half</span></div><div class="bar" style="margin:8px 0 0"><span style="--p:'+(pct/100)+'"></span></div></div>';
  // today card
  var li=dayInfo(k);
  var title=p?planLabel(p):"No run today";
  var sub=p?(RUN_TYPE[p.type].pace+(p.note&&p.type!=="race"?" · "+p.note:"")):(li&&!li.rest?(li.name+" day on the Train tab. Miles another day."):"Nothing on the run plan. Recover, or pick a lift on Train.");
  var status;
  if(d){var a=d.runs[0];status='<div class="runstat done"><span class="chk pop">✓</span><div><b>Done</b> · '+d.mi.toFixed(2)+' mi @ '+fmtPace(a.paceSec)+(a.hr?' · ♥ '+a.hr:'')+'<small>from Strava · '+esc(a.name)+'</small></div></div>';}
  else if(p){status='<div class="runstat"><span class="chk"></span><div><b>Planned</b> · '+p.mi+' mi<small>'+(conn===false?"connect Strava to auto-check":"checks itself off when Strava sees it")+'</small></div></div>';}
  else {var rs=runsOn(k);status=rs.length?'<div class="runstat done"><span class="chk pop">✓</span><div><b>Bonus run</b> · '+rs[0].mi.toFixed(2)+' mi @ '+fmtPace(rs[0].paceSec)+'<small>not on the plan · counted anyway</small></div></div>':'';}
  var f=feelFor(k);
  var feel='<div class="feelrow"><div class="eyebrow" style="margin-bottom:8px">How do you feel today?</div><div class="moods">'+MOODS.map(function(m){return '<button class="mood'+(f&&f.mood===m[0]?" on":"")+'" data-mood="'+m[0]+'"><span>'+m[1]+'</span>'+m[2]+'</button>';}).join("")+'</div>'+
    '<div class="ftags">'+FEEL_TAGS.map(function(t){var on=f&&(f.tags||[]).indexOf(t)>=0;return '<button class="ftag'+(on?" on":"")+'" data-tag="'+esc(t)+'">'+esc(t)+'</button>';}).join("")+'</div></div>';
  var today='<article class="card runcard"><div class="head"><h2>'+esc(title)+'</h2><span class="date">Today · '+TODAY.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})+'</span></div>'+
    '<div class="focus">'+esc(sub)+'</div>'+status+'<div id="coachCard" class="coachcard"></div>'+feel+'</article>';
  // this week (Mon–Sun) + selected-day detail
  var wkp=thisWeekPlan(),sel=runSel||k;
  var rail='<div class="runrail">'+wkp.map(function(x){var di=dayInfo(x.k);var lab=x.p?planShort(x.p):(di&&!di.rest?di.short:"");
    return '<button class="rday'+(x.p?" plan":"")+(x.done?" done":"")+(x.k===k?" today":"")+(x.k===sel?" sel":"")+(x.p&&x.p.type==="race"?" race":"")+'" data-rday="'+x.k+'"><span class="dl">'+LET[x.dow]+'</span><span class="dn num">'+(+x.k.slice(8))+'</span><span class="dt">'+esc(lab||"–")+'</span>'+(x.done?'<span class="rdot"></span>':'')+'</button>';}).join("")+'</div>';
  var sd=wkp.filter(function(x){return x.k===sel;})[0]||wkp[0];
  var sdi=dayInfo(sd.k);
  var detail='<div class="rdetail">'+(sd.p?('<b>'+esc(planLabel(sd.p))+'</b> · '+esc(RUN_TYPE[sd.p.type].pace)+(sd.p.note&&sd.p.type!=="race"?'<br><span style="color:var(--muted)">'+esc(sd.p.note)+'</span>':'')):('<b>'+(sdi&&!sdi.rest?sdi.name+" day":"No run")+'</b> · <span style="color:var(--muted)">'+esc(sdi?sdi.focus:"Nothing logged. Recovery counts.")+'</span>'))+
    (sd.runs.length?'<div style="margin-top:7px">'+sd.runs.map(function(a){return '<span class="pill">✓ '+a.mi.toFixed(1)+' mi @ '+fmtPace(a.paceSec)+'</span>';}).join(" ")+'</div>':'')+'</div>';
  // weekly mileage (8 weeks, Mon-start)
  var wm=weekMiles(8),mx=Math.max(1,Math.max.apply(null,wm.map(function(w){return w.mi;}))),thisW=wm[wm.length-1],lastW=wm[wm.length-2];
  var bars='<section class="panel"><h3>Weekly miles</h3><div class="wkbars">'+wm.map(function(w,i){return '<div class="wkb'+(i===wm.length-1?" cur":"")+'"><div class="wkfill" style="--h:'+(w.mi/mx)+'"></div><span class="wkl">'+w.start.slice(5).replace("-","/")+'</span></div>';}).join("")+'</div>'+
    '<div class="wkline"><span><b class="num">'+thisW.mi+'</b> mi this week · '+thisW.runs+' run'+(thisW.runs===1?"":"s")+'</span><span style="color:var(--muted)">last week '+lastW.mi+'</span></div></section>';
  // recent runs from Strava (+ what else he did this week)
  var recent=STRAVA.acts.filter(isRunAct).slice(0,8);
  var other=(function(){var ws=iso(weekStartMon(TODAY)),c={};STRAVA.acts.forEach(function(a){if(a.date<ws||/run/.test(actType(a))||!isTrainAct(a))return;c[a.type]=(c[a.type]||0)+1;});
    return Object.keys(c).map(function(t){return c[t]+" "+t.replace(/([a-z])([A-Z])/g,"$1 $2").toLowerCase();}).join(" · ");})();
  var rec='<section class="panel"><h3>Recent runs · Strava</h3>'+(recent.length?'<div class="runlist">'+recent.map(function(a){return '<div class="runrow"><div class="rr-l"><b>'+a.mi.toFixed(2)+' mi</b><small>'+esc(a.name)+' · '+niceDate(a.date)+'</small></div><div class="rr-r num">'+fmtPace(a.paceSec)+'<small>'+fmtMin(a.min)+(a.hr?' · ♥ '+a.hr:'')+'</small></div></div>';}).join("")+'</div>'
    :(conn===null?'<div class="skel" style="height:44px;margin-bottom:8px">&nbsp;</div><div class="skel" style="height:44px">&nbsp;</div>':'<div class="empty">'+(conn===false?"Connect Strava (⤢ settings) to pull your runs.":"No runs in the last 70 days.")+'</div>'))+
    (other?'<div class="empty" style="padding-top:10px">Also this week: '+esc(other)+'</div>':'')+'</section>';
  // full plan, grouped by week
  var plist=allPlan(); var byWeek={};plist.forEach(function(q){var w=planWeekIndex(new Date(q.d+"T12:00:00"));(byWeek[w]=byWeek[w]||[]).push(q);});
  var doneN=plist.filter(function(q){return planDone(q);}).length;
  var plan='<details class="panel planfull"'+(wk>=1&&wk<=PLAN_WEEKS?"":" open")+'><summary><h3 style="margin:0;display:inline">Full plan · 10 weeks</h3><span class="sum-r">'+doneN+' / '+plist.length+' done</span></summary>'+
    Object.keys(byWeek).map(function(w){return '<div class="pw'+(+w===wk?" cur":"")+'"><div class="pw-h">Week '+w+' <span>'+planPhase(+w)+'</span></div>'+byWeek[w].map(function(q){var dn=planDone(q);
      return '<button class="pw-r'+(dn?" done":"")+(q.d===k?" today":"")+'" data-edit="'+q.d+'"><span class="chk">'+(dn?"✓":"")+'</span><span class="pw-d">'+niceDate(q.d,{weekday:"short",month:"numeric",day:"numeric"})+'</span><span class="pw-l">'+esc(planLabel(q))+(q.edited?' <span class="pw-e">edited</span>':'')+'</span>'+(dn?'<span class="pw-a num">'+dn.mi.toFixed(1)+' mi</span>':'<span class="pw-a" style="color:var(--muted)">›</span>')+'</button>';}).join("")+'</div>';}).join("")+
    '<button class="btn ghost full" id="addRunBtn" style="margin-top:12px">➕ Add a run</button><p class="empty" style="padding:8px 0 0">Tap any run to change it. You can also just tell Rocky ("move Thursday to Friday", "make Saturday 5 miles").</p></details>';
  var connect=conn===false?'<article class="card" style="border-left-color:#FC4C02"><div class="head"><h2>Connect Strava</h2></div><p style="font-size:13px;color:var(--muted);margin:10px 0 14px">Your watch already logs every run to Strava. Connect once and the plan checks itself off, the coach sees your real paces, and nothing gets typed twice.</p><button class="btn full" id="stravaConnectBtn" style="background:#FC4C02;border-color:#FC4C02;color:#fff">Connect Strava</button></article>':'';
  box.innerHTML=strip+prog+today+rail+detail+bars+rec+plan+connect;
  Array.prototype.forEach.call(box.querySelectorAll(".mood"),function(b){b.addEventListener("click",function(){setFeel(b.dataset.mood,null);});});
  Array.prototype.forEach.call(box.querySelectorAll(".ftag"),function(b){b.addEventListener("click",function(){var cur=feelFor(k)||{tags:[]};var t=(cur.tags||[]).slice();var i=t.indexOf(b.dataset.tag);if(i>=0)t.splice(i,1);else t.push(b.dataset.tag);setFeel(null,t);});});
  Array.prototype.forEach.call(box.querySelectorAll(".rday"),function(b){b.addEventListener("click",function(){runSel=b.dataset.rday;drawRun();});});
  var cb=document.getElementById("stravaConnectBtn"); if(cb)cb.addEventListener("click",stravaConnect);
  Array.prototype.forEach.call(box.querySelectorAll("[data-edit]"),function(b){b.addEventListener("click",function(){openPlanEditor(b.dataset.edit);});});
  var ar=document.getElementById("addRunBtn"); if(ar)ar.addEventListener("click",function(){openPlanEditor(null);});
  var c=(db.coachToday||{})[k]; if(c)renderTodayCoach(c); else if(!STRAVA.fetchedAt)renderTodayCoach(null); else coachToday(false);
}

/* ---------- HOME dashboard ---------- */
var _heroLast=null;
function countUp(el,from,to){
  if(!el)return; if(from===null||from===to||matchMedia("(prefers-reduced-motion: reduce)").matches){el.textContent=to;return;}
  var t0=performance.now(),dur=450;
  (function step(t){var q=Math.min(1,(t-t0)/dur);q=1-Math.pow(1-q,3);el.textContent=Math.round(from+(to-from)*q);if(q<1)requestAnimationFrame(step);})(t0);
}
function drawHome(){
  var box=document.getElementById("homeBody"); if(!box) return;
  var k=iso(TODAY), tg=targets(k), tot=dayTotals(k);
  var hd=HEALTH[k]||{}, burned=Math.round(hd.kcalToday||0), m=hd.metrics||{};
  var eatBack=!!db.settings.eatBack, calTarget=tg.cal+(eatBack?burned:0);
  var remain=calTarget-Math.round(tot.cal), pRemain=tg.p-Math.round(tot.p);
  var over=remain<0;
  // today's workout (freeform: whatever he picked, or nothing yet)
  var li=dayInfo(k), woV;
  if(!li){ woV="Not picked yet · tap to start"; }
  else if(li.rest){ woV="Rest from lifting"; }
  else if(li.cardio){ var e=db.log[k]; woV=li.name+(e&&e.done?" · done ✓":" · not logged"); }
  else { var s=session(k), dn=s.exercises.reduce(function(a,x){return a+Math.min(x.done||0,x.target||0);},0),
        tt=s.exercises.reduce(function(a,x){return a+(x.target||0);},0);
        woV=li.name+(tt?(" · "+dn+"/"+tt+" sets"):" · add exercises")+(isDayDone(k)?" ✓":""); }
  // today's run (plan + Strava + coach card)
  var rp=planFor(k), rd=rp?planDone(rp):null, bonus=(!rp&&runsOn(k).length)?runsOn(k)[0]:null;
  var rV=rp?(planLabel(rp)+(rd?" · done ✓ "+fmtPace(rd.runs[0].paceSec):" · planned")):(bonus?("Bonus run · "+bonus.mi.toFixed(1)+" mi @ "+fmtPace(bonus.paceSec)):"No run on the plan");
  var cc=(db.coachToday||{})[k];
  var goal=racesAll().filter(function(r){return r.goal;})[0];
  // weight
  var w=db.weights.slice().sort(function(a,b){return a.d<b.d?-1:1;}), cur=w.length?w[w.length-1].v:null;
  var wV=cur!==null?(cur.toFixed(1)+" lb · goal 195"):"No weigh-in yet";
  var streak=foodStreak();
  var hStats=[];
  if(m.steps!=null)hStats.push(Math.round(m.steps).toLocaleString()+" steps");
  if(m.move!=null)hStats.push(Math.round(m.move)+" move");
  if(burned)hStats.push(burned+" workout cal");
  var greeting=(TODAY.getHours()<12?"Good morning":TODAY.getHours()<18?"Good afternoon":"Good evening");
  function card(view,ic,t,v,sub){return '<button class="homecard" data-go="'+view+'"><span class="hc-ic">'+ic+'</span><span class="hc-main"><span class="hc-t">'+t+'</span><span class="hc-v">'+esc(v)+(sub?'<small style="display:block;color:var(--muted);font-size:12px;margin-top:2px">'+esc(sub)+'</small>':'')+'</span></span><span class="hc-arrow">›</span></button>';}
  box.innerHTML=
    // top block: greeting + hero calories
    '<div class="homeTop">'+
      '<div style="margin:6px 0 12px;color:var(--muted);font-size:13px">'+greeting+', John.'+(streak>=2?' <b style="color:var(--gold)">🔥 '+streak+"-day streak</b>":"")+' <span style="white-space:nowrap">· 🏁 Half in <b class="num" style="color:var(--text)">'+daysUntil(goal.d)+'</b>d</span></div>'+
      '<button class="hero-cal" data-go="food" style="display:block;width:100%;border-width:1px 1px 1px 3px;cursor:pointer;margin-bottom:0">'+
        '<div class="big'+(over?" over":"")+'">'+(over?"+":"")+'<span class="cu">'+Math.abs(remain)+'</span></div>'+
        '<div class="cap">'+(over?"calories over":"calories left")+'</div>'+
        '<div class="sub"><b>'+Math.round(tot.cal)+'</b> / '+calTarget+' kcal &nbsp;·&nbsp; protein <b>'+Math.round(tot.p)+'</b>/'+tg.p+'g'+(pRemain>0?" ("+pRemain+" to go)":" ✓")+'</div>'+
      '</button>'+
    '</div>'+
    // bottom block: quick cards, anchored above the tab bar
    '<div class="homeBottom">'+
      card("run","🏃","Today's run",rV,cc?cc.headline:null)+
      card("train","🏋️","Today's workout",woV)+
      '<div class="homerow">'+card("body","📊","Bodyweight",wV)+card("food","🍽️","Eaten today",Math.round(tot.cal)+" kcal · "+Math.round(tot.p)+"g P")+'</div>'+
      (hStats.length?card("body","⌚","Apple Health",hStats.join(" · ")):"")+
    '</div>';
  var val=Math.abs(remain); countUp(box.querySelector(".hero-cal .cu"),_heroLast,val); _heroLast=val;
}
/* ---- Native shell: Apple Health device-sync panel (only inside the iOS app) ---- */
function nhSend(action){ try{ if(window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.platformHealth){ window.webkit.messageHandlers.platformHealth.postMessage({action:action}); } }catch(e){} }
window.__platformHealth={ state:null, update:function(s){ this.state=s; drawNativeHealth(); } };
function drawNativeHealth(){
  var p=document.getElementById("nativeHealthPanel"); if(!p)return;
  // Hidden: native HealthKit reader can't run under SideStore free signing, so
  // Health data comes via Auto Export (shown in the main card below). Keeping the
  // bridge code + markup in place so it flips back on with a $99 dev-account build.
  p.style.display="none"; return;
  /* eslint-disable no-unreachable */
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
function renderAll(){drawHome();drawRail();drawTrainCard();drawLifts();drawRuns();drawRun();drawWeight();drawFood();drawHealthStats();drawNativeHealth();drawTargets();drawRecipes();updateFoot();}
drawDateBar();
renderAll();
setSync(cfg.url&&cfg.tok?"ok":"");
if(cfg.url&&cfg.tok){ pull(function(){renderAll();coachToday(false);}); pullHealth(); pullStrava(false); }
// keep Apple Health fresh: on foreground, on Food tab, and every 60s
document.addEventListener("visibilitychange",function(){if(!document.hidden){rollDay();pullHealth();pullStrava(false);}});
function rollDay(){ var n=new Date(); if(iso(n)===iso(TODAY))return; var wasToday=iso(viewing)===iso(TODAY); TODAY=n; if(wasToday){viewing=new Date(n);viewing.setHours(0,0,0,0);} runSel=null; drawDateBar(); renderAll(); }
setInterval(rollDay,60000);
var foodTab=document.querySelector('.tab[data-view="food"]'); if(foodTab)foodTab.addEventListener("click",pullHealth);
setInterval(pullHealth,60000);
setInterval(function(){pullStrava(false);},5*60000);
// back from Strava's Authorize screen (/strava/callback bounces here with ?strava=connected|error)
(function(){ try{ var sp=new URLSearchParams(location.search), s=sp.get("strava"); if(!s)return;
  history.replaceState({},"",location.pathname);
  if(s==="connected"){ toast("Strava connected ✓"); var t=document.querySelector('.tab[data-view="run"]'); if(t)t.click(); pullStrava(true); }
  else toast("Strava connection failed. Try again from ⤢ settings."); }catch(e){} })();

/* ---------- AI Coach (available on every tab) ---------- */
function mdlite(s){ return String(s)
  .replace(/\*\*(.+?)\*\*/g,"$1").replace(/__(.+?)__/g,"$1")
  .replace(/`(.+?)`/g,"$1")
  .replace(/^#{1,6}\s*/gm,"").replace(/^\s*[-*]\s+/gm,"• "); }
function stamp(ms){ return new Date(ms).toLocaleString(undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
// turn bare URLs in an (already escaped) string into tappable links that open outside the PWA
function linkify(s){ return s.replace(/(https?:\/\/[^\s<]+[^\s<.,;:)!?\u2019'"])/g,function(u){ var show=u.replace(/^https?:\/\/(www\.)?/,""); if(show.length>48)show=show.slice(0,45)+"…"; return '<a href="'+u+'" target="_blank" rel="noopener" class="clink">'+show+'</a>'; }); }
function coachContext(){
  var k=iso(TODAY), tg=targets(k), tot=dayTotals(k);
  var hd=HEALTH[k]||{}; var burned=Math.round(hd.kcalToday||0);
  var eatBack=!!db.settings.eatBack, calTarget=tg.cal+(eatBack?burned:0);
  var w=db.weights.slice().sort(function(a,b){return a.d<b.d?-1:1;});
  var curWeight=w.length?w[w.length-1].v:START;
  // lifting is freeform: what he picked + logged today, and what he actually trained recently
  var li=dayInfo(k), le=db.log[k]||{};
  var todayW = !li ? {type:"Not chosen yet", note:"He picks Push / Pull / Legs / Shoulders & Arms / Full body / Soccer / Rest when he trains; nothing is prescribed by weekday."}
             : li.rest ? {type:"Rest day"}
             : li.cardio ? {type:li.name, done:!!le.done}
             : {name:li.name, focusArea:li.type, session:(le.exercises||[]).map(function(x){return x.name+" "+(x.done||0)+"/"+(x.target||0)+" sets"+(x.scheme?" ("+x.scheme+")":"");}), finished:!!le.finished};
  return {
    now:stamp(Date.now())+" (America/New_York). This is the CURRENT date and time. User messages are prefixed with the time John sent them.",
    today:k, trainingDay:dtypeFor(k), goal:"247 -> 195 lb cut",
    profile:{ startWeight:START, goalWeight:195, currentWeight:curWeight,
      meetBests:{squat:485,bench:309,deadlift:562}, gymLifts:{squat1RM:385,bench1RM:260},
      training:"Freeform lifting 3-4x/week: he picks the kind of day (push/pull/legs/shoulders&arms/full) and logs exercises as he goes. Soccer usually Wednesday. Running plan lives on the Run tab. Cut targets ~1900 kcal/186g protein training days, 1825/185 rest days." },
    todayWorkout:todayW,
    recentSessions:recentSessions(10),
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
    loggingStreak:foodStreak(),
    running:(function(){
      var rp=planFor(k), rd=rp?planDone(rp):null, wk=planWeekIndex();
      var since=new Date(TODAY); since.setDate(since.getDate()-14); var sk=iso(since);
      return {
        stravaConnected:STRAVA.connected,
        goalRace:"Invesco QQQ Thanksgiving Half Marathon, Thu 2026-11-26 (2025 result 2:40:50, 11:11/mi). Goal: finish strong, not a PR.",
        planWeek:(wk>=1&&wk<=PLAN_WEEKS)?(wk+" of "+PLAN_WEEKS+" ("+planPhase(wk)+")"):(wk<1?"plan starts "+PLAN_START:"plan complete"),
        planShape:"3 runs/week: Mon easy, Thu quality (tempo/strides), Sat long. Sun legs + Wed soccer unchanged. Long run 4,5,6,5,(PNC 10mi),7,9,11 peak, 7 taper, race.",
        thisWeek:thisWeekPlan().filter(function(x){return x.p;}).map(function(x){return x.k+" "+planLabel(x.p)+(x.done?" (done "+x.done.mi+" mi)":"");}),
        todayPlanned:rp?planLabel(rp)+(rp.note?" ("+rp.note+")":""):null,
        todayDone:rd?rd.runs.map(function(a){return a.mi+" mi @ "+fmtPace(a.paceSec)+(a.hr?" HR "+a.hr:"");}):null,
        feelToday:feelFor(k),
        consecutiveTrainingDays:trainStreak(),
        weeklyMiles:weekMiles(6),
        recentActivities:STRAVA.acts.filter(function(a){return a.date>=sk;}).map(function(a){return a.date+" "+a.type+" "+(a.mi?a.mi+"mi ":"")+Math.round(a.min)+"min"+(a.paceSec?" @"+fmtPace(a.paceSec):"")+(a.hr?" HR"+a.hr:"")+(isGlitch(a)?" (GPS glitch, ignore)":"");}),
        upcomingRaces:racesAll().filter(function(r){return !r.done&&r.d>=k;}).map(function(r){return r.name+" "+r.d+" (in "+daysUntil(r.d)+"d)"+(r.goal?" GOAL":"");}),
        fullPlan:allPlan().filter(function(q){return q.d>=k;}).map(function(q){return q.d+" "+q.type+" "+q.mi+"mi"+(q.note?" ("+q.note+")":"")+(q.edited?" [edited]":"");}),
        editing:"You CAN change this plan with the edit_plan tool (add/move/resize/remove runs by date) and races with edit_race. Do it when he asks, confirm what changed."
      };
    })()
  };
}
var COACH_CHIPS=["Should I run today?","How's my running week looking?","How much protein do I have left?","What's my workout today?","Am I overdoing it?","What should I eat for dinner?"];
function coachRender(){
  var box=document.getElementById("coachMsgs");
  if(!db.chat.length){
    box.innerHTML='<div id="coachEmpty">👋 It\'s Rocky. Same one from your computer: I know your training, your plan, your week, and what you tell me here.'+
      '<div class="coachchips">'+COACH_CHIPS.map(function(c){return '<button data-chip="'+esc(c)+'">'+esc(c)+'</button>';}).join("")+'</div></div>';
    Array.prototype.forEach.call(box.querySelectorAll(".coachchips button"),function(b){
      b.addEventListener("click",function(){document.getElementById("coachText").value=b.dataset.chip;coachSend();});
    });
    return;
  }
  box.innerHTML=db.chat.map(function(m){
    var cls=m.role==="user"?"user":(m.role==="act"?"act":"bot");
    return '<div class="cmsg '+cls+'">'+linkify(esc(mdlite(m.content)))+'</div>';
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
  if(a.tool==="edit_plan"){ var ch=(a.input&&a.input.changes)||[]; if(!ch.length)return null; var notes=[];
    ch.forEach(function(c){ if(!c||!/^\d{4}-\d{2}-\d{2}$/.test(c.date||""))return;
      if(c.remove){ editPlan(c.date,null); notes.push("removed "+c.date); return; }
      if(c.moveTo&&/^\d{4}-\d{2}-\d{2}$/.test(c.moveTo)){ var cur=planFor(c.date); editPlan(c.date,null); editPlan(c.moveTo,{type:c.type||(cur&&cur.type),mi:c.mi!=null?c.mi:(cur&&cur.mi),note:c.note!=null?c.note:(cur&&cur.note)}); notes.push(c.date.slice(5)+" → "+c.moveTo.slice(5)); return; }
      editPlan(c.date,{type:c.type,mi:c.mi,note:c.note}); notes.push(c.date.slice(5)+": "+(c.type||"")+" "+(c.mi!=null?c.mi+" mi":"")); });
    return notes.length?("🗓️ Plan updated · "+notes.join(" · ")):null; }
  if(a.tool==="edit_race"){ var r=a.input||{}; if(!r.name)return null; if(r.remove){editRace(r.name,null);return "🏁 Removed race: "+r.name;} var chg={}; if(r.date)chg.d=r.date; if(r.where)chg.where=r.where; if(r.dist)chg.dist=r.dist; if(r.goal!=null)chg.goal=!!r.goal; if(r.done!=null)chg.done=!!r.done; if(r.result)chg.result=r.result; editRace(r.name,chg); return "🏁 Race updated: "+r.name+(r.date?" → "+r.date:""); }
  if(a.tool==="log_feel"){ var md=String(a.input.mood||"").toLowerCase(); if(!MOODS.some(function(m){return m[0]===md;}))return null; var tg=(a.input.tags||[]).map(String).slice(0,6); db.feel=db.feel||{}; db.feel[k]={mood:md,tags:tg,ts:Date.now()}; drawRun(); setTimeout(function(){coachToday(true);},50); return "🏃 Logged how you feel: "+md+(tg.length?" · "+tg.join(", "):""); }
  return null;
}
var coachBusy=false;
function coachSend(){
  if(coachBusy)return;
  var ta=document.getElementById("coachText"), text=ta.value.trim(); if(!text)return;
  if(!cfg.url||!cfg.tok){ db.chat.push({role:"bot",content:"Connect cloud sync first (⤢ up top) — the coach runs through your synced backend."}); coachRender(); return; }
  db.chat.push({role:"user",content:text,ts:Date.now()}); ta.value=""; ta.style.height="auto";
  coachBusy=true; coachRender();
  var box=document.getElementById("coachMsgs");
  var think=document.createElement("div"); think.className="cmsg think"; think.textContent="Rocky is thinking…"; box.appendChild(think); box.scrollTop=box.scrollHeight;
  var apiMsgs=db.chat.filter(function(m){return m.role==="user"||m.role==="assistant";}).map(function(m){return {role:m.role==="assistant"?"assistant":"user",content:(m.role==="user"&&m.ts?("["+stamp(m.ts)+"] "):"")+m.content};});
  fetch(cfg.url.replace(/\/$/,"")+"/ai/chat",{method:"POST",
    headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},
    body:JSON.stringify({messages:apiMsgs,context:coachContext(),memory:db.memory,tone:coachTone()})})
   .then(function(r){return r.ok?r.json():r.text().then(function(t){throw new Error(t);});})
   .then(function(out){
     if(out.reply) db.chat.push({role:"assistant",content:out.reply,ts:Date.now()});
     (out.actions||[]).forEach(function(a){ var note=coachApply(a); if(note) db.chat.push({role:"act",content:note,ts:Date.now()}); });
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
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js?v=41").catch(function(){}); }

/* ---------- auto-update: tell John when a new version is live ---------- */
var APPVER=41; // bump this + version.json + ?v= on every release
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
