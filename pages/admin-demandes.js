// Extrait de admin.html (CSP stricte : plus de script inline dans les pages)
// 🔒 Demandes d'accès aux salons privés en attente (super admin et modérateurs)
(async function(){
  try {
    const list = await apiCall("/salons/access-requests");
    const n = (list || []).filter(function(r){ return r.status === "pending"; }).length;
    const lien = document.getElementById("demandesSalons");
    if (!lien) return;
    lien.innerHTML = '<i class="fa-solid fa-lock mr-1"></i> ' + ("Gestion des salons")
      + (n > 0 ? ' <span class="ml-1 bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">' + n + "</span>" : "");
  } catch (e) {}
})();
