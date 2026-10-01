const $=s=>document.querySelector(s);
const toast=m=>{const t=$('#toast');t.textContent=m;t.classList.add('s');clearTimeout(toast.h);toast.h=setTimeout(()=>t.classList.remove('s'),1800)};
const note='<svg viewBox="0 0 24 24"><path d="M9 18V6l11-2v12"/><circle cx="6.500" cy="18" r="2.500"/><circle cx="17.500" cy="16" r="2.500"/></svg>';
const ppl='<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c0-4 3-6 6.500-6s6.500 2 6.500 6"/></svg>';
const rooms=[
 ['Général',128,'🌍','Salon Général'],
 ['Français',86,'FR','Salon Français'],
 ['International',97,'🌐','Salon International'],
 ['Couples',54,'💕','Salon Couples'],
 ['Amateurs',63,'✨','Salon Amateurs'],
 ['Musique',42,'🎵','Salon Musique'],
 ['VIP Lounge',12,'👑','VIP Lounge'],
 ['Premium',8,'💎','Salon Premium']];
const slugs=['general','francais','international','couples','amateurs','musique','vip','premium'];
const privates=['vip','premium']; /* BACK : le serveur doit aussi refuser la connexion si l'accès n'est pas accordé */
const themeParam=new URLSearchParams(location.search).get('theme');
let cur=Math.max(0,slugs.indexOf(themeParam));
/* Salon privé : accès seulement si un modérateur / administrateur l'a accordé */
if(privates.includes(slugs[cur])){SalonAccess.status(slugs[cur]).then(s=>{if(s==='approved')document.documentElement.style.visibility='';else location.replace('salons.html?acces='+s)})}
function drawRooms(){$('#rooms').innerHTML=rooms.map((r,i)=>`<button class="room ${i==cur?'act':''}" data-i="${i}"><b class="ic">${r[2]}</b>${r[0]}${privates.includes(slugs[i])?' 🔒':''}<span>${ppl}${r[1]}</span></button>`).join('');
 $('#rt').textContent=rooms[cur][3];document.title='E-Visiocam – '+rooms[cur][3];$('#rc').textContent=rooms[cur][1]+' connectés';$('#mc').textContent=rooms[cur][1]}
$('#rooms').onclick=async e=>{const b=e.target.closest('.room');if(b){const i=+b.dataset.i;
 if(privates.includes(slugs[i])&&await SalonAccess.status(slugs[i])!=='approved'){toast('Salon privé : demandez l\'accès depuis la page Salons');return}
 cur=i;drawRooms();history.pushState(null,'','?theme='+slugs[cur]);
 pub.length=0;pub.push(['Vous','#ffd60a','#ffd60a','Bienvenue dans le salon '+rooms[cur][0]+' !',hm()]);drawPub();
 /* BACK : charger ici les messages et membres du thème → fetch('/api/salons/'+slugs[cur]+'/messages') */}};
drawRooms();

const mem=[['Emma','#e0457b',1,1],['Alex','#2f7bff',1,0],['Sophie','#ff2d78',1,0],['Lucas','#2f7bff',0,0],['Camille','#ff2d78',1,1],['Léa','#ff2d78',1,1],['Thomas','#2f7bff',1,1]];
let onlyCam=false,target='Emma';
function drawList(){const q=$('#q').value.toLowerCase();
 $('#list').innerHTML=mem.filter(m=>m[0].toLowerCase().includes(q)&&(!onlyCam||m[3])).map(m=>`<div class="m"><div class="av ${m[2]?'on':'off'}" style="--c:${m[1]}">${m[0][0]}</div>${m[0]}${m[3]?'<svg class="cm" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" fill="currentColor"/><path d="M16 10l6-3v10l-6-3z" fill="currentColor"/></svg>':'<span class="cm"></span>'}<button class="dots" data-n="${m[0]}" data-c="${m[1]}" aria-label="Options ${m[0]}"><svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg></button></div>`).join('')}
drawList();$('#q').oninput=drawList;
$('#c1').onclick=()=>{onlyCam=false;$('#c1').classList.add('act');$('#c2').classList.remove('act');drawList()};
$('#c2').onclick=()=>{onlyCam=true;$('#c2').classList.add('act');$('#c1').classList.remove('act');drawList()};
const menu=$('#menu');
$('#list').onclick=e=>{const d=e.target.closest('.dots');if(!d)return;
 const r=d.getBoundingClientRect(),p=menu.parentElement.getBoundingClientRect();
 target=d.dataset.n;$('#mn').textContent=target;$('#mav').textContent=target[0];$('#mav').style.background=d.dataset.c;
 menu.style.top=Math.min(r.top-p.top+10,p.height-menu.offsetHeight-10)+'px';menu.hidden=false;e.stopPropagation()};
document.addEventListener('click',e=>{if(!menu.contains(e.target))menu.hidden=true});
menu.onclick=e=>{const b=e.target.closest('button');if(!b)return;menu.hidden=true;
 if(b.dataset.a==='pm'){$('#pn').textContent=target;$('#pi').placeholder='Message à '+target+'…';$('#pm').innerHTML='';$('#pi').focus()}else toast(b.dataset.a+' · '+target)};
$('#px').onclick=()=>{$('#pm').innerHTML='';$('#pn').textContent='—';toast('Conversation privée fermée')};

const pub=[['Alex','#2f7bff','#2f7bff','Bonsoir tout le monde !','20:14'],['Sophie','#ff2d78','#ff2d78','Salut Alex 👋','20:15'],['Emma','#ff2d78','#ff2d78','Très bonne ambiance ici !','20:16'],['Vous','#ffd60a','#ffd60a','Bienvenue !','20:16']];
const hm=()=>new Date().toTimeString().slice(0,5);
function drawPub(){$('#pub').innerHTML=pub.map(m=>`<div class="l"><div class="av" style="--c:${m[1]};${m[0]=='Vous'?'color:#111':''}">${m[0][0]}</div><strong style="color:${m[2]}">${m[0]}</strong><span>${m[3]}</span><time>${m[4]}</time></div>`).join('');$('#pub').scrollTop=1e5}
drawPub();
$('#f').onsubmit=e=>{e.preventDefault();const v=$('#i').value.trim();if(!v)return;pub.push(['Vous','#ffd60a','#ffd60a',v.replace(/</g,'&lt;'),hm()]);$('#i').value='';drawPub()};
$('#pf').onsubmit=e=>{e.preventDefault();const v=$('#pi').value.trim();if(!v)return;
 $('#pm').insertAdjacentHTML('beforeend',`<div class="b me"></div><div class="t me">${hm()} ✓✓</div>`);
 $('#pm').querySelectorAll('.b.me').forEach((n,i,a)=>{if(i==a.length-1)n.textContent=v});$('#pi').value='';$('#pm').scrollTop=1e5};

let cam=true,mic=false;
$('#bc').onclick=()=>{cam=!cam;$('#bc').classList.toggle('y',cam);$('#bc span').textContent=cam?'Caméra active':'Caméra coupée'};
$('#bm').onclick=()=>{mic=!mic;$('#bm span').textContent=mic?'Micro actif':'Micro coupé';$('#me').classList.toggle('mute',!mic)};
$('#bs').onclick=()=>toast('Réglages bientôt disponibles');
function setTheme(t){document.documentElement.dataset.theme=t;try{localStorage.setItem('evc-theme',t)}catch(e){}$('#tt').textContent=t==='light'?'🌙':'☀️'}
setTheme(document.documentElement.dataset.theme||'dark');
$('#tt').onclick=()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
$('#bq').onclick=()=>{location.href='salons.html'};
window.onpopstate=()=>location.reload();
$('#me').classList.add('mute');
