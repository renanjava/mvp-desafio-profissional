'use strict';

/* ===== DATA STORES ===== */
const DB = {
  get(k) { try { return JSON.parse(localStorage.getItem('st_' + k)) || []; } catch { return []; } },
  set(k, v) { localStorage.setItem('st_' + k, JSON.stringify(v)); },
  getObj(k) { try { return JSON.parse(localStorage.getItem('st_' + k)) || {}; } catch { return {}; } },
  setObj(k, v) { localStorage.setItem('st_' + k, JSON.stringify(v)); }
};

const USERS = [
  { login: 'admin', senha: 'admin123', nome: 'Administrador', role: 'admin' },
  { login: 'gestor', senha: 'gestor123', nome: 'Gestor', role: 'gestor' },
  { login: 'vendedor', senha: 'vend123', nome: 'Vendedor', role: 'vendedor' },
  { login: 'comprador', senha: 'comp123', nome: 'Comprador', role: 'comprador' }
];

const ICMS_UF = {
  AC:.17,AL:.19,AP:.18,AM:.20,BA:.205,CE:.20,DF:.20,ES:.17,GO:.19,MA:.22,
  MT:.17,MS:.17,MG:.18,PA:.19,PB:.20,PR:.195,PE:.205,PI:.21,RJ:.22,RN:.20,
  RS:.17,RO:.195,RR:.20,SC:.17,SP:.18,SE:.19,TO:.20,EX:0
};
const PIS_COFINS = { lucro_real:{venda:.0925,credito:.0925}, lucro_presumido:{venda:.0365,credito:0} };
const IRPJ_CSLL_LR = .34, IRPJ_CSLL_LP = .0308, IPI = .05, ENCARGOS = 1.65, MULT_IMP = 1.55;
const MOD_RATES = { usinagem:{base:45}, solda:{base:55}, montagem:{base:35} };

let currentUser = null, sessionTimer = null, sessionSeconds = 300;
let cpvUnit = { mat:0, mod:0, cif:0 }, simData = {};
let bomId = 0, chartCusto = null, chartCenarios = null;

/* ===== HELPERS ===== */
const $ = id => document.getElementById(id);
const setText = (id, t) => { const e = $(id); if (e) e.textContent = t; };
const fmtBRL = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function toast(msg, type='success') {
  const d = document.createElement('div'); d.className = 'toast ' + type; d.textContent = msg;
  $('toastContainer').appendChild(d); setTimeout(() => d.remove(), 3000);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ===== INIT DEFAULT MATERIALS ===== */
function initDefaults() {
  if (DB.get('materiais').length === 0) {
    DB.set('materiais', [
      {id:uid(),nome:'Aço Carbono SAE 1020',tipo:'Metal Ferroso',caract:'Baixo carbono, boa soldabilidade',custoKg:8.5},
      {id:uid(),nome:'Ferro Fundido GG25',tipo:'Metal Ferroso',caract:'Alta resistência à compressão',custoKg:6.2},
      {id:uid(),nome:'Aço Inox AISI 304',tipo:'Metal Ferroso',caract:'Resistência à corrosão',custoKg:28},
      {id:uid(),nome:'Aço Inox 316L',tipo:'Metal Ferroso',caract:'Premium, resistência química',custoKg:38},
      {id:uid(),nome:'Liga Alumínio 6061',tipo:'Metal Não-Ferroso',caract:'Leve, boa usinabilidade',custoKg:26},
      {id:uid(),nome:'Cobre / Latão',tipo:'Metal Não-Ferroso',caract:'Alta condutividade',custoKg:48},
      {id:uid(),nome:'Polímero / Borracha',tipo:'Polímero',caract:'Vedações, flexibilidade',custoKg:16},
      {id:uid(),nome:'Nylon / Poliacetal',tipo:'Polímero',caract:'Engrenagens plásticas',custoKg:22}
    ]);
  }
  if (DB.get('componentes').length === 0) {
    DB.set('componentes', [
      {id:uid(),nome:'Motor Elétrico Trifásico',spec:'50HP 1750RPM',material:'Aço Carbono',fornecedor:'WEG',custo:4500},
      {id:uid(),nome:'Reservatório de Ar 200L',spec:'Pressão máx 12bar',material:'Aço Carbono',fornecedor:'MetalAr',custo:1800},
      {id:uid(),nome:'Unidade Compressora Parafuso',spec:'Rotação variável',material:'Ferro Fundido',fornecedor:'Atlas Copco',custo:8500}
    ]);
  }
  if (DB.get('custos').length === 0) {
    DB.set('custos', [
      {id:uid(),desc:'Mão de Obra Direta (MOD)',cat:'mod',valor:45000},
      {id:uid(),desc:'Mão de Obra Indireta (MOI)',cat:'moi',valor:18000},
      {id:uid(),desc:'Energia Elétrica',cat:'energia',valor:8500},
      {id:uid(),desc:'Despesas Administrativas',cat:'admin',valor:25000},
      {id:uid(),desc:'Custos de Instalação',cat:'instalacao',valor:5000}
    ]);
  }
}

/* ===== LOGIN (NF005-NF007) ===== */
function doLogin() {
  const u = $('loginUser').value.trim(), p = $('loginPass').value;
  const user = USERS.find(x => x.login === u && x.senha === p);
  if (!user) { $('loginError').textContent = 'Usuário ou senha inválidos.'; return; }
  currentUser = user;
  $('loginOverlay').classList.add('hidden');
  $('appLayout').classList.remove('hidden');
  const roleLabels = {admin:'Administrador',gestor:'Gestor',vendedor:'Vendedor',comprador:'Comprador'};
  $('userName').textContent = user.nome;
  $('userRole').textContent = roleLabels[user.role] || user.role;
  $('userAvatar').textContent = user.nome[0];
  applyRoleVisibility(user.role);
  startSession();
  initApp();
}

function doLogout() {
  currentUser = null; clearInterval(sessionTimer);
  $('loginOverlay').classList.remove('hidden');
  $('appLayout').classList.add('hidden');
  $('loginUser').value = ''; $('loginPass').value = ''; $('loginError').textContent = '';
}

function startSession() {
  sessionSeconds = 300; clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    sessionSeconds--;
    const m = Math.floor(sessionSeconds/60), s = sessionSeconds%60;
    setText('sessionTimer', `Sessão expira em ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    if (sessionSeconds <= 0) { doLogout(); toast('Sessão expirada por inatividade.','error'); }
  }, 1000);
}

function resetSession() { sessionSeconds = 300; }

$('btnLogin').addEventListener('click', doLogin);
$('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('loginUser').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginPass').focus(); });
$('btnLogout').addEventListener('click', doLogout);
document.addEventListener('click', resetSession);
document.addEventListener('keydown', resetSession);

/* ===== NAVIGATION ===== */
function showSection(secId) {
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = $(secId); if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${secId}"]`);
  if (nav) nav.classList.add('active');
  const titles = {
    secHome:'Home',secDashboard:'Dashboard',secMateriais:'Materiais',secComponentes:'Componentes',
    secCustos:'Custos Operacionais',secProduto:'Configuração do Produto',
    secSimulacao:'Simulação de Custos',secRelatorios:'Relatórios',secPosVenda:'Pós-Venda',
    secHistTributacao:'Hist. Tributação Exportação',secMarketplace:'Marketplace'
  };
  setText('topBarTitle', titles[secId] || '');
  if (secId === 'secSimulacao') atualizarSimulador();
  if (secId === 'secRelatorios') gerarRelatorio();
  if (secId === 'secDashboard') refreshDashboard();
  if (secId === 'secHome') refreshHome();
  if (secId === 'secHistTributacao') renderTribHistory();
  if (secId === 'secMarketplace') renderMarketplace();
  // close mobile sidebar
  $('sidebar').classList.remove('open');
  $('sidebarOverlay').classList.remove('open');
}

document.querySelectorAll('.nav-item').forEach(n => {
  n.addEventListener('click', () => showSection(n.dataset.section));
});
$('btnHamburger').addEventListener('click', () => {
  $('sidebar').classList.toggle('open'); $('sidebarOverlay').classList.toggle('open');
});
$('sidebarOverlay').addEventListener('click', () => {
  $('sidebar').classList.remove('open'); $('sidebarOverlay').classList.remove('open');
});

/* ===== TABS ===== */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const parent = btn.closest('.page-section');
    parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = $(btn.dataset.tab); if (panel) panel.classList.add('active');
  });
});

/* ===== MODAL ===== */
let modalSaveFn = null;
function openModal(title, bodyHtml, saveFn) {
  $('modalTitle').textContent = title;
  $('modalBody').innerHTML = bodyHtml;
  modalSaveFn = saveFn;
  $('modalOverlay').classList.add('open');
}
function closeModal() { $('modalOverlay').classList.remove('open'); modalSaveFn = null; }
$('modalClose').addEventListener('click', closeModal);
$('modalCancel').addEventListener('click', closeModal);
$('modalSave').addEventListener('click', () => { if (modalSaveFn) modalSaveFn(); });
$('modalOverlay').addEventListener('click', e => { if (e.target === $('modalOverlay')) closeModal(); });

/* ===== CRUD: MATERIAIS (RF01, RF03) ===== */
function renderMateriais() {
  const list = DB.get('materiais'), tb = $('materiaisBody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="5"><div class="empty-state"><span class="empty-ico">🧱</span><p>Nenhum material cadastrado.</p></div></td></tr>'; return; }
  tb.innerHTML = list.map(m => `<tr>
    <td><strong>${m.nome}</strong></td><td>${m.tipo}</td><td style="max-width:200px;font-size:.82rem;color:var(--muted)">${m.caract}</td>
    <td class="mono">${fmtBRL(m.custoKg)}</td>
    <td><div class="actions"><button class="btn-icon" onclick="editMaterial('${m.id}')">✏️</button><button class="btn-icon danger" onclick="delMaterial('${m.id}')">🗑️</button></div></td>
  </tr>`).join('');
}
function matForm(m={}) {
  return `<div class="form-group"><label>Nome</label><input id="mNome" type="text" value="${m.nome||''}"></div>
  <div class="form-row"><div class="form-group"><label>Tipo</label><input id="mTipo" type="text" value="${m.tipo||''}" placeholder="Ex: Metal Ferroso"></div>
  <div class="form-group"><label>Custo/Kg (R$)</label><input id="mCusto" type="number" step="0.01" value="${m.custoKg||0}"></div></div>
  <div class="form-group"><label>Características Técnicas</label><textarea id="mCaract">${m.caract||''}</textarea></div>`;
}
window.editMaterial = function(id) {
  const list = DB.get('materiais'), m = list.find(x=>x.id===id);
  if (!m) return;
  openModal('Editar Material', matForm(m), () => {
    m.nome=$('mNome').value; m.tipo=$('mTipo').value; m.custoKg=parseFloat($('mCusto').value)||0; m.caract=$('mCaract').value;
    DB.set('materiais',list); renderMateriais(); updateBomSelects(); closeModal(); toast('Material atualizado!');
  });
};
window.delMaterial = function(id) {
  if (!confirm('Excluir este material?')) return;
  DB.set('materiais', DB.get('materiais').filter(x=>x.id!==id)); renderMateriais(); updateBomSelects(); toast('Material excluído.','info');
};
$('btnAddMaterial').addEventListener('click', () => {
  openModal('Novo Material', matForm(), () => {
    const list = DB.get('materiais');
    list.push({id:uid(),nome:$('mNome').value,tipo:$('mTipo').value,custoKg:parseFloat($('mCusto').value)||0,caract:$('mCaract').value});
    DB.set('materiais',list); renderMateriais(); updateBomSelects(); closeModal(); toast('Material cadastrado!');
  });
});

/* ===== CRUD: COMPONENTES (RF02, RF03) ===== */
function renderComponentes() {
  const list = DB.get('componentes'), tb = $('componentesBody');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><span class="empty-ico">⚙️</span><p>Nenhum componente cadastrado.</p></div></td></tr>'; return; }
  tb.innerHTML = list.map(c => `<tr>
    <td><strong>${c.nome}</strong></td><td>${c.spec}</td><td>${c.material}</td><td>${c.fornecedor}</td>
    <td class="mono">${fmtBRL(c.custo)}</td>
    <td><div class="actions"><button class="btn-icon" onclick="editComp('${c.id}')">✏️</button><button class="btn-icon danger" onclick="delComp('${c.id}')">🗑️</button></div></td>
  </tr>`).join('');
}
function compForm(c={}) {
  return `<div class="form-group"><label>Nome</label><input id="cNome" type="text" value="${c.nome||''}"></div>
  <div class="form-row"><div class="form-group"><label>Especificação</label><input id="cSpec" type="text" value="${c.spec||''}"></div>
  <div class="form-group"><label>Material</label><input id="cMat" type="text" value="${c.material||''}"></div></div>
  <div class="form-row"><div class="form-group"><label>Fornecedor</label><input id="cForn" type="text" value="${c.fornecedor||''}"></div>
  <div class="form-group"><label>Custo Unitário (R$)</label><input id="cCusto" type="number" step="0.01" value="${c.custo||0}"></div></div>`;
}
window.editComp = function(id) {
  const list = DB.get('componentes'), c = list.find(x=>x.id===id);
  openModal('Editar Componente', compForm(c), () => {
    c.nome=$('cNome').value; c.spec=$('cSpec').value; c.material=$('cMat').value; c.fornecedor=$('cForn').value; c.custo=parseFloat($('cCusto').value)||0;
    DB.set('componentes',list); renderComponentes(); closeModal(); toast('Componente atualizado!');
  });
};
window.delComp = function(id) {
  if (!confirm('Excluir?')) return;
  DB.set('componentes', DB.get('componentes').filter(x=>x.id!==id)); renderComponentes(); toast('Componente excluído.','info');
};
$('btnAddComponente').addEventListener('click', () => {
  openModal('Novo Componente', compForm(), () => {
    const list = DB.get('componentes');
    list.push({id:uid(),nome:$('cNome').value,spec:$('cSpec').value,material:$('cMat').value,fornecedor:$('cForn').value,custo:parseFloat($('cCusto').value)||0});
    DB.set('componentes',list); renderComponentes(); closeModal(); toast('Componente cadastrado!');
  });
});

/* ===== CRUD: CUSTOS OPERACIONAIS (RF05, RF06) ===== */
function renderCustos() {
  const list = DB.get('custos'), tb = $('custosBody');
  const cats = {mod:'Mão de Obra Direta',moi:'Mão de Obra Indireta',energia:'Energia Elétrica',admin:'Desp. Administrativas',instalacao:'Instalação/Montagem',outros:'Outros'};
  if (!list.length) { tb.innerHTML = '<tr><td colspan="4"><div class="empty-state"><span class="empty-ico">💵</span><p>Nenhum custo registrado.</p></div></td></tr>'; return; }
  tb.innerHTML = list.map(c => `<tr>
    <td><strong>${c.desc}</strong></td><td>${cats[c.cat]||c.cat}</td><td class="mono">${fmtBRL(c.valor)}</td>
    <td><div class="actions"><button class="btn-icon" onclick="editCusto('${c.id}')">✏️</button><button class="btn-icon danger" onclick="delCusto('${c.id}')">🗑️</button></div></td>
  </tr>`).join('');
}
function custoForm(c={}) {
  const cats = ['mod','moi','energia','admin','instalacao','outros'];
  const labels = {mod:'Mão de Obra Direta',moi:'Mão de Obra Indireta',energia:'Energia Elétrica',admin:'Desp. Administrativas',instalacao:'Instalação/Montagem',outros:'Outros'};
  return `<div class="form-group"><label>Descrição</label><input id="ctDesc" type="text" value="${c.desc||''}"></div>
  <div class="form-row"><div class="form-group"><label>Categoria</label><select id="ctCat">${cats.map(k=>`<option value="${k}" ${c.cat===k?'selected':''}>${labels[k]}</option>`).join('')}</select></div>
  <div class="form-group"><label>Valor Mensal (R$)</label><input id="ctVal" type="number" step="0.01" value="${c.valor||0}"></div></div>`;
}
window.editCusto = function(id) {
  const list = DB.get('custos'), c = list.find(x=>x.id===id);
  openModal('Editar Custo', custoForm(c), () => {
    c.desc=$('ctDesc').value; c.cat=$('ctCat').value; c.valor=parseFloat($('ctVal').value)||0;
    DB.set('custos',list); renderCustos(); closeModal(); toast('Custo atualizado!');
  });
};
window.delCusto = function(id) {
  if (!confirm('Excluir?')) return;
  DB.set('custos', DB.get('custos').filter(x=>x.id!==id)); renderCustos(); toast('Custo excluído.','info');
};
$('btnAddCusto').addEventListener('click', () => {
  openModal('Novo Custo Operacional', custoForm(), () => {
    const list = DB.get('custos');
    list.push({id:uid(),desc:$('ctDesc').value,cat:$('ctCat').value,valor:parseFloat($('ctVal').value)||0});
    DB.set('custos',list); renderCustos(); closeModal(); toast('Custo cadastrado!');
  });
});

/* ===== BOM (RF04) ===== */
function getMaterialsMap() {
  const map = {}; DB.get('materiais').forEach(m => { map[m.id] = m; }); return map;
}
function updateBomSelects() {
  const mats = DB.get('materiais');
  document.querySelectorAll('#bomBody .material').forEach(sel => {
    const cur = sel.value;
    sel.innerHTML = mats.map(m => `<option value="${m.id}" ${m.id===cur?'selected':''}>${m.nome} (${fmtBRL(m.custoKg)}/kg)</option>`).join('');
  });
}
function calcBomRow(row) {
  const mats = getMaterialsMap();
  const matId = row.querySelector('.material').value;
  const orig = row.querySelector('.origem').value;
  const peso = parseFloat(row.querySelector('.peso').value)||0;
  const qtd = parseFloat(row.querySelector('.qtd').value)||1;
  const mat = mats[matId];
  const custoKg = mat ? mat.custoKg : 8.5;
  const mult = orig==='importado' ? MULT_IMP : 1;
  const custo = custoKg * mult * peso * qtd;
  row.querySelector('.val-custo').textContent = fmtBRL(custo);
  row.dataset.custo = custo; row.dataset.peso = peso*qtd; row.dataset.orig = orig; row.dataset.mat = matId; row.dataset.qtd = qtd;
  updateBomTotals();
}
function updateBomTotals() {
  let tc=0,tp=0;
  document.querySelectorAll('#bomBody tr').forEach(r => { tc+=parseFloat(r.dataset.custo)||0; tp+=parseFloat(r.dataset.peso)||0; });
  setText('totalMat', fmtBRL(tc)); setText('totalPeso', tp.toFixed(2)+' kg');
  cpvUnit.mat = tc; atualizarCPVPreview();
}
$('btnAddItem').addEventListener('click', () => {
  const tpl = $('tplBomRow'), clone = tpl.content.cloneNode(true), tr = clone.querySelector('tr');
  tr.id = 'bom-'+(++bomId);
  const mats = DB.get('materiais');
  const sel = tr.querySelector('.material');
  sel.innerHTML = mats.map(m => `<option value="${m.id}">${m.nome} (${fmtBRL(m.custoKg)}/kg)</option>`).join('');
  tr.querySelectorAll('.cinp').forEach(el => { el.addEventListener('change', ()=>calcBomRow(tr)); el.addEventListener('input', ()=>calcBomRow(tr)); });
  tr.querySelector('.btn-rm').addEventListener('click', () => { tr.remove(); updateBomTotals(); });
  $('bomBody').appendChild(tr); calcBomRow(tr);
});
$('btnAddItem').click();

/* ===== VOLUME ===== */
function atualizarVolume() {
  const h=parseFloat($('dimH').value)||0,l=parseFloat($('dimL').value)||0,p=parseFloat($('dimP').value)||0;
  const vol=(h*l*p)/1e6; setText('volDisplay',`Volume: ${vol.toFixed(3).replace('.',',')} m³ — Peso estimado: ${(vol*2200).toFixed(0)} kg`);
}
['dimH','dimL','dimP'].forEach(id => { const e=$(id); if(e) e.addEventListener('input',atualizarVolume); });
atualizarVolume();

/* ===== CPV PREVIEW (RF08, RF09) ===== */
function atualizarCPVPreview() {
  const lote = parseInt($('loteMensal').value)||1;
  const hUs=parseFloat($('modUsinagem').value)||0, hSo=parseFloat($('modSolda').value)||0, hMo=parseFloat($('modMontagem').value)||0;
  const cUs=hUs*MOD_RATES.usinagem.base*ENCARGOS, cSo=hSo*MOD_RATES.solda.base*ENCARGOS, cMo=hMo*MOD_RATES.montagem.base*ENCARGOS;
  cpvUnit.mod = cUs+cSo+cMo;
  const cifD=parseFloat($('cifDepr').value)||0,cifE=parseFloat($('cifEnergia').value)||0,cifM=parseFloat($('cifManut').value)||0,cifO=parseFloat($('cifOutros').value)||0;
  cpvUnit.cif = (cifD+cifE+cifM+cifO)/lote;
  setText('resUsinagem',fmtBRL(cUs)); setText('resSolda',fmtBRL(cSo)); setText('resMontagem',fmtBRL(cMo));
  setText('totalMOD',fmtBRL(cpvUnit.mod)); setText('cifRateado',fmtBRL(cpvUnit.cif));
  const total=cpvUnit.mat+cpvUnit.mod+cpvUnit.cif;
  setText('pvMat',fmtBRL(cpvUnit.mat)); setText('pvMod',fmtBRL(cpvUnit.mod)); setText('pvCif',fmtBRL(cpvUnit.cif)); setText('pvTotal',fmtBRL(total));
}
['modUsinagem','modSolda','modMontagem','cifDepr','cifEnergia','cifManut','cifOutros','loteMensal'].forEach(id=>{
  const e=$(id); if(e) e.addEventListener('input',atualizarCPVPreview);
});
atualizarCPVPreview();

/* ===== HINTS ===== */
function atualizarHints() {
  const r=$('regime').value, d=$('destino').value;
  $('hintRegime').innerHTML = r==='lucro_real'
    ? '<strong>Lucro Real:</strong> Créditos de PIS/COFINS (9,25%) e ICMS. IRPJ/CSLL: 34% sobre lucro.'
    : '<strong>Lucro Presumido:</strong> Cumulativo, sem crédito. IRPJ base presuntiva.';
  const icms = ICMS_UF[d]||0;
  $('hintDestino').innerHTML = d==='EX'
    ? 'Exportação: Imunidade ICMS, isenção PIS/COFINS.'
    : `ICMS: ${(icms*100).toFixed(1)}% para o estado selecionado.`;
}

/* ===== SIMULADOR (RF08-RF13) ===== */
function atualizarSimulador() {
  atualizarCPVPreview(); atualizarHints();
  const PV=parseFloat($('precoVenda').value)||0, regime=$('regime').value, destino=$('destino').value;
  const margemD=parseFloat($('margemSlider').value)||0, lote=parseInt($('loteMensal').value)||1;
  const txCom=(parseFloat($('txComissao').value)||0)/100, despAdm=parseFloat($('despAdmin').value)||0, freteEx=parseFloat($('freteEx').value)||0;
  const pc=PIS_COFINS[regime], icmsPct=ICMS_UF[destino]||0;
  let credMP=0, matLiq=cpvUnit.mat;
  if(regime==='lucro_real' && destino!=='EX') {
    let matNac=0; document.querySelectorAll('#bomBody tr').forEach(r=>{if(r.dataset.orig==='nacional')matNac+=parseFloat(r.dataset.custo)||0;});
    credMP=matNac*(icmsPct+pc.credito); matLiq=cpvUnit.mat-credMP;
  }
  const CPV=Math.max(matLiq+cpvUnit.mod+cpvUnit.cif,0);
  const debICMS=PV*icmsPct, debPC=PV*pc.venda, totImp=debICMS+debPC, recLiq=PV-totImp;
  const despCom=PV*txCom, despAdmU=despAdm/lote, despLog=destino==='EX'?freteEx:0, totDesp=despCom+despAdmU+despLog;
  const lucBruto=recLiq-CPV, lucOp=lucBruto-totDesp;
  let ir=regime==='lucro_real'?Math.max(lucOp*IRPJ_CSLL_LR,0):PV*IRPJ_CSLL_LP;
  const lucLiq=lucOp-ir, margLiq=recLiq>0?(lucLiq/recLiq)*100:0, custoTot=CPV+totImp+totDesp+ir;
  const cifTotMes=(parseFloat($('cifDepr').value)||0)+(parseFloat($('cifEnergia').value)||0)+(parseFloat($('cifManut').value)||0)+(parseFloat($('cifOutros').value)||0);
  const cfMes=cifTotMes+despAdm, dvU=matLiq+cpvUnit.mod+despCom+totImp+ir, mc=PV-dvU;
  const PEC=mc>0?Math.ceil(cfMes/mc):null;
  const precoSug=calcPrecoSug(CPV+despAdmU+despLog,icmsPct,pc.venda,txCom,margemD/100,regime);

  simData={PV,CPV,matLiq,cpvUnit:{...cpvUnit},credMP,debICMS,debPC,totImp,icmsPct,despCom,despAdmU,despLog,totDesp,
    lucBruto,lucOp,ir,lucLiq,margLiq,margemD,recLiq,custoTot,PEC,mc,cifTotMes,despAdm,lote,regime,destino,pc,precoSug};

  setText('rlCPV',fmtBRL(CPV)); setText('rlImpostosV',fmtBRL(totImp)); setText('rlDespOp',fmtBRL(totDesp));
  setText('rlCustoTotal',fmtBRL(custoTot)); setText('rlPreco',fmtBRL(PV)); setText('rlIR',fmtBRL(ir));
  const le=$('rlLucro'); le.textContent=fmtBRL(lucLiq); le.className='rl-val mono large '+(lucLiq>=0?'text-accent':'text-orange');
  setText('rlMargem',margLiq.toFixed(2).replace('.',',')+('%')); 
  const me=$('rlMargem'); if(me) me.className='rl-val mono '+(margLiq>=10?'text-accent':margLiq>=0?'':'text-orange');
  $('margemVal').textContent=margemD+'%';
  setText('spMargemRef',margemD); setText('spPreco',fmtBRL(precoSug));
  setText('rlPEC',PEC!==null?PEC+' unidades/mês':'Inviável');
  const vb=$('viabBox');
  if(lucLiq>0&&margLiq>=10){vb.className='viab-box ok';vb.innerHTML='<span class="viab-ico">✅</span><div><strong>Projeto Viável!</strong> Margem saudável.</div>';}
  else if(lucLiq>0){vb.className='viab-box warn';vb.innerHTML='<span class="viab-ico">⚠️</span><div><strong>Atenção:</strong> Margem abaixo de 10%.</div>';}
  else{vb.className='viab-box bad';vb.innerHTML='<span class="viab-ico">❌</span><div><strong>Inviável na configuração atual.</strong></div>';}
}

function calcPrecoSug(cfU,txICMS,txPC,txCom,margem,regime) {
  let PVs=10000;
  for(let i=0;i<200;i++){
    const rl=PVs*(1-txICMS-txPC),d=PVs*txCom+cfU,lo=rl-d;
    let ir=regime==='lucro_real'?Math.max(lo*IRPJ_CSLL_LR,0):PVs*IRPJ_CSLL_LP;
    const ll=lo-ir,ma=rl>0?ll/rl:0,diff=margem-ma;
    if(Math.abs(diff)<.0001)break; PVs=PVs*(1+diff*.5);
  }
  return Math.max(PVs,0);
}

// Live update listeners
['precoVenda','regime','destino','txComissao','despAdmin','freteEx','margemSlider'].forEach(id=>{
  const e=$(id); if(e) e.addEventListener('input',atualizarSimulador); if(e) e.addEventListener('change',atualizarSimulador);
});

/* ===== SAVE SIMULATION (RF20) ===== */
$('btnSalvarSimulacao').addEventListener('click', () => {
  atualizarSimulador();
  const nome = $('nomeModelo').value || 'Simulação sem nome';
  const sim = { id:uid(), data:new Date().toISOString(), nome, ...simData };
  const list = DB.get('simulacoes'); list.push(sim); DB.set('simulacoes', list);
  renderHistorico(); refreshDashboard(); toast('Simulação salva!');
});

$('btnGerarRelatorio').addEventListener('click', () => showSection('secRelatorios'));
$('btnVoltarSim').addEventListener('click', () => showSection('secSimulacao'));

/* ===== HISTÓRICO (RF20, RF22) ===== */
function renderHistorico() {
  const list = DB.get('simulacoes'), el = $('historicoList');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><span class="empty-ico">📚</span><p>Nenhuma simulação salva.</p></div>'; return; }
  el.innerHTML = list.map((s,i) => `<label class="hist-item" style="cursor:pointer">
    <input type="checkbox" class="hist-check" data-idx="${i}" style="accent-color:var(--primary)">
    <span class="hist-date">${new Date(s.data).toLocaleDateString('pt-BR')}</span>
    <span class="hist-name">${s.nome}</span>
    <span class="hist-price">${fmtBRL(s.PV)}</span>
    <span class="hist-margin">${(s.margLiq||0).toFixed(1)}%</span>
    <button class="btn-icon danger" onclick="delSim(${i});event.stopPropagation()">🗑️</button>
  </label>`).join('');
  $('btnCompararCenarios').disabled = false;
  // Update selectors in post-sale
  const sel = $('compSimSelect');
  sel.innerHTML = '<option value="">— Selecione —</option>' + list.map((s,i)=>`<option value="${i}">${s.nome} (${new Date(s.data).toLocaleDateString('pt-BR')})</option>`).join('');
}
window.delSim = function(i) {
  if(!confirm('Excluir simulação?'))return;
  const l=DB.get('simulacoes'); l.splice(i,1); DB.set('simulacoes',l); renderHistorico(); refreshDashboard(); toast('Simulação excluída.','info');
};

/* ===== COMPARAÇÃO DE CENÁRIOS (RF22) ===== */
$('btnCompararCenarios').addEventListener('click', () => {
  const checks = document.querySelectorAll('.hist-check:checked');
  if (checks.length < 2) { toast('Selecione ao menos 2 simulações.','error'); return; }
  const sims = DB.get('simulacoes');
  const selected = Array.from(checks).map(c => sims[parseInt(c.dataset.idx)]).filter(Boolean);
  $('comparacaoCard').style.display = 'block';
  const metrics = [
    ['Preço de Venda','PV',fmtBRL],['CPV','CPV',fmtBRL],['Lucro Líquido','lucLiq',fmtBRL],
    ['Margem Líquida','margLiq',v=>v.toFixed(2)+'%'],['Ponto Equilíbrio','PEC',v=>v!==null?v+' un':'N/D']
  ];
  $('compHeader').innerHTML = '<th>Indicador</th>' + selected.map(s=>`<th>${s.nome}</th>`).join('');
  $('compBody').innerHTML = metrics.map(([label,key,fmt])=>`<tr><td><strong>${label}</strong></td>${selected.map(s=>`<td class="mono text-right">${fmt(s[key])}</td>`).join('')}</tr>`).join('');
});

/* ===== RELATÓRIO (RF14-RF16) ===== */
function gerarRelatorio() {
  atualizarSimulador();
  const d=simData, lote=parseInt($('loteMensal').value)||1;
  const radEquip=document.querySelector('input[name="equipamento"]:checked');
  const equipLabel=radEquip?radEquip.closest('.product-card').querySelector('strong').textContent:'—';
  const modelo=$('nomeModelo').value||'—';
  setText('relNomeProd',equipLabel+(modelo!=='—'?' · '+modelo:'')); setText('relData',new Date().toLocaleDateString('pt-BR'));
  setText('relRegime',d.regime==='lucro_real'?'Lucro Real':'Lucro Presumido');
  const destLabel=$('destino').options[$('destino').selectedIndex]?.text||'—';
  setText('relDestino',destLabel); setText('exec_lucro',fmtBRL(d.lucLiq));
  setText('exec_margem','Margem: '+(d.recLiq>0?(d.lucLiq/d.recLiq*100).toFixed(1).replace('.',','):0)+'%');
  setText('exec_custo',fmtBRL(d.custoTot)); setText('exec_pec',d.PEC!==null?d.PEC+' un':'N/D');
  setText('exec_bom',fmtBRL(d.matLiq)); setText('rA_lote',lote+' un/mês');

  // BOM report
  const mats=getMaterialsMap(); let bH='',bTP=0,bTC=0,bTI=0,bTPIS=0;
  document.querySelectorAll('#bomBody tr').forEach(row=>{
    const matId=row.dataset.mat,orig=row.dataset.orig||'nacional',peso=parseFloat(row.dataset.peso)||0,custo=parseFloat(row.dataset.custo)||0;
    const tipo=row.querySelector('.comp-tipo')?.options[row.querySelector('.comp-tipo')?.selectedIndex]?.text||'—';
    const spec=row.querySelector('.spec')?.value||'—';
    const matNome=mats[matId]?.nome||'Material';
    let icmsC=0,pisC=0;
    if(d.regime==='lucro_real'&&orig==='nacional'&&d.destino!=='EX'){icmsC=custo*d.icmsPct;pisC=custo*d.pc.credito;}
    bTP+=peso;bTC+=custo;bTI+=icmsC;bTPIS+=pisC;
    bH+=`<tr><td>${tipo} — <em>${spec}</em><br><small class="text-muted">${matNome}</small></td>
    <td>${orig==='nacional'?'🇧🇷 Nacional':'🌐 Importado'}</td>
    <td class="text-right mono">${peso.toFixed(2)}</td><td class="text-right mono">${fmtBRL(custo)}</td>
    <td class="text-right mono ${icmsC>0?'text-accent':''}">${icmsC>0?fmtBRL(icmsC):'—'}</td>
    <td class="text-right mono ${pisC>0?'text-accent':''}">${pisC>0?fmtBRL(pisC):'—'}</td></tr>`;
  });
  $('relBomBody').innerHTML=bH; setText('relBomPesoT',bTP.toFixed(2)+' kg'); setText('relBomCustoT',fmtBRL(bTC));
  setText('relBomICMST',fmtBRL(bTI)); setText('relBomPIST',fmtBRL(bTPIS));
  $('relNotaBOM').textContent=d.regime==='lucro_real'?`Créditos: ${fmtBRL(bTI+bTPIS)}.`:`Regime Cumulativo — sem crédito. Total: ${fmtBRL(bTC)}.`;

  // DRE
  const RB=d.PV, cifUnit=d.cpvUnit.cif, rows=[];
  const add=(t,l,v,n='')=>rows.push({t,l,v,n});
  add('group','1. RECEITA BRUTA',RB); add('item','(—) ICMS',-d.debICMS,`${(d.icmsPct*100).toFixed(1)}%`);
  add('item','(—) PIS/COFINS',-d.debPC,`${(d.pc.venda*100).toFixed(2)}%`); add('total','2. RECEITA LÍQUIDA',d.recLiq);
  add('group','3. CPV',-d.CPV); add('item','   Materiais',-d.matLiq); add('item','   MOD',-d.cpvUnit.mod);
  add('item','   CIF',-cifUnit); add('total','4. LUCRO BRUTO',d.lucBruto);
  add('group','5. DESPESAS OP.',-d.totDesp); add('item','   Comissão',-d.despCom); add('item','   Admin',-d.despAdmU);
  if(d.despLog>0) add('item','   Logística',-d.despLog);
  add('total','6. EBIT',d.lucOp); add('item','(—) IRPJ/CSLL',-d.ir); add('total','7. LUCRO LÍQUIDO',d.lucLiq);

  let dreH='';
  rows.forEach(r=>{
    const av=RB>0?(r.v/RB*100).toFixed(1)+'%':'—';
    const cls=r.t==='total'?'dre-total-dark':r.t==='group'?'dre-group-dark':'dre-item-dark';
    const neg=r.v<0&&r.t!=='total';
    dreH+=`<tr class="${cls}"><td style="${r.t==='group'?'font-weight:700':r.t!=='total'?'padding-left:24px':''}">
    <strong>${r.l}</strong>${r.n?`<br><small class="text-muted">${r.n}</small>`:''}</td>
    <td class="text-right mono" style="${neg?'color:#ef4444':''}">${fmtBRL(Math.abs(r.v))}</td>
    <td class="text-right mono text-muted">${av}</td></tr>`;
  });
  $('dreTbody').innerHTML=dreH;

  // Notas & Indicadores
  const notas=[];
  if(d.regime==='lucro_real'){notas.push({t:'IPI',x:`5%. Valor: ${fmtBRL(RB*IPI)}`});notas.push({t:'ICMS',x:d.destino==='EX'?'Imunidade.':`Débito: ${(d.icmsPct*100).toFixed(1)}%. Créd: ${fmtBRL(bTI)}`});
    notas.push({t:'PIS/COFINS',x:`Déb: ${(d.pc.venda*100).toFixed(2)}%. Créd: ${fmtBRL(bTPIS)}`});notas.push({t:'IRPJ/CSLL',x:'34% sobre lucro.'});
  }else{notas.push({t:'ICMS',x:`${(d.icmsPct*100).toFixed(1)}%`});notas.push({t:'PIS/COFINS',x:'Cumulativo.'});notas.push({t:'IRPJ/CSLL',x:'Base presuntiva.'});}
  $('notasGrid').innerHTML=notas.map(n=>`<div class="nota-box"><strong>${n.t}</strong>${n.x}</div>`).join('');

  const mB=d.recLiq>0?(d.lucBruto/d.recLiq*100):0,mL=d.recLiq>0?(d.lucLiq/d.recLiq*100):0,mk=d.CPV>0?(d.lucLiq/d.CPV*100):0;
  const inds=[];
  const addI=(l,v,desc,c)=>inds.push({l,v,desc,c});
  addI('Margem Bruta',mB.toFixed(2)+'%','LB/Rec.Líq',mB>30?'ok':mB>10?'warn':'bad');
  addI('Margem Líquida',mL.toFixed(2)+'%','LL/Rec.Líq',mL>=10?'ok':mL>=0?'warn':'bad');
  addI('Markup',mk.toFixed(2)+'%','LL/CPV',mk>20?'ok':mk>0?'warn':'bad');
  addI('PEC',d.PEC!==null?d.PEC+' un/mês':'N/D','Lucro zero',d.PEC&&d.PEC<lote?'ok':'warn');
  addI('MC',fmtBRL(d.mc),'PV-Var.',d.mc>0?'ok':'bad');
  addI('Preço Sug.',fmtBRL(d.precoSug),'Margem desejada','');
  $('indicadoresGrid').innerHTML=inds.map(i=>`<div class="indic-box ${i.c}"><div class="indic-label">${i.l}</div><div class="indic-val">${i.v}</div><div class="indic-desc">${i.desc}</div></div>`).join('');
}

/* ===== VENDAS (RF17) ===== */
function renderVendas() {
  const list=DB.get('vendas'),tb=$('vendasBody');
  if(!list.length){tb.innerHTML='<tr><td colspan="6"><div class="empty-state"><span class="empty-ico">🤝</span><p>Nenhuma venda registrada.</p></div></td></tr>';return;}
  tb.innerHTML=list.map((v,i)=>`<tr>
    <td class="mono">${v.data}</td><td>${v.produto}</td><td>${v.local}</td><td class="mono text-accent">${fmtBRL(v.valor)}</td>
    <td>${v.nf||'—'}</td>
    <td><div class="actions"><button class="btn-icon danger" onclick="delVenda(${i})">🗑️</button></div></td>
  </tr>`).join('');
  const sel=$('compVendaSelect');
  sel.innerHTML='<option value="">— Selecione —</option>'+list.map((v,i)=>`<option value="${i}">${v.produto} - ${v.data} (${fmtBRL(v.valor)})</option>`).join('');
}
$('btnAddVenda').addEventListener('click',()=>{
  openModal('Registrar Venda (RF17)',`
    <div class="form-group"><label>Data</label><input id="vData" type="date" value="${new Date().toISOString().slice(0,10)}"></div>
    <div class="form-row"><div class="form-group"><label>Produto</label><input id="vProd" type="text" placeholder="Nome do produto"></div>
    <div class="form-group"><label>Localidade</label><input id="vLocal" type="text" placeholder="Ex: São Paulo/SP"></div></div>
    <div class="form-group"><label>Valor da Venda (R$)</label><input id="vValor" type="number" step="0.01"></div>
    <div class="form-group"><label>Nº Nota Fiscal</label><input id="vNF" type="text" placeholder="Opcional"></div>`,
  ()=>{
    const list=DB.get('vendas');
    list.push({data:$('vData').value,produto:$('vProd').value,local:$('vLocal').value,valor:parseFloat($('vValor').value)||0,nf:$('vNF').value});
    DB.set('vendas',list); renderVendas(); refreshDashboard(); closeModal(); toast('Venda registrada!');
  });
});
window.delVenda=function(i){if(!confirm('Excluir?'))return;const l=DB.get('vendas');l.splice(i,1);DB.set('vendas',l);renderVendas();refreshDashboard();toast('Venda excluída.','info');};

/* ===== IMPORTAR NF (RF18) ===== */
$('btnImportarNF').addEventListener('click',()=>{
  openModal('Importar Nota Fiscal (RF18)',`
    <p class="text-muted">Selecione o arquivo XML da NF-e ou preencha manualmente.</p>
    <div class="form-group mt-3"><label>Arquivo NF-e (XML)</label><input id="nfFile" type="file" accept=".xml"></div>
    <div class="info-box mt-3">O sistema extrairá automaticamente os dados da nota fiscal para registro.</div>
    <div class="form-group mt-3"><label>Ou preencha manualmente — Nº NF</label><input id="nfNum" type="text"></div>
    <div class="form-row"><div class="form-group"><label>Valor Total (R$)</label><input id="nfVal" type="number" step="0.01"></div>
    <div class="form-group"><label>Data Emissão</label><input id="nfData" type="date" value="${new Date().toISOString().slice(0,10)}"></div></div>
    <div class="form-group"><label>Destinatário / Localidade</label><input id="nfDest" type="text"></div>`,
  ()=>{
    const list=DB.get('vendas');
    list.push({data:$('nfData').value,produto:'(Importado via NF)',local:$('nfDest').value,valor:parseFloat($('nfVal').value)||0,nf:$('nfNum').value});
    DB.set('vendas',list); renderVendas(); refreshDashboard(); closeModal(); toast('NF importada com sucesso!');
  });
});

/* ===== COMPARAÇÃO SIM × REAL (RF19) ===== */
$('btnCompararSimVenda').addEventListener('click',()=>{
  const si=parseInt($('compSimSelect').value),vi=parseInt($('compVendaSelect').value);
  if(isNaN(si)||isNaN(vi)){toast('Selecione uma simulação e uma venda.','error');return;}
  const sims=DB.get('simulacoes'),vendas=DB.get('vendas');
  const sim=sims[si],venda=vendas[vi]; if(!sim||!venda)return;
  $('compResultado').style.display='block';
  setText('compSimPreco',fmtBRL(sim.PV)); setText('compRealPreco',fmtBRL(venda.valor));
  const diff=venda.valor-sim.PV, pct=sim.PV>0?((diff/sim.PV)*100).toFixed(1):'0';
  setText('compDiff',fmtBRL(diff)+` (${pct}%)`);
});

/* ===== DASHBOARD (RF21, RF23) ===== */
function refreshDashboard() {
  setText('dashMatCount',DB.get('materiais').length);
  setText('dashCompCount',DB.get('componentes').length);
  const sims=DB.get('simulacoes'); setText('dashSimCount',sims.length);
  const vendas=DB.get('vendas'); setText('dashVendaCount',vendas.length);

  // Recent sims
  const recSim=$('dashRecentSim');
  if(sims.length){
    recSim.innerHTML=sims.slice(-5).reverse().map(s=>`<div class="hist-item">
      <span class="hist-date">${new Date(s.data).toLocaleDateString('pt-BR')}</span>
      <span class="hist-name">${s.nome}</span>
      <span class="hist-price">${fmtBRL(s.PV)}</span>
      <span class="hist-margin">${(s.margLiq||0).toFixed(1)}%</span>
    </div>`).join('');
  } else { recSim.innerHTML='<div class="empty-state"><span class="empty-ico">🧮</span><p>Nenhuma simulação.</p></div>'; }

  // Recent vendas
  const recV=$('dashRecentVendas');
  if(vendas.length){
    recV.innerHTML=vendas.slice(-5).reverse().map(v=>`<div class="hist-item">
      <span class="hist-date">${v.data}</span>
      <span class="hist-name">${v.produto}</span>
      <span class="hist-price">${fmtBRL(v.valor)}</span>
    </div>`).join('');
  } else { recV.innerHTML='<div class="empty-state"><span class="empty-ico">🤝</span><p>Nenhuma venda.</p></div>'; }

  // Charts
  renderCharts(sims);
}

function renderCharts(sims) {
  // Chart 1: Custo composition (doughnut)
  const ctx1=$('chartCusto');
  if(chartCusto) chartCusto.destroy();
  chartCusto=new Chart(ctx1,{
    type:'doughnut',
    data:{labels:['Materiais','MOD','CIF'],datasets:[{data:[cpvUnit.mat,cpvUnit.mod,cpvUnit.cif],backgroundColor:['#4f8ef7','#10b981','#f59e0b'],borderWidth:0}]},
    options:{responsive:true,plugins:{legend:{labels:{color:'#8b949e',font:{family:'Inter'}}}}}
  });

  // Chart 2: Cenários (bar)
  const ctx2=$('chartCenarios');
  if(chartCenarios) chartCenarios.destroy();
  const last5=sims.slice(-5);
  chartCenarios=new Chart(ctx2,{
    type:'bar',
    data:{labels:last5.map(s=>s.nome?.substring(0,15)||'Sim'),datasets:[{label:'Margem Líq. %',data:last5.map(s=>s.margLiq||0),backgroundColor:'rgba(79,142,247,.6)',borderRadius:6}]},
    options:{responsive:true,scales:{y:{ticks:{color:'#8b949e'},grid:{color:'rgba(255,255,255,.06)'}},x:{ticks:{color:'#8b949e'},grid:{display:false}}},plugins:{legend:{labels:{color:'#8b949e'}}}}
  });
}

/* ===== INIT APP ===== */
function initApp() {
  initDefaults();
  renderMateriais(); renderComponentes(); renderCustos(); renderVendas(); renderHistorico();
  atualizarCPVPreview(); atualizarHints();
  refreshDashboard();
  refreshHome();
  // Update header badge
  const nomeEl=$('nomeModelo');
  if(nomeEl) nomeEl.addEventListener('input',()=>setText('headerEquipName',nomeEl.value||'Nenhum produto definido'));
}

/* ===== ROLE-BASED VISIBILITY ===== */
function applyRoleVisibility(role) {
  // Sections hidden per role
  const vendedorSections = ['secHome','secDashboard','secMateriais','secComponentes','secProduto','secMarketplace','secPosVenda','secHistTributacao','secSimulacao','secRelatorios','secCustos'];
  const compradorSections = ['secHome','secDashboard','secMarketplace','secHistTributacao'];
  const adminSections = ['secHome','secDashboard','secMateriais','secComponentes','secCustos','secProduto','secSimulacao','secRelatorios','secHistTributacao','secMarketplace','secPosVenda'];
  const gestorSections = adminSections;

  const allowed = {
    admin: adminSections,
    gestor: gestorSections,
    vendedor: vendedorSections,
    comprador: compradorSections
  }[role] || adminSections;

  document.querySelectorAll('.nav-item[data-section]').forEach(nav => {
    const sec = nav.dataset.section;
    if (allowed.includes(sec)) {
      nav.style.display = '';
    } else {
      nav.style.display = 'none';
    }
  });

  // Show publish button only for vendedor and admin
  const btnPubl = $('btnPublicarItem');
  if(btnPubl) btnPubl.style.display = (role === 'vendedor' || role === 'admin' || role === 'gestor') ? '' : 'none';

  // Show buy button only for comprador and admin
  const btnComp = $('btnComprarItem');
  if(btnComp) btnComp.style.display = (role === 'comprador' || role === 'admin') ? '' : 'none';
}

/* ===== HOME: VITRINE + RECOMENDAÇÕES ===== */
let selectedVitrineItem = null;

function refreshHome() {
  renderVitrine();
  renderRecommendations();
}

function renderVitrine() {
  const filter = $('vitrineFilter')?.value || 'todos';
  const marketplace = DB.get('marketplace').filter(i => i.status === 'disponivel');
  const grid = $('vitrineGrid');
  if (!grid) return;

  let items = marketplace;
  if (filter !== 'todos') items = items.filter(i => i.tipo === filter);

  if (!items.length) {
    grid.innerHTML = '<div class="empty-state"><span class="empty-ico">🏷️</span><p>Nenhum item disponível nesta categoria.</p></div>';
    return;
  }

  const tipoIcos = {material:'🧱',componente:'⚙️',produto:'📦'};
  const tipoLabels = {material:'Material',componente:'Componente',produto:'Produto'};

  grid.innerHTML = items.map(item => `
    <div class="vitrine-card ${selectedVitrineItem?.id === item.id ? 'selected':''}"
         onclick="selectVitrineItem('${item.id}')">
      <div class="vc-type-badge">${tipoIcos[item.tipo]||'📦'} ${tipoLabels[item.tipo]||item.tipo}</div>
      <div class="vc-name">${item.nome}</div>
      <div class="vc-desc">${item.descricao || '—'}</div>
      <div class="vc-price">${fmtBRL(item.preco)}</div>
      <div class="vc-seller">Vendido por: <strong>${item.vendedor || '—'}</strong></div>
      <button class="btn btn-sm btn-outline vc-sim-btn" onclick="event.stopPropagation();selectVitrineItem('${item.id}')">🧮 Simular Tributação</button>
    </div>
  `).join('');
}

window.selectVitrineItem = function(id) {
  const items = DB.get('marketplace');
  const item = items.find(i => i.id === id);
  if (!item) return;

  selectedVitrineItem = item;
  $('simTribCard').style.display = 'block';
  $('stiName').textContent = `${item.nome} (${item.tipo})`;
  $('stiBase').textContent = `Preço base: ${fmtBRL(item.preco)}`;

  // Show buy button for comprador
  if (currentUser && (currentUser.role === 'comprador' || currentUser.role === 'admin')) {
    $('btnComprarItem').style.display = '';
  }

  calcTribSimulation();
  renderVitrine();

  $('simTribCard').scrollIntoView({behavior:'smooth',block:'nearest'});
};

function calcTribSimulation() {
  if (!selectedVitrineItem) return;
  const preco = selectedVitrineItem.preco;
  const destino = $('simTribDestino')?.value || 'SP';
  const regime = $('simTribRegime')?.value || 'lucro_real';

  const icmsPct = destino === 'EX' ? 0 : (ICMS_UF[destino] || 0.18);
  const pc = PIS_COFINS[regime];
  const pcPct = destino === 'EX' ? 0 : pc.venda;
  const ipiPct = IPI;

  const icmsVal = preco * icmsPct;
  const pcVal = preco * pcPct;
  const ipiVal = preco * ipiPct;
  const total = preco + icmsVal + pcVal + ipiVal;

  setText('trICMS', fmtBRL(icmsVal));
  setText('trPISCOF', fmtBRL(pcVal));
  setText('trIPI', fmtBRL(ipiVal));
  setText('trTotal', fmtBRL(total));
}

// Tax simulation listeners
['simTribDestino','simTribRegime'].forEach(id => {
  const e=$(id); if(e) { e.addEventListener('change', calcTribSimulation); }
});

// Vitrine filter listener
const vfEl=$('vitrineFilter');
if(vfEl) vfEl.addEventListener('change', renderVitrine);

// Buy item
if($('btnComprarItem')) {
  $('btnComprarItem').addEventListener('click', () => {
    if (!selectedVitrineItem || !currentUser) return;
    const destino = $('simTribDestino')?.value || 'SP';
    const regime = $('simTribRegime')?.value || 'lucro_real';
    const icmsPct = destino === 'EX' ? 0 : (ICMS_UF[destino] || 0.18);
    const pc = PIS_COFINS[regime];
    const pcPct = destino === 'EX' ? 0 : pc.venda;
    const tribTotal = selectedVitrineItem.preco * (icmsPct + pcPct + IPI);

    // Register buy
    const compras = DB.get('mkt_compras');
    compras.push({
      id: uid(),
      data: new Date().toISOString().slice(0,10),
      itemId: selectedVitrineItem.id,
      tipo: selectedVitrineItem.tipo,
      nome: selectedVitrineItem.nome,
      vendedor: selectedVitrineItem.vendedor,
      preco: selectedVitrineItem.preco,
      tributacao: tribTotal,
      comprador: currentUser.nome,
      destino, regime
    });
    DB.set('mkt_compras', compras);

    // Register sale for the seller
    const mktVendas = DB.get('mkt_vendas');
    mktVendas.push({
      id: uid(),
      data: new Date().toISOString().slice(0,10),
      itemId: selectedVitrineItem.id,
      tipo: selectedVitrineItem.tipo,
      nome: selectedVitrineItem.nome,
      comprador: currentUser.nome,
      vendedor: selectedVitrineItem.vendedor,
      preco: selectedVitrineItem.preco,
      status: 'concluída'
    });
    DB.set('mkt_vendas', mktVendas);

    // Save to export taxation history
    const tribHist = DB.get('trib_history');
    tribHist.push({
      id: uid(),
      data: new Date().toISOString().slice(0,10),
      produto: selectedVitrineItem.nome,
      destino: destino,
      destinoLabel: destino === 'EX' ? 'Exportação' : destino,
      precoBase: selectedVitrineItem.preco,
      icms: selectedVitrineItem.preco * icmsPct,
      pisCofins: selectedVitrineItem.preco * pcPct,
      ipi: selectedVitrineItem.preco * IPI,
      totalTributos: tribTotal,
      totalComTributos: selectedVitrineItem.preco + tribTotal,
      regime: regime === 'lucro_real' ? 'Lucro Real' : 'Lucro Presumido'
    });
    DB.set('trib_history', tribHist);

    // Mark as sold
    const mkt = DB.get('marketplace');
    const idx = mkt.findIndex(i => i.id === selectedVitrineItem.id);
    if (idx !== -1) { mkt[idx].status = 'vendido'; DB.set('marketplace', mkt); }

    selectedVitrineItem = null;
    $('simTribCard').style.display = 'none';
    renderVitrine();
    toast('Compra realizada com sucesso!');
  });
}

/* ===== HOME: SMART RECOMMENDATIONS ===== */
function renderRecommendations() {
  const grid = $('recoGrid');
  if (!grid) return;
  const mats = DB.get('materiais');
  const comps = DB.get('componentes');
  const sims = DB.get('simulacoes');
  const mkt = DB.get('marketplace').filter(i => i.status === 'disponivel');

  const recos = [];

  if (mats.length < 3) {
    recos.push({
      ico: '🧱',
      title: 'Cadastrar mais Materiais',
      desc: `Você tem apenas ${mats.length} material(is). Cadastre mais para diversificar a composição dos produtos.`,
      action: "showSection('secMateriais')",
      btnText: 'Ir para Materiais',
      priority: 'high'
    });
  }

  if (comps.length < 2) {
    recos.push({
      ico: '⚙️',
      title: 'Cadastrar Componentes',
      desc: `Você tem ${comps.length} componente(s). Adicione mais para montar produtos completos.`,
      action: "showSection('secComponentes')",
      btnText: 'Ir para Componentes',
      priority: 'high'
    });
  }

  if (sims.length === 0) {
    recos.push({
      ico: '📦',
      title: 'Configure seu primeiro Produto',
      desc: 'Nenhuma simulação realizada. Configure um produto e teste diferentes cenários de preço.',
      action: "showSection('secProduto')",
      btnText: 'Configurar Produto',
      priority: 'medium'
    });
  }

  if (mkt.length === 0 && (currentUser?.role === 'vendedor' || currentUser?.role === 'admin')) {
    recos.push({
      ico: '🏷️',
      title: 'Publique itens à venda',
      desc: 'O marketplace está vazio. Publique materiais, componentes ou produtos para atrair compradores.',
      action: "showSection('secMarketplace')",
      btnText: 'Ir ao Marketplace',
      priority: 'medium'
    });
  }

  if (mats.length >= 3 && comps.length >= 2 && sims.length > 0) {
    recos.push({
      ico: '✅',
      title: 'Sistema bem configurado!',
      desc: 'Seu sistema está funcionando com materiais, componentes e simulações. Continue monitorando pelo Dashboard.',
      action: "showSection('secDashboard')",
      btnText: 'Ver Dashboard',
      priority: 'low'
    });
  }

  if (mats.length > 0 && comps.length > 0 && sims.length === 0) {
    recos.push({
      ico: '🧮',
      title: 'Realize uma Simulação',
      desc: 'Você tem materiais e componentes cadastrados. Simule custos e preço de venda!',
      action: "showSection('secSimulacao')",
      btnText: 'Ir para Simulação',
      priority: 'high'
    });
  }

  const prioOrder = {high:0,medium:1,low:2};
  recos.sort((a,b) => (prioOrder[a.priority]||1) - (prioOrder[b.priority]||1));

  grid.innerHTML = recos.slice(0,4).map(r => `
    <div class="reco-card reco-${r.priority}">
      <div class="reco-ico">${r.ico}</div>
      <div class="reco-body">
        <div class="reco-title">${r.title}</div>
        <div class="reco-desc">${r.desc}</div>
        <button class="btn btn-sm btn-outline reco-btn" onclick="${r.action}">${r.btnText} →</button>
      </div>
    </div>
  `).join('');
}

/* ===== EXPORT TAXATION HISTORY ===== */
let chartTribDestino = null, chartTribEvolucao = null;

function renderTribHistory() {
  const list = DB.get('trib_history');
  const tb = $('tribHistBody');
  if (!tb) return;

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="9"><div class="empty-state"><span class="empty-ico">🌍</span><p>Nenhum registro de tributação de exportação.</p></div></td></tr>';
  } else {
    tb.innerHTML = list.map(t => `<tr>
      <td class="mono">${t.data}</td>
      <td><strong>${t.produto}</strong></td>
      <td>${t.destinoLabel}</td>
      <td class="mono">${fmtBRL(t.precoBase)}</td>
      <td class="mono text-orange">${fmtBRL(t.icms)}</td>
      <td class="mono text-orange">${fmtBRL(t.pisCofins)}</td>
      <td class="mono text-orange">${fmtBRL(t.ipi)}</td>
      <td class="mono text-accent">${fmtBRL(t.totalComTributos)}</td>
      <td>${t.regime}</td>
    </tr>`).join('');
  }

  // Render taxation charts
  renderTribCharts(list);
}

function renderTribCharts(list) {
  // Chart 1: By destination (bar)
  const ctx1 = $('chartTribDestino');
  if(chartTribDestino) chartTribDestino.destroy();

  const byDest = {};
  list.forEach(t => {
    if (!byDest[t.destinoLabel]) byDest[t.destinoLabel] = 0;
    byDest[t.destinoLabel] += t.totalTributos;
  });

  chartTribDestino = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: Object.keys(byDest),
      datasets: [{
        label: 'Total Tributos (R$)',
        data: Object.values(byDest),
        backgroundColor: 'rgba(251,146,60,.6)',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {ticks:{color:'#8b949e'},grid:{color:'rgba(255,255,255,.06)'}},
        x: {ticks:{color:'#8b949e'},grid:{display:false}}
      },
      plugins: {legend:{labels:{color:'#8b949e'}}}
    }
  });

  // Chart 2: Evolution (line)
  const ctx2 = $('chartTribEvolucao');
  if(chartTribEvolucao) chartTribEvolucao.destroy();

  chartTribEvolucao = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: list.map(t => t.data),
      datasets: [{
        label: 'Tributos (R$)',
        data: list.map(t => t.totalTributos),
        borderColor: '#4f8ef7',
        backgroundColor: 'rgba(79,142,247,.1)',
        fill: true,
        tension: .4
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {ticks:{color:'#8b949e'},grid:{color:'rgba(255,255,255,.06)'}},
        x: {ticks:{color:'#8b949e'},grid:{display:false}}
      },
      plugins: {legend:{labels:{color:'#8b949e'}}}
    }
  });
}

// Export trb. history CSV
if($('btnExportTribCSV')) {
  $('btnExportTribCSV').addEventListener('click', () => {
    const list = DB.get('trib_history');
    if (!list.length) { toast('Nenhum registro para exportar.','error'); return; }
    const header = 'Data,Produto,Destino,Preço Base,ICMS,PIS/COFINS,IPI,Total c/ Tributos,Regime';
    const rows = list.map(t => `${t.data},"${t.produto}",${t.destinoLabel},${t.precoBase.toFixed(2)},${t.icms.toFixed(2)},${t.pisCofins.toFixed(2)},${t.ipi.toFixed(2)},${t.totalComTributos.toFixed(2)},${t.regime}`);
    const csv = header + '\n' + rows.join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'historico_tributacao_exportacao.csv'; a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado com sucesso!');
  });
}

/* ===== MARKETPLACE ===== */
function renderMarketplace() {
  renderMktMeusItens();
  renderMktCompras();
  renderMktVendas();
}

function renderMktMeusItens() {
  const list = DB.get('marketplace').filter(i => i.vendedor === currentUser?.nome);
  const tb = $('mktMeusItensBody');
  if (!tb) return;

  const tipoLabels = {material:'Material',componente:'Componente',produto:'Produto'};
  const statusLabels = {disponivel:'🟢 Disponível',vendido:'🔴 Vendido'};

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><span class="empty-ico">🏷️</span><p>Nenhum item publicado. Clique em "Publicar Item" para começar.</p></div></td></tr>';
    return;
  }

  tb.innerHTML = list.map(i => `<tr>
    <td>${tipoLabels[i.tipo]||i.tipo}</td>
    <td><strong>${i.nome}</strong></td>
    <td style="max-width:200px;font-size:.82rem;color:var(--muted)">${i.descricao||'—'}</td>
    <td class="mono text-accent">${fmtBRL(i.preco)}</td>
    <td>${statusLabels[i.status]||i.status}</td>
    <td><div class="actions">${i.status==='disponivel'?`<button class="btn-icon danger" onclick="delMktItem('${i.id}')">🗑️</button>`:''}</div></td>
  </tr>`).join('');
}

function renderMktCompras() {
  const list = DB.get('mkt_compras').filter(c => c.comprador === currentUser?.nome);
  const tb = $('mktMinhasComprasBody');
  if (!tb) return;
  const tipoLabels = {material:'Material',componente:'Componente',produto:'Produto'};

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><span class="empty-ico">🛒</span><p>Nenhuma compra realizada.</p></div></td></tr>';
    return;
  }

  tb.innerHTML = list.map(c => `<tr>
    <td class="mono">${c.data}</td>
    <td>${tipoLabels[c.tipo]||c.tipo}</td>
    <td><strong>${c.nome}</strong></td>
    <td>${c.vendedor}</td>
    <td class="mono text-accent">${fmtBRL(c.preco)}</td>
    <td class="mono text-orange">${fmtBRL(c.tributacao)}</td>
  </tr>`).join('');
}

function renderMktVendas() {
  const list = DB.get('mkt_vendas').filter(v => v.vendedor === currentUser?.nome);
  const tb = $('mktMinhasVendasBody');
  if (!tb) return;
  const tipoLabels = {material:'Material',componente:'Componente',produto:'Produto'};

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6"><div class="empty-state"><span class="empty-ico">💰</span><p>Nenhuma venda realizada.</p></div></td></tr>';
    return;
  }

  tb.innerHTML = list.map(v => `<tr>
    <td class="mono">${v.data}</td>
    <td>${tipoLabels[v.tipo]||v.tipo}</td>
    <td><strong>${v.nome}</strong></td>
    <td>${v.comprador}</td>
    <td class="mono text-accent">${fmtBRL(v.preco)}</td>
    <td>✅ ${v.status}</td>
  </tr>`).join('');
}

window.delMktItem = function(id) {
  if (!confirm('Remover item do marketplace?')) return;
  DB.set('marketplace', DB.get('marketplace').filter(i => i.id !== id));
  renderMktMeusItens(); renderVitrine(); toast('Item removido.','info');
};

// Publish item
if($('btnPublicarItem')) {
  $('btnPublicarItem').addEventListener('click', () => {
    openModal('Publicar Item para Venda', `
      <div class="form-group"><label>Tipo do Item</label>
        <select id="pubTipo">
          <option value="material">Material</option>
          <option value="componente">Componente</option>
          <option value="produto">Produto</option>
        </select>
      </div>
      <div class="form-group"><label>Nome</label><input id="pubNome" type="text" placeholder="Nome do item"></div>
      <div class="form-group"><label>Descrição</label><textarea id="pubDesc" placeholder="Descrição detalhada"></textarea></div>
      <div class="form-group"><label>Preço de Venda (R$)</label><input id="pubPreco" type="number" step="0.01" min="0"></div>
    `, () => {
      const nome = $('pubNome').value.trim();
      const preco = parseFloat($('pubPreco').value) || 0;
      if (!nome) { toast('Informe o nome do item.','error'); return; }
      if (preco <= 0) { toast('Informe um preço válido.','error'); return; }

      const list = DB.get('marketplace');
      list.push({
        id: uid(),
        tipo: $('pubTipo').value,
        nome: nome,
        descricao: $('pubDesc').value,
        preco: preco,
        vendedor: currentUser?.nome || 'Anônimo',
        vendedorLogin: currentUser?.login || '',
        status: 'disponivel',
        dataPub: new Date().toISOString().slice(0,10)
      });
      DB.set('marketplace', list);
      renderMktMeusItens(); renderVitrine(); closeModal(); toast('Item publicado com sucesso!');
    });
  });
}

/* ===== INIT DEFAULT MARKETPLACE ITEMS ===== */
function initDefaultMarketplace() {
  if (DB.get('marketplace').length === 0) {
    DB.set('marketplace', [
      {id:uid(),tipo:'material',nome:'Aço Carbono SAE 1020 (Lote 500kg)',descricao:'Baixo carbono, boa soldabilidade. Lote mínimo 500kg.',preco:4250,vendedor:'Vendedor',vendedorLogin:'vendedor',status:'disponivel',dataPub:'2026-03-29'},
      {id:uid(),tipo:'componente',nome:'Motor Elétrico Trifásico 50HP',descricao:'WEG, 1750RPM, alto rendimento.',preco:4500,vendedor:'Vendedor',vendedorLogin:'vendedor',status:'disponivel',dataPub:'2026-03-29'},
      {id:uid(),tipo:'produto',nome:'Compressor de Ar CP-50CV',descricao:'Compressor parafuso, 200L, pronto para uso.',preco:45000,vendedor:'Vendedor',vendedorLogin:'vendedor',status:'disponivel',dataPub:'2026-03-28'},
      {id:uid(),tipo:'material',nome:'Aço Inox AISI 304 (Chapa 2mm)',descricao:'Resistência à corrosão, chapas 1x2m.',preco:1400,vendedor:'Vendedor',vendedorLogin:'vendedor',status:'disponivel',dataPub:'2026-03-28'},
      {id:uid(),tipo:'componente',nome:'Reservatório de Ar 200L',descricao:'Pressão máxima 12bar, certificado NR-13.',preco:1800,vendedor:'Vendedor',vendedorLogin:'vendedor',status:'disponivel',dataPub:'2026-03-27'},
      {id:uid(),tipo:'produto',nome:'Bomba Hidráulica Centrífuga BH-30',descricao:'Vazão 30m³/h, motor acoplado, IP55.',preco:28000,vendedor:'Administrador',vendedorLogin:'admin',status:'disponivel',dataPub:'2026-03-27'}
    ]);
  }
}
initDefaultMarketplace();
