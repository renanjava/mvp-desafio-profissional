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
  { login: 'gestor', senha: 'gestor123', nome: 'Gestor', role: 'gestor' }
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
  $('userName').textContent = user.nome;
  $('userRole').textContent = user.role === 'admin' ? 'Administrador' : 'Gestor';
  $('userAvatar').textContent = user.nome[0];
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
    secDashboard:'Dashboard',secMateriais:'Materiais',secComponentes:'Componentes',
    secCustos:'Custos Operacionais',secProduto:'Configuração do Produto',
    secSimulacao:'Simulação de Custos',secRelatorios:'Relatórios',secPosVenda:'Pós-Venda'
  };
  setText('topBarTitle', titles[secId] || '');
  if (secId === 'secSimulacao') atualizarSimulador();
  if (secId === 'secRelatorios') gerarRelatorio();
  if (secId === 'secDashboard') refreshDashboard();
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
  // Update header badge
  const nomeEl=$('nomeModelo');
  if(nomeEl) nomeEl.addEventListener('input',()=>setText('headerEquipName',nomeEl.value||'Nenhum produto definido'));
}
