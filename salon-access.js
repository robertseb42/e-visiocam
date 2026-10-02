/* E-VISIOCAM – accès aux salons privés
   • Un membre DEMANDE l'accès à un salon privé.
   • La demande arrive sur le panneau du RESPONSABLE de ce salon (un par salon).
   • Le SUPER ADMINISTRATEUR voit toutes les demandes, peut décider à la place de n'importe qui
     et désigne (ou retire) le responsable de chaque salon.

   DEMO = true  : tout est simulé dans le navigateur (localStorage) pour tester le parcours.
   DEMO = false : le module appelle votre back (routes listées dans chaque fonction).
   ⚠ Ce fichier n'est qu'un confort d'affichage : la vraie protection doit être faite par le back
     (voir les notes en bas du fichier). */
const SalonAccess = (() => {
  const DEMO = false;         // false = utilise le vrai back · true = simulation dans le navigateur (test)
  const API  = 'https://e-visiocam-api.onrender.com/api';   // adresse de votre back sur Render
  const K = { req: 'evc-access', mgr: 'evc-managers', user: 'evc-user' };
  const SUPER = 'Super admin';
  // Comptes de test du mode démo (le premier est un simple membre)
  const DEMO_USERS = ['Vous', 'Julie', 'Marc', 'Alex', SUPER];

  const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  // Retrouve le jeton de connexion gardé par le site (on essaie les noms courants, puis tout nom contenant « token »)
  const tok = () => {
    try {
      for (const k of ['token', 'authToken', 'auth_token', 'jwt', 'accessToken', 'evisiocam_token', 'e-visiocam-token']) {
        const v = localStorage.getItem(k) || sessionStorage.getItem(k);
        if (v) return v.replace(/^"|"$/g, '');
      }
      for (const st of [localStorage, sessionStorage])
        for (let i = 0; i < st.length; i++) {
          const k = st.key(i);
          if (/token|jwt/i.test(k) && st.getItem(k)) return st.getItem(k).replace(/^"|"$/g, '');
        }
    } catch (e) {}
    return null;
  };
  const api = async (path, opt = {}) => {
    const r = await fetch(API + path, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(tok() ? { Authorization: 'Bearer ' + tok() } : {}) }, ...opt });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };

  // ---- Qui est connecté ?
  // BACK : GET /api/salons/me → { "name": "Julie", "role": "member" | "moderator" | "superadmin", "manages": ["vip"] }
  const me = async () => {
    if (DEMO) {
      const name = rd(K.user, 'Vous'), mgr = rd(K.mgr, {});
      return { name, role: name === SUPER ? 'superadmin' : 'member',
               manages: Object.keys(mgr).filter(s => mgr[s] === name) };
    }
    try { return await api('/salons/me'); } catch (e) { return { name: '', role: 'member', manages: [] }; }
  };
  const setUser = n => wr(K.user, n);                       // démo uniquement
  const isSuper = u => u.role === 'superadmin';
  const isModerator = u => u.role === 'moderator';
  // Le super admin ET les modérateurs voient et valident toutes les demandes ;
  // un responsable ne voit que celles de ses salons.
  const canManage = async () => { const u = await me(); return isSuper(u) || isModerator(u) || (u.manages || []).length > 0; };

  // ---- Statut de l'utilisateur pour un salon : 'none' | 'pending' | 'approved' | 'refused'
  // BACK : GET /api/salons/:slug/access → { "status": "approved" }
  //        (le serveur renvoie « approved » au super admin et au responsable du salon)
  const status = async slug => {
    if (DEMO) {
      const u = await me();
      if (isSuper(u) || u.manages.includes(slug)) return 'approved';
      const m = rd(K.req, []).find(x => x.slug === slug && x.user === u.name);
      return m ? m.status : 'none';
    }
    try { return (await api('/salons/' + slug + '/access')).status; } catch (e) { return 'none'; }
  };

  // ---- Envoyer une demande d'accès
  // BACK : POST /api/salons/:slug/access-request → { "status": "pending" }
  const request = async slug => {
    if (DEMO) {
      const u = await me(), l = rd(K.req, []);
      if (!l.find(x => x.slug === slug && x.user === u.name))
        l.push({ id: Date.now(), slug, user: u.name, status: 'pending', date: new Date().toISOString() });
      wr(K.req, l); return 'pending';
    }
    return (await api('/salons/' + slug + '/access-request', { method: 'POST' })).status;
  };

  // ---- Demandes visibles par la personne connectée
  // BACK : GET /api/salons/access-requests → [{ id, slug, user, status, date, by }]
  //        super admin : toutes · responsable : uniquement celles de ses salons
  const listRequests = async () => {
    if (!DEMO) return api('/salons/access-requests');
    const u = await me(), l = rd(K.req, []);
    return isSuper(u) ? l : l.filter(x => u.manages.includes(x.slug));
  };

  // ---- Accepter / refuser
  // BACK : POST /api/salons/access-requests/:id  body { "decision": "approved" | "refused" }
  const decide = async (id, decision) => {
    if (!DEMO) { await api('/salons/access-requests/' + id, { method: 'POST', body: JSON.stringify({ decision }) }); return; }
    const u = await me(), l = rd(K.req, []), r = l.find(x => x.id === id);
    if (!r || !(isSuper(u) || u.manages.includes(r.slug))) throw new Error('forbidden');
    r.status = decision; r.by = u.name; r.decidedAt = new Date().toISOString();
    wr(K.req, l);
  };

  // ---- Responsables (réservé au super administrateur)
  // BACK : GET /api/salons/managers → { "vip": "Julie", "premium": "Marc" }
  const managers = async () => DEMO ? rd(K.mgr, {}) : api('/salons/managers').catch(() => ({}));

  // ---- Annuaire des salons : noms, icônes, privé (VIP) ou public, membres
  // BACK : GET /api/salons/list → { salons: [{ slug, name, icon, isPrivate, members }] }
  const salons = async () => {
    try { const d = await api('/salons/list'); return (d && d.salons) || []; } catch (e) { return []; }
  };

  // ---- Passer un salon en VIP, ou lui retirer le VIP (super administrateur)
  // BACK : PUT /api/salons/:slug/private  body { "isPrivate": true | false }
  const setPrivate = async (slug, isPrivate) => {
    if (DEMO) { return { ok: true, salon: { slug, isPrivate: !!isPrivate } }; }
    return api('/salons/' + slug + '/private', { method: 'PUT', body: JSON.stringify({ isPrivate: !!isPrivate }) });
  };

  // BACK : PUT /api/salons/:slug/manager  body { "user": "Julie" }   (user = null pour retirer)
  const setManager = async (slug, name) => {
    if (!DEMO) { await api('/salons/' + slug + '/manager', { method: 'PUT', body: JSON.stringify({ user: name || null }) }); return; }
    if (!isSuper(await me())) throw new Error('forbidden');
    const m = rd(K.mgr, {});
    if (name) m[slug] = name; else delete m[slug];
    wr(K.mgr, m);
  };

  // Noms proposables comme responsable
  // BACK : GET /api/salons/users → ["Julie", "Marc", ...]
  const users = async () => DEMO ? DEMO_USERS.filter(n => n !== SUPER) : api('/salons/users').catch(() => []);

  return { DEMO, DEMO_USERS, me, setUser, canManage, isSuper, isModerator, status, request, listRequests, decide, managers, setManager, users, salons, setPrivate };
})();

/* CÔTÉ BACK (obligatoire) :
   1. La connexion au chat / à la vidéo d'un salon privé n'est autorisée que si l'utilisateur a une
      demande « approved » pour ce salon, ou s'il en est le responsable, ou s'il est super admin.
   2. « access-requests » (liste) : renvoyer toutes les demandes au super admin, et seulement
      celles de ses salons à un responsable. Un membre simple reçoit une erreur 403.
   3. « access-requests/:id » (décision) : vérifier côté serveur que la personne est super admin
      ou responsable de CE salon. Enregistrer qui a décidé et quand.
   4. « salons/:slug/manager » (désignation) : réservé au super admin. Un seul responsable par salon. */
