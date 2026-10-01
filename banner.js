/* Fond défilant ; le contenu de la bannière reste fixe. */
(async function () {
    const hero = document.querySelector('.cam-banner');
    if (!hero) return;
    const layer = document.createElement('div'); layer.className='banner-slides'; layer.setAttribute('aria-hidden','true'); hero.prepend(layer);
    const controls = document.createElement('div'); controls.className='banner-controls'; controls.hidden=true;
    const toggle = document.createElement('button'); toggle.type='button'; toggle.textContent='Pause'; toggle.setAttribute('aria-label','Mettre le défilement en pause');
    const dots = document.createElement('div'); dots.className='banner-dots'; controls.append(dots,toggle); hero.append(controls);
    let slides=[], index=0, timer, paused=false, interval=6000;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    function schedule() { clearInterval(timer); if (slides.length>1 && !paused && !reduced.matches && !document.hidden) timer=setInterval(()=>show((index+1)%slides.length),interval); }
    function show(n) {index=n;slides.forEach((img,i)=>img.classList.toggle('is-active',i===n));Array.from(dots.children).forEach((b,i)=>b.setAttribute('aria-pressed',String(i===n)));}
    function add(src, focal=65,mobileFocal=65) {
        return new Promise(resolve=>{const img=new Image();img.alt='';img.decoding='async';img.className='banner-slide';img.style.setProperty('--focal',focal+'%');img.style.setProperty('--mobile-focal',mobileFocal+'%');img.onload=()=>{layer.append(img);slides.push(img);resolve(true)};img.onerror=()=>resolve(false);img.src=src;});
    }
    try {
        const response=await fetch(API_URL+'/decor'); if (!response.ok) throw new Error('Décor indisponible');
        const config=await response.json();interval=config.intervalMs || 6000;
        for (const s of config.slides || []) await add(new URL(s.url,API_URL).href,s.focal,s.mobileFocal);
    } catch(e) { console.warn('Décor : fond de secours affiché.'); }
    if (!slides.length) { for (let n=1;n<=3;n++) await add('banner-'+n+'.jpg'); }
    if (!slides.length) return;
    hero.classList.add('has-banner-slides');
    slides.forEach((_,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Afficher le fond '+(i+1));b.onclick=()=>{show(i);schedule()};dots.append(b);});
    controls.hidden=slides.length<2;show(0);schedule();
    toggle.onclick=()=>{paused=!paused;toggle.textContent=paused?'Lecture':'Pause';toggle.setAttribute('aria-label',paused?'Reprendre le défilement':'Mettre le défilement en pause');schedule()};
    if(reduced.matches)toggle.hidden=true;
    reduced.addEventListener('change',()=>{toggle.hidden=reduced.matches;schedule()});
    document.addEventListener('visibilitychange',schedule);
})();
