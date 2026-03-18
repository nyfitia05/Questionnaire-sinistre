/* ============================================
   SOS FUITE D'EAU — APP.JS
   Base de données : Supabase (PostgreSQL)
   ============================================ */
'use strict';

// ==================== SUPABASE CONFIG ====================
// ⚠️  Remplacez ces deux valeurs par vos credentials Supabase
//     Supabase > Project Settings > API
const SUPABASE_URL    = 'VOTRE_SUPABASE_URL';   // ex: https://xxxx.supabase.co
const SUPABASE_ANON   = 'VOTRE_ANON_KEY';        // clé publique anon/public

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

// ==================== COUCHE BASE DE DONNÉES ====================
// Toutes les fonctions retournent les mêmes structures qu'avant
// pour ne rien casser dans le reste du code.

async function dbAdd(formData) {
  const { refRapport, type, createdAt, ...rest } = formData;
  const { data, error } = await sb
    .from('rapports')
    .insert({
      ref_rapport : refRapport,
      type        : type,
      created_at  : createdAt,
      data        : rest          // tout le reste en JSONB
    })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

async function dbGetAll() {
  const { data, error } = await sb
    .from('rapports')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(flattenRow);
}

async function dbGet(id) {
  const { data, error } = await sb
    .from('rapports')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return flattenRow(data);
}

async function dbDelete(id) {
  const { error } = await sb
    .from('rapports')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Reconstruit un objet plat depuis la ligne Supabase
// (réunit les colonnes principales + le blob JSONB data)
function flattenRow(row) {
  if (!row) return null;
  return {
    id         : row.id,
    refRapport : row.ref_rapport,
    type       : row.type,
    createdAt  : row.created_at,
    ...row.data              // tous les champs du formulaire
  };
}

// ==================== NAVIGATION ====================
const navItems  = document.querySelectorAll('.nav-item');
const views     = document.querySelectorAll('.view');
const pageTitle = document.getElementById('pageTitle');
const sidebar   = document.getElementById('sidebar');
const burgerBtn = document.getElementById('burgerBtn');

const TITLES = {
  dashboard : 'Tableau de bord',
  nouveau   : 'Nouveau rapport',
  liste     : 'Tous les rapports',
};

function showView(name) {
  views.forEach(v    => v.classList.toggle('active', v.id === 'view-' + name));
  navItems.forEach(n => n.classList.toggle('active', n.dataset.view === name));
  pageTitle.textContent = TITLES[name] || '';
  if (name === 'liste')     renderTable(currentFilter);
  if (name === 'dashboard') renderDashboard();
}

navItems.forEach(n => n.addEventListener('click', e => {
  e.preventDefault();
  showView(n.dataset.view);
  if (window.innerWidth <= 768) sidebar.classList.remove('open');
}));

burgerBtn.addEventListener('click', () => sidebar.classList.toggle('open'));

document.addEventListener('click', e => {
  if (window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== burgerBtn)
    sidebar.classList.remove('open');
});

// ==================== TYPE SELECTOR ====================
let currentType = 'interieur';

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.panel').forEach(p  => p.classList.toggle('active', p.id === 'panel-' + currentType));
  });
});

// ==================== COLLECT FORM ====================
function collectForm() {
  const form = document.getElementById('mainForm');
  const data = { type: currentType };

  data.refRapport = (document.getElementById('refRapport').value || '').trim();

  // Checkboxes → tableau des valeurs cochées, groupées par name
  const groups = {};
  form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (!cb.name) return;
    if (!groups[cb.name]) groups[cb.name] = [];
    if (cb.checked) groups[cb.name].push(cb.value);
  });
  Object.assign(data, groups);

  // Textes / nombres / textareas
  form.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"], textarea').forEach(el => {
    if (el.name) data[el.name] = el.value.trim();
  });

  data.createdAt = new Date().toISOString();
  return data;
}

function resetForm() {
  document.getElementById('mainForm').reset();
}

// ==================== ENREGISTRER ====================
document.getElementById('saveReportBtn').addEventListener('click', async () => {
  const data = collectForm();
  if (!data.refRapport) {
    showToast('Renseignez le numéro OS avant d\'enregistrer.', 'error');
    return;
  }
  const btn = document.getElementById('saveReportBtn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  try {
    await dbAdd(data);
    showToast('Rapport enregistré dans Supabase !', 'success');
    resetForm();
    renderDashboard();
  } catch(e) {
    showToast('Erreur lors de l\'enregistrement : ' + (e.message || e), 'error');
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '✦ Enregistrer le rapport';
  }
});

document.getElementById('clearFormBtn').addEventListener('click', () => {
  if (confirm('Effacer tous les champs ?')) resetForm();
});

// ==================== DASHBOARD ====================
async function renderDashboard() {
  try {
    const all = await dbGetAll();
    document.getElementById('totalCount').textContent =
      all.length + ' rapport' + (all.length > 1 ? 's' : '');

    const counts = { interieur:0, piscine:0, toiture:0, exterieur:0 };
    all.forEach(r => { if (counts[r.type] !== undefined) counts[r.type]++; });
    Object.entries(counts).forEach(([k, v]) => {
      const el = document.getElementById('stat-' + k);
      if (el) el.textContent = v;
    });

    const recent = [...all].reverse().slice(0, 8);
    const list   = document.getElementById('recentList');

    if (!recent.length) {
      list.innerHTML = '<div class="empty-state">Aucun rapport.<br>Créez votre premier rapport ✦</div>';
      return;
    }

    list.innerHTML = recent.map(r => `
      <div class="recent-item">
        <span class="recent-type-badge ${r.type}">${typeLabel(r.type)}</span>
        <div class="recent-info">
          <div class="recent-ref">OS n° ${r.refRapport || '—'}</div>
          <div class="recent-addr">${r.personne || r.p_personne || r.e_personne || '—'}</div>
        </div>
        <div class="recent-date">${formatDatetime(r.createdAt)}</div>
      </div>
    `).join('');
  } catch(e) {
    console.error('Erreur dashboard:', e);
  }
}

// ==================== TABLE ====================
let currentFilter = 'all';

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
    renderTable(currentFilter);
  });
});

document.getElementById('searchInput').addEventListener('input', () => renderTable(currentFilter));

async function renderTable(filter) {
  try {
    const all = await dbGetAll();
    const q   = document.getElementById('searchInput').value.toLowerCase();

    const rows = all.filter(r => {
      if (filter !== 'all' && r.type !== filter) return false;
      if (q) {
        const hay = [r.refRapport, r.type, r.personne, r.p_personne, r.e_personne,
                     r.telephone, r.p_telephone, r.e_telephone].join(' ').toLowerCase();
        return hay.includes(q);
      }
      return true;
    }).reverse();

    const tbody = document.getElementById('reportsTableBody');
    const empty = document.getElementById('listEmpty');

    if (!rows.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><strong>OS ${r.refRapport || '—'}</strong></td>
        <td><span class="type-pill ${r.type}">${typeLabel(r.type)}</span></td>
        <td>${r.personne || r.p_personne || r.e_personne || '—'}</td>
        <td>${r.telephone || r.p_telephone || r.e_telephone || '—'}</td>
        <td>${formatDatetime(r.createdAt)}</td>
        <td>
          <div class="table-actions">
            <button class="action-btn pdf-btn" data-id="${r.id}">⬇ PDF</button>
            <button class="action-btn del"     data-id="${r.id}">✕</button>
          </div>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.pdf-btn').forEach(btn =>
      btn.addEventListener('click', () => generatePDF(btn.dataset.id))
    );

    tbody.querySelectorAll('.del').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        document.getElementById('modalOverlay').classList.add('open');
        document.getElementById('confirmDelete').onclick = async () => {
          try {
            await dbDelete(id);
            document.getElementById('modalOverlay').classList.remove('open');
            showToast('Rapport supprimé.', 'success');
            renderTable(currentFilter);
            renderDashboard();
          } catch(e) {
            showToast('Erreur suppression : ' + (e.message || e), 'error');
          }
        };
      });
    });
  } catch(e) {
    console.error('Erreur table:', e);
  }
}

document.getElementById('cancelDelete').addEventListener('click', () =>
  document.getElementById('modalOverlay').classList.remove('open')
);

// ==================== PDF ====================
async function generatePDF(id) {
  try {
    const r = await dbGet(id);
    if (!r) { showToast('Rapport introuvable.', 'error'); return; }
    printReportHTML(r);
  } catch(e) {
    showToast('Erreur PDF : ' + (e.message || e), 'error');
  }
}

function printReportHTML(r) {

  function sec(titre, lignes) {
    const rows = lignes
      .filter(([, val]) => val && val !== '' && !(Array.isArray(val) && !val.length))
      .map(([lbl, val]) =>
        `<tr><td class="lbl">${lbl}</td><td>${Array.isArray(val) ? val.join(', ') : val}</td></tr>`
      ).join('');
    if (!rows) return '';
    return `<div class="sec"><div class="sec-title">${titre}</div><table>${rows}</table></div>`;
  }

  let corps = '';

  /* ---- INTÉRIEUR ---- */
  if (r.type === 'interieur') {
    corps += sec('1. Origine du sinistre', [
      ['Ancienneté',               r.anciennete],
      ['Dégât progresse',          r.degat_progresse],
      ['Eau coule actuellement',   r.eau_coule],
      ['Alimentation eau coupée',  r.alim_coupee],
      ["Fuite s'arrête si coupée", r.fuite_arrete],
    ]);
    corps += sec('2. Localisation', [
      ['Zone concernée',  r.zone_int],
      ['Précision',       r.zone_int_autre],
      ['Pièce(s)',        r.piece],
      ['Pièce (autre)',   r.piece_autre],
      ['Niveau / étage',  r.niveau],
    ]);
    corps += sec('3. Environnement', [
      ['Au-dessus',       r.au_dessus],
      ['En dessous',      r.en_dessous],
      ['Derrière le mur', r.derriere_mur],
    ]);
    corps += sec('4. Humidité / Indices', [
      ['Zone plus humide',  r.zone_humide],
      ['Précision',         r.zone_humide_precision],
      ["Odeur d'humidité",  r.odeur],
      ['Indices visibles',  r.indices],
    ]);
    corps += sec('5. Installations / Travaux', [
      ['Chauffe-eau',        r.chauffe_eau],
      ['Type',               r.chauffe_eau_type],
      ['Travaux récents',    r.travaux],
      ['Nature',             r.travaux_nature],
    ]);
    corps += sec('6. Personnes & Accès', [
      ['Personne présente',   r.personne],
      ['Téléphone',           r.telephone],
      ['Interlocuteur',       r.interlocuteur],
      ['Coordonnées diff.',   r.coordonnees_diff],
      ['Accès bâtiment',      r.acces],
      ['Stationnement',       r.stationnement],
      ['Contraintes',         r.contraintes],
    ]);
  }

  /* ---- PISCINE ---- */
  if (r.type === 'piscine') {
    corps += sec("1. Origine / Perte d'eau", [
      ['Ancienneté',                 r.p_anciennete],
      ["Perte d'eau (cm/24h)",       r.perte_eau],
      ['Fuite se produit',           r.filtration_etat],
      ['Niveau cesse sous skimmers', r.niveau_skimmer],
    ]);
    corps += sec('2. Type de piscine', [
      ['Type',               r.type_piscine],
      ['Revêtement',         r.revetement],
      ['Revêtement (autre)', r.revetement_autre],
      ['Volume (m³)',        r.volume_piscine],
    ]);
    corps += sec('3. Équipements présents', [
      ['Équipements',     r.equip],
      ['Skimmers (qté)',  r.qte_skimmers],
      ['Refoulements',    r.qte_refoulements],
      ['Prise balai',     r.qte_prise_balai],
      ['Bonde de fond',   r.qte_bonde],
      ['Trop-plein',      r.qte_trop_plein],
      ['Projecteurs',     r.qte_projecteurs],
      ['Pompe (qté)',     r.qte_pompe],
      ['Filtre (qté)',    r.qte_filtre],
      ['Type de filtre',  r.type_filtre],
      ['Bâche / volet',   r.qte_bache],
    ]);
    corps += sec('4. Local technique', [
      ['Local présent',        r.local_technique],
      ['Contient',             r.local_contient],
      ['Autre équipement',     r.local_autre_equip],
      ["Traces d'humidité",    r.p_humidite_local],
    ]);
    corps += sec('5. Analyse technique par zone', [
      ['Skimmers — Défaut visible',             r.p_defaut_skimmer],
      ['Précision skimmers',                    r.p_defaut_skimmer_detail],
      ['Refoulements — Micro-bulles/anomalies', r.p_microbulles],
      ['Bonde(s) de fond — En cause',           r.p_bonde_cause],
      ['Prise balai — Perte pompe en marche',   r.p_prise_balai_perte],
      ['Canalisations enterrées',               r.p_cana_enterrees],
      ['Plan de passage connu',                 r.p_plan_connu],
      ['Document / photo disponible',           r.p_plan_detail],
    ]);
    corps += sec('6. Personnes & Accès', [
      ['Personne présente',     r.p_personne],
      ['Téléphone',             r.p_telephone],
      ['Interlocuteur',         r.p_interlocuteur],
      ['Coordonnées diff.',     r.p_coordonnees_diff],
      ['Accès piscine / local', r.p_acces],
      ['Stationnement',         r.p_stationnement],
      ['Contraintes',           r.p_contraintes],
    ]);
  }

  /* ---- TOITURE ---- */
  if (r.type === 'toiture') {
    corps += sec('1. Origine du problème', [
      ['Ancienneté',       r.t_anciennete],
      ['Conditions',       r.t_condition],
      ['Zone intérieure',  r.t_zone_int],
      ['Précision',        r.t_zone_int_autre],
      ['Observations',     r.t_observations],
    ]);
  }

  /* ---- EXTÉRIEUR ---- */
  if (r.type === 'exterieur') {
    corps += sec('1. Origine du problème', [
      ['Ancienneté',               r.e_anciennete],
      ["Surconsommation d'eau",    r.surconso],
      ['Compteur tourne (fermé)',  r.compteur_tourne],
      ['Vanne générale testée',    r.vanne_testee],
      ['Fuite visible',            r.fuite_visible],
      ['Localisation fuite',       r.fuite_visible_loc],
    ]);
    corps += sec('2. Localisation extérieure', [
      ['Zone concernée',        r.e_zone],
      ['Distance compteur (m)', r.distance_compteur],
      ['Type de sol',           r.type_sol],
    ]);
    corps += sec('3. Compteur & Réseau', [
      ['Localisation compteur',   r.compteur_loc],
      ['Type de compteur',        r.type_compteur],
      ['Compteur accessible',     r.compteur_accessible],
      ['Regard / trappe',         r.regard],
      ['Profondeur connue',       r.profondeur_connue],
      ['Profondeur estimée (cm)', r.profondeur_cm],
    ]);
    corps += sec('4. Installations extérieures', [
      ['Arrosage',            r.arrosage],
      ['Type arrosage',       r.type_arrosage],
      ['Vannes secondaires',  r.vannes_sec],
      ['Localisation vannes', r.vannes_loc],
    ]);
    corps += sec('5. Éléments complémentaires', [
      ['Photos disponibles',  r.photos],
      ['Observations client', r.e_observations_client],
    ]);
    corps += sec('6. Personnes & Accès', [
      ['Personne présente', r.e_personne],
      ['Téléphone',         r.e_telephone],
      ['Interlocuteur',     r.e_interlocuteur],
      ['Accès terrain',     r.e_acces],
      ['Stationnement',     r.e_stationnement],
      ['Contraintes',       r.e_contraintes],
    ]);
  }

  const C = '#2a3963';
  const A = '#b0ca60';

  const html = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8"/>
<title>OS ${r.refRapport || r.id} — SOS Fuite d'Eau</title>
<style>
  @page { size:A4; margin:14mm 13mm 18mm; }
  *{ box-sizing:border-box; margin:0; padding:0; }
  body{ font-family:'Lato',Arial,sans-serif; font-size:9.5pt; color:#1a1e2e; background:#fff; }

  .header{
    border-left: 5px solid ${A};
    padding: 10px 14px;
    margin-bottom: 18px;
    background: #f4f6fa;
  }
  .header .os-number{ font-size:20pt; font-weight:900; color:${C}; line-height:1.1; }
  .header .os-number span{ color:${A}; }
  .header .type-line{ margin-top:5px; }
  .badge{
    display:inline-block; background:${C}; color:#fff; font-weight:700;
    font-size:8.5pt; text-transform:uppercase; letter-spacing:.06em;
    padding:3px 12px; border-radius:4px;
  }
  .header .meta{ font-size:7.5pt; color:#888; margin-top:5px; }

  .sec{ margin-bottom:9px; page-break-inside:avoid; }
  .sec-title{
    background:${C}; color:${A}; font-weight:700; font-size:7.5pt;
    text-transform:uppercase; letter-spacing:.08em; padding:4px 8px;
  }
  table{ width:100%; border-collapse:collapse; font-size:9pt; }
  tr:nth-child(even) td{ background:#f4f6fa; }
  td{ padding:3.5px 8px; border-bottom:1px solid #e8ecf4; vertical-align:top; }
  td.lbl{ width:42%; font-weight:700; color:#555; }

  .footer{
    position:fixed; bottom:0; left:0; right:0; text-align:center;
    font-size:7pt; color:#bbb; border-top:1px solid #e8ecf4; padding-top:4px;
  }
  .footer b{ color:${C}; }

  @media print{
    body{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
</style>
</head><body>

<div class="header">
  <div class="os-number">OS n° <span>${r.refRapport || '—'}</span></div>
  <div class="type-line"><span class="badge">${typeLabel(r.type)}</span></div>
  <div class="meta">Créé le ${formatDatetime(r.createdAt)} &nbsp;·&nbsp; SOS Fuite d'Eau</div>
</div>

${corps}

<div class="footer">
  SOS Fuite d'Eau &nbsp;&middot;&nbsp;
  OS n° <b>${r.refRapport || '—'}</b> &nbsp;&middot;&nbsp;
  ${typeLabel(r.type)} &nbsp;&middot;&nbsp;
  Généré le ${formatDatetime(r.createdAt)}
</div>

<script>window.onload=function(){setTimeout(function(){window.print();},350);};<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { showToast('Autorisez les popups pour générer le PDF.', 'error'); return; }
  w.document.write(html);
  w.document.close();
  showToast('Choisissez "Enregistrer en PDF" dans la boîte d\'impression.', 'success');
}

// ==================== HELPERS ====================
function typeLabel(type) {
  return { interieur:'Intérieur', piscine:'Piscine', toiture:'Toiture', exterieur:'Extérieur' }[type] || type;
}

function formatDatetime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('fr-FR'); } catch(e) { return d; }
}

let toastTimer;
function showToast(msg, type='') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// ==================== INIT ====================
(async () => {
  // Vérification que les credentials sont configurés
  if (SUPABASE_URL === 'VOTRE_SUPABASE_URL' || SUPABASE_ANON === 'VOTRE_ANON_KEY') {
    showToast('⚠️ Configurez vos credentials Supabase dans app.js', 'error');
    console.warn('Supabase non configuré — voir les constantes SUPABASE_URL et SUPABASE_ANON en haut de app.js');
  }
  renderDashboard();
})();
