(function(){
"use strict";

/* ---------- The Cut program (by weekday 0=Sun..6=Sat) ---------- */
var PROGRAM = {
  2:{name:"Lower",tag:"The one that has to happen",focus:"Main lifts stop 2 reps short of failure.",
     ex:[["Squat","4 × 5"],["Trap-Bar Deadlift / RDL","3 × 6"],["Split Squat","3 × 10 ea"],["Leg Curl","3 × 12"],["Standing Calf Raise","3 × 15"]]},
  4:{name:"Upper A",tag:"Push + pull",focus:"Leave 2 in the tank on the barbell work.",
     ex:[["Bench","4 × 6"],["Row","4 × 8"],["Overhead Press","3 × 8"],["Lat Pulldown","3 × 10"]]},
  5:{name:"Upper B",tag:"Hypertrophy + delts",focus:"Chase the taper. Accessories closer to failure.",
     ex:[["Incline DB Press","4 × 8"],["Chest-Supported Row","4 × 10"],["Lateral Raise","3 × 15"],["Curls","3 × 12"],["Triceps","3 × 12"]]},
  0:{name:"Lower B",tag:"Optional 4th",focus:"If Tuesday slipped, this becomes the real lower day.",optional:true,
     ex:[["Leg Press","3 × 12"],["Walking Lunge","3 × 10 ea"],["Leg Extension","3 × 15"],["Leg Curl","3 × 15"],["Abs","3 × 12"]]},
  3:{name:"Soccer",cardio:true,focus:"~2.5 hrs. This is your conditioning — don't add cardio on top.",note:"Hydrate hard."},
  1:{name:"Rest",rest:true,focus:"Recovery + Amy. Hit protein, get your steps.",note:""},
  6:{name:"Rest",rest:true,focus:"Recovery + Amy. Hit protein, get your steps.",note:""}
};
var SHORT={0:"Lower B",1:"Rest",2:"Lower",3:"Soccer",4:"Upper A",5:"Upper B",6:"Rest"};
var LET=["S","M","T","W","T","F","S"];
var START=247, RUNGS=[247,235,225,215,205,195];
var LIFT_DAYS={0:1,2:1,4:1,5:1}; // training-macro default

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
    document.getElementById("v-"+t.dataset.view).classList.add("on");
    window.scrollTo(0,0);
  });
});

/* ---------- TRAIN: rail + card ---------- */
function totalSets(dow){var p=PROGRAM[dow];if(!p.ex)return 0;return p.ex.reduce(function(a,e){return a+parseInt(e[1],10);},0);}
function dayEntry(k){return db.log[k]||(db.log[k]={sets:{},done:false});}
function doneSets(k,dow){var e=db.log[k];if(!e||!e.sets)return 0;var p=PROGRAM[dow];if(!p.ex)return 0;var n=0;for(var i=0;i<p.ex.length;i++)n+=(e.sets[i]||0);return n;}
function isDayDone(k,dow){var p=PROGRAM[dow];var e=db.log[k];if(!e)return false;if(p.rest)return false;if(p.cardio)return !!e.done;return totalSets(dow)>0&&doneSets(k,dow)>=totalSets(dow);}

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
    b.addEventListener("click",function(){var d=new Date(weekStart(viewing));d.setDate(d.getDate()+ +b.dataset.i);viewing=d;drawRail();drawTrainCard();});
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
    var tot=totalSets(dow),got=doneSets(k,dow),pct=tot?Math.round(got/tot*100):0;
    h+='<div class="bar'+(pct>=100?" full":"")+'"><span style="width:'+pct+'%"></span></div>'+
      '<div class="barlabel"><span>'+(pct>=100?"Session complete":"Sets logged")+'</span><span class="num">'+got+' / '+tot+'</span></div><ul class="ex">';
    var e2=dayEntry(k);
    p.ex.forEach(function(x,i){var n=parseInt(x[1],10),c=e2.sets[i]||0;
      h+='<li'+(c>=n?' data-complete="1"':'')+'><div class="exname">'+x[0]+'<small>'+x[1]+'</small></div><div class="sets">';
      for(var s=1;s<=n;s++)h+='<button class="set" data-ex="'+i+'" data-s="'+s+'" aria-pressed="'+(s<=c)+'" aria-label="'+x[0]+' set '+s+'">'+s+'</button>';
      h+='</div></li>';});
    h+='</ul>';
  }
  document.getElementById("trainCard").innerHTML=h;
  var cb=document.getElementById("cardioBtn");
  if(cb)cb.addEventListener("click",function(){var e=dayEntry(k);e.done=!e.done;save();drawRail();drawTrainCard();});
  Array.prototype.forEach.call(document.querySelectorAll("#trainCard .set"),function(b){
    b.addEventListener("click",function(){var e=dayEntry(k),i=+b.dataset.ex,s=+b.dataset.s;e.sets[i]=(e.sets[i]===s)?s-1:s;save();drawRail();drawTrainCard();});
  });
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
}

/* ---------- Apple Health stats (Body tab) ---------- */
function drawHealthStats(){
  var el=document.getElementById("healthStats"); if(!el) return;
  var hd=HEALTH[iso(TODAY)]||{}, m=hd.metrics||{}, burned=Math.round(hd.kcalToday||0);
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
function targets(k){ var t=dtypeFor(k); return t==="train"?{cal:1900,p:186,fib:30}:{cal:1825,p:185,fib:30}; }
function foodFor(k){ return db.food[k]||(db.food[k]=[]); }
function dayTotals(k){ return foodFor(k).reduce(function(a,x){a.cal+=x.cal||0;a.p+=x.protein||0;a.fib+=x.fiber||0;return a;},{cal:0,p:0,fib:0}); }

function drawFood(){
  var k=iso(TODAY);
  document.getElementById("foodDate").textContent=TODAY.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
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
  document.getElementById("rings").innerHTML=
    ring("",tot.cal,calTarget,"kcal","calories")+ring("prot",tot.p,tg.p,"g","protein")+ring("",tot.fib,tg.fib,"g","fiber");
  // MyFitnessPal-style exercise line (from Apple Health)
  var ex=document.getElementById("exercise");
  var remaining=calTarget-Math.round(tot.cal);
  var wlist=(hd.workouts||[]).map(function(w){return '<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:5px 0;border-bottom:1px solid var(--border)"><span>'+esc(w.type)+(w.min?(' · '+w.min+' min'):'')+'</span><span class="num" style="color:var(--gold)">'+w.kcal+' kcal</span></div>';}).join("");
  ex.innerHTML=
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">'+
      '<div style="font-size:13.5px">🔥 <b>Exercise</b> <span style="color:var(--muted)">— Apple Health</span><br>'+
      '<span class="num" style="font-size:20px;color:var(--gold)">'+burned+'</span> <span style="color:var(--muted);font-size:12px">kcal burned today</span></div>'+
      '<label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer">'+
        '<input type="checkbox" id="eatBack" '+(eatBack?"checked":"")+' style="flex:none;width:18px;height:18px"> add to budget</label>'+
    '</div>'+
    (wlist?('<div style="margin-top:10px">'+wlist+'</div>'):'')+
    '<div style="margin-top:10px;font-size:12.5px;color:var(--muted)">Remaining today: <b class="num" style="color:'+(remaining<0?"var(--red)":"var(--green)")+'">'+remaining+'</b> kcal'+
      (eatBack?' <span style="color:var(--muted)">(budget +'+burned+' for exercise)</span>':(burned?' <span style="color:var(--muted)">· '+burned+' available if you eat back</span>':''))+'</div>';
  var ebc=document.getElementById("eatBack");
  if(ebc) ebc.addEventListener("change",function(){db.settings.eatBack=ebc.checked;save();drawFood();});
  // staples
  document.getElementById("staples").innerHTML=STAPLES.map(function(s,i){
    return '<button class="staple" data-i="'+i+'">'+esc(s.n)+'<small>'+s.note+'</small></button>';
  }).join("");
  Array.prototype.forEach.call(document.querySelectorAll("#staples .staple"),function(b){
    b.addEventListener("click",function(){openStaple(STAPLES[+b.dataset.i]);});
  });
  // log
  var list=foodFor(k);
  document.getElementById("foodEmpty").style.display=list.length?"none":"block";
  document.getElementById("foodLog").innerHTML=list.map(function(x,i){
    return '<div class="foodrow"><div class="fn">'+esc(x.name)+'<small>'+esc(x.amt||"")+'</small></div>'+
      '<div class="fk">'+Math.round(x.cal)+' kcal<br><span style="color:var(--gold)">'+Math.round(x.protein)+'p</span></div>'+
      '<button class="del" data-i="'+i+'" aria-label="Remove">×</button></div>';
  }).join("");
  Array.prototype.forEach.call(document.querySelectorAll("#foodLog .del"),function(b){
    b.addEventListener("click",function(){foodFor(k).splice(+b.dataset.i,1);save();drawFood();});
  });
}
Array.prototype.forEach.call(document.querySelectorAll("#dayType button"),function(b){
  b.addEventListener("click",function(){db.dtype[iso(TODAY)]=b.dataset.t;save();drawFood();});
});

function addFood(item){ foodFor(iso(TODAY)).push(item); save(); drawFood(); toast("Logged "+Math.round(item.protein)+"g protein"); }
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

/* AI talk/type */
document.getElementById("talkBtn").addEventListener("click",function(){
  document.getElementById("fmTitle").textContent="Talk or type what you ate";
  document.getElementById("fmBody").innerHTML=
    '<textarea id="aiText" rows="3" placeholder="e.g. 8 oz chicken, a cup of rice, half a cup of black beans" style="width:100%"></textarea>'+
    '<p style="font-size:11.5px;color:var(--muted);margin:6px 0 12px">Tip: tap the 🎤 on your keyboard to say it out loud.</p>'+
    '<button class="btn gold full" id="aiGo">Parse it</button><div id="aiOut" style="margin-top:14px"></div>';
  openModal("foodModal"); setTimeout(function(){document.getElementById("aiText").focus();},100);
  document.getElementById("aiGo").addEventListener("click",function(){
    if(!cfg.url||!cfg.tok){document.getElementById("aiOut").innerHTML='<p style="color:var(--red);font-size:12.5px">Connect cloud sync first (⤢ up top) — the AI runs through your synced backend.</p>';return;}
    var text=document.getElementById("aiText").value.trim(); if(!text)return;
    var out=document.getElementById("aiOut"); out.innerHTML='<p style="color:var(--muted);font-size:12.5px">Thinking…</p>';
    fetch(cfg.url.replace(/\/$/,"")+"/ai/parse",{method:"POST",headers:{"Authorization":"Bearer "+cfg.tok,"Content-Type":"application/json"},body:JSON.stringify({text:text})})
     .then(function(r){return r.json();})
     .then(function(j){
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
     .catch(function(){out.innerHTML='<p style="color:var(--red);font-size:12.5px">Network error. Check your connection.</p>';});
  });
});

/* barcode scan */
var zxReader=null, zxControls=null;
document.getElementById("scanBtn").addEventListener("click",function(){
  document.getElementById("fmTitle").textContent="Scan a barcode";
  document.getElementById("fmBody").innerHTML=
    '<video id="scanVideo" playsinline autoplay muted style="width:100%;aspect-ratio:4/3;object-fit:cover;background:#000;border-radius:10px"></video><div id="scanMsg" style="font-size:12.5px;color:var(--muted);margin-top:6px">Starting rear camera…</div>';
  openModal("foodModal");
  loadZX(function(ok){
    if(!ok){document.getElementById("scanMsg").innerHTML='Scanner unavailable offline. Use Talk/type or Quick tap.';return;}
    try{
      zxReader=new window.ZXingBrowser.BrowserMultiFormatReader();
      var msg=document.getElementById("scanMsg");
      if(msg)msg.textContent="Point the rear camera at the barcode…";
      // Force the REAR camera — phones otherwise default to the selfie cam, which can't see the barcode.
      zxReader.decodeFromConstraints({video:{facingMode:{ideal:"environment"}}},"scanVideo",function(result,err,controls){
        zxControls=controls;
        if(result){ controls.stop(); onBarcode(result.getText()); }
      }).catch(function(){
        // Fallback: whatever camera the browser will give us.
        try{ zxReader.decodeFromVideoDevice(undefined,"scanVideo",function(result,err,controls){
          zxControls=controls; if(result){ controls.stop(); onBarcode(result.getText()); }
        }); }catch(x){ if(msg)msg.textContent="Couldn't start the camera. Check camera permission for this site."; }
      });
    }catch(e){document.getElementById("scanMsg").textContent="Couldn't start the camera. Check camera permission.";}
  });
});
document.getElementById("foodModal").addEventListener("click",function(e){ if(e.target===this && zxControls){try{zxControls.stop();}catch(x){}zxControls=null;} });
Array.prototype.forEach.call(document.querySelectorAll("#foodModal [data-close]"),function(b){b.addEventListener("click",function(){if(zxControls){try{zxControls.stop();}catch(x){}zxControls=null;}});});

function loadZX(cb){
  if(window.ZXingBrowser){cb(true);return;}
  var s=document.createElement("script");
  s.src="https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js";
  s.onload=function(){cb(!!window.ZXingBrowser);}; s.onerror=function(){cb(false);};
  document.head.appendChild(s);
}
function onBarcode(code){
  var msg=document.getElementById("scanMsg"); if(msg)msg.textContent="Looking up "+code+"…";
  fetch("https://world.openfoodfacts.org/api/v2/product/"+encodeURIComponent(code)+"?fields=product_name,brands,nutriments,serving_size")
   .then(function(r){return r.json();})
   .then(function(j){
     if(!j||j.status!==1||!j.product){document.getElementById("fmBody").innerHTML='<p style="font-size:13px">Not found in the database ('+esc(code)+'). Log it with Talk/type instead.</p>';return;}
     var p=j.product,nu=p.nutriments||{};
     var per={cal:nu["energy-kcal_100g"]||0,p:nu.proteins_100g||0,c:nu.carbohydrates_100g||0,f:nu.fat_100g||0,fib:nu.fiber_100g||0};
     var name=(p.product_name||"Product")+(p.brands?(" · "+p.brands.split(",")[0]):"");
     openScanned(name,per,p.serving_size);
   })
   .catch(function(){document.getElementById("fmBody").innerHTML='<p style="font-size:13px">Lookup failed. Try again or use Talk/type.</p>';});
}
function openScanned(name,per,serving){
  document.getElementById("fmTitle").textContent=name;
  document.getElementById("fmBody").innerHTML=
    '<p style="font-size:11.5px;color:var(--muted);margin-bottom:8px">Per 100g: '+Math.round(per.cal)+' kcal · '+Math.round(per.p)+'g protein'+(serving?(" · pack serving "+esc(serving)):"")+'</p>'+
    '<div class="amtrow"><input id="fmAmt" type="number" step="5" min="0" placeholder="grams eaten" style="flex:1"></div>'+
    '<div class="prev" id="fmPrev">—</div><button class="btn full" id="fmAdd">Add to log</button>';
  var amt=document.getElementById("fmAmt"),prev=document.getElementById("fmPrev");
  function refresh(){var g=parseFloat(amt.value)||0,m=scaleMacros(per,g);prev.innerHTML=g?('<b>'+Math.round(m.cal)+'</b> kcal · <b>'+Math.round(m.protein)+'g</b> protein · '+Math.round(m.carbs)+'c · '+Math.round(m.fat)+'f · '+Math.round(m.fiber)+' fib'):"—";}
  amt.addEventListener("input",refresh);
  document.getElementById("fmAdd").addEventListener("click",function(){
    var g=parseFloat(amt.value)||0; if(!g)return; var m=scaleMacros(per,g);
    m.name=name; m.amt=g+" g"; m.src="scan"; m.ts=Date.now(); addFood(m); closeModal("foodModal");
  });
  setTimeout(function(){amt.focus();},100);
}

function toast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("on");setTimeout(function(){t.classList.remove("on");},1600);}

/* ---------- forms ---------- */
document.getElementById("wForm").addEventListener("submit",function(ev){ev.preventDefault();
  var v=parseFloat(document.getElementById("wIn").value);if(isNaN(v))return;var k=iso(TODAY);
  db.weights=db.weights.filter(function(x){return x.d!==k;});db.weights.push({d:k,v:v});save();
  document.getElementById("wIn").value="";drawWeight();});
document.getElementById("sForm").addEventListener("submit",function(ev){ev.preventDefault();
  var l=document.getElementById("sLift").value.trim(),w=parseFloat(document.getElementById("sWt").value),r=parseInt(document.getElementById("sReps").value,10);
  if(!l||isNaN(w)||isNaN(r))return;db.lifts.push({lift:l,wt:w,reps:r,d:iso(TODAY)});save();this.reset();drawLifts();});
document.getElementById("rForm").addEventListener("submit",function(ev){ev.preventDefault();
  var m=parseFloat(document.getElementById("rMi").value),t=document.getElementById("rTime").value.trim();
  if(isNaN(m)||!t)return;db.runs.push({mi:m,t:t,d:iso(TODAY)});save();this.reset();drawRuns();});

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

/* ---------- render ---------- */
function renderAll(){drawRail();drawTrainCard();drawLifts();drawRuns();drawWeight();drawFood();drawHealthStats();updateFoot();}
renderAll();
setSync(cfg.url&&cfg.tok?"ok":"");
if(cfg.url&&cfg.tok){ pull(function(){renderAll();}); pullHealth(); }
// keep Apple Health fresh: on foreground, on Food tab, and every 60s
document.addEventListener("visibilitychange",function(){if(!document.hidden)pullHealth();});
var foodTab=document.querySelector('.tab[data-view="food"]'); if(foodTab)foodTab.addEventListener("click",pullHealth);
setInterval(pullHealth,60000);

/* PWA */
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js?v=4").catch(function(){}); }
})();
