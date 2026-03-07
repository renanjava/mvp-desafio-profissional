'use strict';

const MATERIAIS = {
  aco_carbono: { nome: 'Aço Carbono SAE 1020', custoKg: 8.50 },
  fofo:        { nome: 'Ferro Fundido GG25',   custoKg: 6.20 },
  inox_304:    { nome: 'Aço Inox AISI 304',    custoKg: 28.00 },
  inox_316:    { nome: 'Aço Inox 316L',        custoKg: 38.00 },
  aluminio:    { nome: 'Liga Alumínio 6061',   custoKg: 26.00 },
  circle:      { nome: 'Cobre/Latão',          custoKg: 48.00 },
  polimero:    { nome: 'Polímero/Borracha',    custoKg: 16.00 },
  nylon:       { nome: 'Nylon/Poliacetal',     custoKg: 22.00 },
};

const MULT_IMPORTADO = 1.55;
const ENCARGOS = 1.65;

const MOD_RATES = {
  usinagem:  { base: 45, label: 'Usinagem / CNC' },
  solda:     { base: 55, label: 'Soldagem & Caldeiraria' },
  montagem:  { base: 35, label: 'Montagem & Testes' },
};

const ICMS = {
  sp:    0.18,
  inter: 0.12,
  export: 0.00,
};

const PIS_COFINS = {
  lucro_real:      { venda: 0.0925, credito: 0.0925 },
  lucro_presumido: { venda: 0.0365, credito: 0.00 },
};

const IRPJ_CSLL_LR        = 0.34;
const IRPJ_CSLL_LP_FAT    = 0.0308;
const IPI_DESTAQUE        = 0.05;

let cpvUnitario = { mat: 0, mod: 0, cif: 0 };
let simData = {};

const TITULOS = [
  '', 
  'Produto & Projeto',
  'Materiais — Bill of Materials (BOM)',
  'Custos de Fabricação (MOD + CIF)',
  'Simulação de Venda',
  'Relatório Contábil Gerencial',
];
const SUBTITULOS = [
  '',
  'Defina o equipamento que você fabrica.',
  'Liste os componentes e matérias-primas.',
  'Informe tempos, encargos e custos fabris mensais.',
  'Configure preço, regime e destino para ver o resultado.',
  'DRE completa com tributações e análise de viabilidade.',
];

function goToStep(n) {
  document.querySelectorAll('.step-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.step-item').forEach((btn, i) => {
    btn.classList.remove('active');
    if (i + 1 < n) btn.classList.add('done');
    else btn.classList.remove('done');
  });
  document.getElementById('step' + n).classList.add('active');
  document.getElementById('stepBtn' + n).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (n === 3) atualizarCPVPreview();
  if (n === 4) atualizarSimulador();
  if (n === 5) gerarRelatorio();
}

document.querySelectorAll('.step-item').forEach(btn => {
  btn.addEventListener('click', () => goToStep(Number(btn.dataset.step)));
});

function atualizarVolume() {
  const h = parseFloat(document.getElementById('dimH').value) || 0;
  const l = parseFloat(document.getElementById('dimL').value) || 0;
  const p = parseFloat(document.getElementById('dimP').value) || 0;
  const vol = (h * l * p) / 1e6;
  const pesoEst = vol * 2200;
  document.getElementById('volDisplay').textContent =
    `Volume: ${vol.toFixed(3).replace('.', ',')} m³ — Peso estimado: ${pesoEst.toFixed(0)} kg`;
}

['dimH', 'dimL', 'dimP'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', atualizarVolume);
});
atualizarVolume();

let bomId = 0;

function calcularLinhaBOM(row) {
  const mat = row.querySelector('.material').value;
  const orig = row.querySelector('.origem').value;
  const peso = parseFloat(row.querySelector('.peso').value) || 0;
  const qtd = parseFloat(row.querySelector('.qtd').value) || 1;

  const info = MATERIAIS[mat];
  const mult = orig === 'importado' ? MULT_IMPORTADO : 1;
  const custo = info.custoKg * mult * peso * qtd;

  row.querySelector('.val-custo').textContent = fmtBRL(custo);
  row.dataset.custo = custo;
  row.dataset.peso = peso * qtd;
  row.dataset.orig = orig;
  row.dataset.mat = mat;
  row.dataset.qtd = qtd;

  atualizarTotalBOM();
}

function atualizarTotalBOM() {
  let totCusto = 0, totPeso = 0;
  document.querySelectorAll('#bomBody tr').forEach(r => {
    totCusto += parseFloat(r.dataset.custo) || 0;
    totPeso += parseFloat(r.dataset.peso) || 0;
  });
  document.getElementById('totalMat').textContent = fmtBRL(totCusto);
  document.getElementById('totalPeso').textContent = totPeso.toFixed(2) + ' kg';
  cpvUnitario.mat = totCusto;
  atualizarCPVPreview();
}

document.getElementById('btnAddItem').addEventListener('click', () => {
  const tpl = document.getElementById('tplBomRow');
  const clone = tpl.content.cloneNode(true);
  const tr = clone.querySelector('tr');
  tr.id = 'bom-' + (++bomId);

  tr.querySelectorAll('.cinp').forEach(el => {
    el.addEventListener('change', () => calcularLinhaBOM(tr));
    el.addEventListener('input', () => calcularLinhaBOM(tr));
  });
  tr.querySelector('.btn-rm').addEventListener('click', () => {
    tr.remove();
    atualizarTotalBOM();
  });

  document.getElementById('bomBody').appendChild(tr);
  calcularLinhaBOM(tr);
});

document.getElementById('btnAddItem').click();

function atualizarCPVPreview() {
  const lote = parseInt(document.getElementById('loteMensal').value) || 1;

  const hUs = parseFloat(document.getElementById('modUsinagem').value) || 0;
  const hSo = parseFloat(document.getElementById('modSolda').value) || 0;
  const hMo = parseFloat(document.getElementById('modMontagem').value) || 0;

  const cUs = hUs * MOD_RATES.usinagem.base * ENCARGOS;
  const cSo = hSo * MOD_RATES.solda.base * ENCARGOS;
  const cMo = hMo * MOD_RATES.montagem.base * ENCARGOS;
  const totalMOD = cUs + cSo + cMo;
  cpvUnitario.mod = totalMOD;

  const cifDepr = parseFloat(document.getElementById('cifDepr').value) || 0;
  const cifEn = parseFloat(document.getElementById('cifEnergia').value) || 0;
  const cifMa = parseFloat(document.getElementById('cifManut').value) || 0;
  const cifOt = parseFloat(document.getElementById('cifOutros').value) || 0;
  const cifTotMes = cifDepr + cifEn + cifMa + cifOt;
  const cifUnit = cifTotMes / lote;
  cpvUnitario.cif = cifUnit;

  setText('resUsinagem', fmtBRL(cUs));
  setText('resSolda', fmtBRL(cSo));
  setText('resMontagem', fmtBRL(cMo));
  setText('totalMOD', fmtBRL(totalMOD));
  setText('cifRateado', fmtBRL(cifUnit));

  const total = cpvUnitario.mat + cpvUnitario.mod + cpvUnitario.cif;
  setText('pvMat', fmtBRL(cpvUnitario.mat));
  setText('pvMod', fmtBRL(cpvUnitario.mod));
  setText('pvCif', fmtBRL(cpvUnitario.cif));
  setText('pvTotal', fmtBRL(total));
}

['modUsinagem','modSolda','modMontagem','cifDepr','cifEnergia','cifManut','cifOutros','loteMensal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', atualizarCPVPreview);
});
atualizarCPVPreview();

function atualizarHintRegime() {
  const regime = document.getElementById('regime').value;
  const hints = {
    lucro_real: '<strong>Lucro Real:</strong> Empresa pode aproveitar créditos de PIS/COFINS (9,25%) e ICMS sobre compras. IRPJ/CSLL apurado sobre o lucro real (34%).',
    lucro_presumido: '<strong>Lucro Presumido:</strong> Sistema cumulativo — sem crédito de PIS/COFINS nos insumos. IRPJ calculado sobre presunção de 8% do faturamento; CSLL sobre 12%.',
  };
  document.getElementById('hintRegime').innerHTML = hints[regime] || '';
}

function atualizarHintDestino() {
  const dest = document.getElementById('destino').value;
  const hints = {
    sp:     'Venda interna SP: ICMS 18% incidente sobre faturamento.',
    inter:  'Venda interestadual: ICMS 12% conforme tabela CONFAZ.',
    export: 'Exportação: Imunidade de ICMS e Isenção de PIS/COFINS.',
  };
  document.getElementById('hintDestino').innerHTML = hints[dest] || '';
}

function atualizarSimulador() {
  const PV = parseFloat(document.getElementById('precoVenda').value) || 0;
  const regime = document.getElementById('regime').value;
  const destino = document.getElementById('destino').value;
  const margemD = parseFloat(document.getElementById('margemSlider').value) || 0;
  const lote = parseInt(document.getElementById('loteMensal').value) || 1;
  const txComissao = (parseFloat(document.getElementById('txComissao').value) || 0) / 100;
  const despAdm = parseFloat(document.getElementById('despAdmin').value) || 0;
  const freteEx = parseFloat(document.getElementById('freteEx').value) || 0;

  const pisCofins = PIS_COFINS[regime];
  const icmsPct = ICMS[destino];

  let creditosMP = 0;
  let matLiquidaContab = cpvUnitario.mat;

  if (regime === 'lucro_real' && destino !== 'export') {
    let matNacional = 0;
    document.querySelectorAll('#bomBody tr').forEach(r => {
      if (r.dataset.orig === 'nacional') matNacional += parseFloat(r.dataset.custo) || 0;
    });
    creditosMP = matNacional * (icmsPct + pisCofins.credito);
    matLiquidaContab = cpvUnitario.mat - creditosMP;
  }

  const CPV = Math.max(matLiquidaContab + cpvUnitario.mod + cpvUnitario.cif, 0);

  const debICMS = PV * icmsPct;
  const debPISCOFINS = PV * pisCofins.venda;
  const totalImpostosVenda = debICMS + debPISCOFINS;

  const recLiquida = PV - totalImpostosVenda;

  const despComissao = PV * txComissao;
  const despAdmUnit = despAdm / lote;
  const despLogUnit = destino === 'export' ? freteEx : 0;
  const totalDespOp = despComissao + despAdmUnit + despLogUnit;

  const lucroBruto = recLiquida - CPV;
  const lucroOp = lucroBruto - totalDespOp;

  let irCsll = 0;
  if (regime === 'lucro_real') {
    irCsll = Math.max(lucroOp * IRPJ_CSLL_LR, 0);
  } else {
    irCsll = PV * IRPJ_CSLL_LP_FAT;
  }

  const lucroLiq = lucroOp - irCsll;
  const margemLiq = recLiquida > 0 ? (lucroLiq / recLiquida) * 100 : 0;

  const custoTotal = CPV + totalImpostosVenda + totalDespOp + irCsll;

  const cifTotMes = (parseFloat(document.getElementById('cifDepr').value) || 0) +
                    (parseFloat(document.getElementById('cifEnergia').value) || 0) +
                    (parseFloat(document.getElementById('cifManut').value) || 0) +
                    (parseFloat(document.getElementById('cifOutros').value) || 0);
  const custosFixosMes = cifTotMes + despAdm;
  const despVariaveisUnit = matLiquidaContab + cpvUnitario.mod + despComissao + totalImpostosVenda + irCsll;
  const mc = PV - despVariaveisUnit;
  const PEC = mc > 0 ? Math.ceil(custosFixosMes / mc) : null;

  const precoSug = calcularPrecoSugerido(CPV + despAdmUnit + despLogUnit, icmsPct, pisCofins.venda, txComissao, margemD / 100, regime);

  simData = {
    PV, CPV, matLiquidaContab, cpvUnitario: { ...cpvUnitario }, creditosMP,
    debICMS, debPISCOFINS, totalImpostosVenda, icmsPct,
    despComissao, despAdmUnit, despLogUnit, totalDespOp,
    lucroBruto, lucroOp, irCsll, lucroLiq, margemLiq, margemD,
    recLiquida, custoTotal, PEC, mc, cifTotMes, despAdm, lote,
    regime, destino, pisCofins, preSug: precoSug,
  };

  setText('rlCPV', fmtBRL(CPV));
  setText('rlImpostosV', fmtBRL(totalImpostosVenda));
  setText('rlDespOp', fmtBRL(totalDespOp));
  setText('rlCustoTotal', fmtBRL(custoTotal));
  setText('rlPreco', fmtBRL(PV));
  setText('rlIR', fmtBRL(irCsll));

  const lucroEl = document.getElementById('rlLucro');
  lucroEl.textContent = fmtBRL(lucroLiq);
  lucroEl.className = 'rl-val mono large ' + (lucroLiq >= 0 ? 'text-accent' : 'text-orange');

  setText('rlMargem', margemLiq.toFixed(2).replace('.', ',') + '%');
  const margemEl = document.getElementById('rlMargem');
  if (margemEl) margemEl.className = 'rl-val mono ' + (margemLiq >= 10 ? 'text-accent' : margemLiq >= 0 ? '' : 'text-orange');

  const vBox = document.getElementById('viabBox');
  if (lucroLiq > 0 && margemLiq >= 10) {
    vBox.className = 'viab-box ok'; vBox.innerHTML = '<span class="viab-ico">✅</span><div><strong>Projeto Viável!</strong> Margem saudável para operação sustentável.</div>';
  } else if (lucroLiq > 0) {
    vBox.className = 'viab-box warn'; vBox.innerHTML = '<span class="viab-ico">⚠️</span><div><strong>Atenção:</strong> Projeto lucrativo mas margem abaixo de 10%.</div>';
  } else {
    vBox.className = 'viab-box bad'; vBox.innerHTML = '<span class="viab-ico">❌</span><div><strong>Inviável na configuração atual.</strong></div>';
  }

  setText('spMargemRef', margemD);
  setText('spPreco', fmtBRL(precoSug));
  setText('rlPEC', PEC !== null ? PEC + ' unidades/mês' : 'Inviável');
}

function calcularPrecoSugerido(custosFixosUnit, txICMS, txPisCof, txCom, margem, regime) {
  let PVs = 10000;
  for (let i = 0; i < 200; i++) {
    const recLiq = PVs * (1 - txICMS - txPisCof);
    const desp = PVs * txCom + custosFixosUnit;
    const lucroOp = recLiq - desp;
    let ir = 0;
    if (regime === 'lucro_real') ir = Math.max(lucroOp * IRPJ_CSLL_LR, 0);
    else ir = PVs * IRPJ_CSLL_LP_FAT;
    const lucroLiq = lucroOp - ir;
    const margemAtual = recLiq > 0 ? lucroLiq / recLiq : 0;
    const diff = margem - margemAtual;
    if (Math.abs(diff) < 0.0001) break;
    PVs = PVs * (1 + diff * 0.5);
  }
  return Math.max(PVs, 0);
}

function gerarRelatorio() {
  atualizarSimulador();
  const d = simData;
  const now = new Date();
  const lote = parseInt(document.getElementById('loteMensal').value) || 1;

  const radEquip = document.querySelector('input[name="equipamento"]:checked');
  const equipLabel = radEquip ? radEquip.closest('.product-card').querySelector('strong').textContent : '—';
  const modelo = document.getElementById('nomeModelo').value || '—';
  const regimeLabel = d.regime === 'lucro_real' ? 'Lucro Real' : 'Lucro Presumido';
  const destinoLabel = { sp: 'São Paulo', inter: 'Interestadual', export: 'Exportação' }[d.destino];

  const equipNomeLongo = equipLabel + (modelo !== '—' ? ' · Modelo: ' + modelo : '');
  setText('relNomeProd', equipNomeLongo);
  setText('relData', now.toLocaleDateString('pt-BR'));
  setText('relRegime', regimeLabel);
  setText('relDestino', destinoLabel);

  setText('exec_lucro', fmtBRL(d.lucroLiq));
  setText('exec_margem', 'Margem: ' + (d.recLiquida > 0 ? (d.lucroLiq / d.recLiquida * 100).toFixed(1).replace('.', ',') : 0) + '%');
  setText('exec_custo', fmtBRL(d.custoTotal));
  setText('exec_pec', d.PEC !== null ? d.PEC + ' un' : 'N/D');
  setText('exec_bom', fmtBRL(d.matLiquidaContab));
  setText('rA_lote', lote + ' un/mês');

  let bomHtml = '';
  let bTotPeso = 0, bTotCusto = 0, bTotICMS = 0, bTotPIS = 0;
  document.querySelectorAll('#bomBody tr').forEach(row => {
    const matKey   = row.dataset.mat || 'aco_carbono';
    const origKey  = row.dataset.orig || 'nacional';
    const peso     = parseFloat(row.dataset.peso) || 0;
    const custo    = parseFloat(row.dataset.custo) || 0;
    const cpTipo   = row.querySelector('.comp-tipo')?.options[row.querySelector('.comp-tipo')?.selectedIndex]?.text || '—';
    const cpSpec   = row.querySelector('.spec')?.value || '—';

    let icmsCred = 0, pisCred = 0;
    if (d.regime === 'lucro_real' && origKey === 'nacional' && d.destino !== 'export') {
      icmsCred = custo * d.icmsPct;
      pisCred  = custo * d.pisCofins.credito;
    }

    bTotPeso += peso; bTotCusto += custo; bTotICMS += icmsCred; bTotPIS += pisCred;

    bomHtml += `<tr>
      <td>${cpTipo} — <em>${cpSpec}</em><br><small class="text-muted" style="font-size: .75rem">${MATERIAIS[matKey]?.nome || matKey}</small></td>
      <td>${origKey === 'nacional' ? '🇧🇷 Nacional' : '🌐 Importado'}</td>
      <td class="text-right mono">${peso.toFixed(2)}</td>
      <td class="text-right mono">${fmtBRL(custo)}</td>
      <td class="text-right mono ${icmsCred > 0 ? 'text-accent' : ''}">${icmsCred > 0 ? fmtBRL(icmsCred) : '—'}</td>
      <td class="text-right mono ${pisCred > 0 ? 'text-accent' : ''}">${pisCred > 0 ? fmtBRL(pisCred) : '—'}</td>
    </tr>`;
  });
  document.getElementById('relBomBody').innerHTML = bomHtml;
  setText('relBomPesoT', bTotPeso.toFixed(2) + ' kg');
  setText('relBomCustoT', fmtBRL(bTotCusto));
  setText('relBomICMST', fmtBRL(bTotICMS));
  setText('relBomPIST', fmtBRL(bTotPIS));

  document.getElementById('relNotaBOM').textContent = d.regime === 'lucro_real'
    ? `Créditos apropriados conforme regime não-cumulativo. Total = ${fmtBRL(bTotICMS + bTotPIS)}.`
    : `Regime Cumulativo — sem direito a crédito. Custo total = ${fmtBRL(bTotCusto)}.`;

  const cifDepr = parseFloat(document.getElementById('cifDepr').value) || 0;
  const cifUnit = d.cpvUnitario.cif;
  const deprU = (cifDepr / lote);
  const CPV = d.CPV;

  const dreRows = [];
  const RB = d.PV;
  const addDRE = (type, label, val, nota = '') => dreRows.push({ type, label, val, nota });

  addDRE('group', '1. RECEITA BRUTA DE VENDAS', RB, 'Faturamento total ao cliente.');
  addDRE('item',  '( — ) ICMS sobre Faturamento', -d.debICMS, `Alíquota ${(d.icmsPct * 100).toFixed(0)}%`);
  addDRE('item',  '( — ) PIS / COFINS sobre Faturamento', -d.debPISCOFINS, `Alíquota ${(d.pisCofins.venda * 100).toFixed(2)}%`);
  addDRE('total', '2. RECEITA OPERACIONAL LÍQUIDA', d.recLiquida);
  addDRE('group', '3. CUSTO DO PRODUTO VENDIDO — CPV', -CPV, 'Custeio por Absorção Total.');
  addDRE('item',  '    Materiais Diretos (BOM)', -d.matLiquidaContab, d.regime === 'lucro_real' && d.destino !== 'export' ? `Após créditos de ${fmtBRL(d.creditosMP)}` : 'Valor integral');
  addDRE('item',  '    Mão de Obra Direta (MOD)', -d.cpvUnitario.mod, `Custo efetivo com encargos.`);
  addDRE('item',  '    Custos Indiretos de Fabricação (CIF)', -cifUnit, 'Rateados por unidade.');
  addDRE('total', '4. LUCRO BRUTO', d.lucroBruto);
  addDRE('group', '5. DESPESAS OPERACIONAIS (SG&A)', -d.totalDespOp);
  addDRE('item',  '    Despesas com Vendas', -d.despComissao, `${((parseFloat(document.getElementById('txComissao').value)||0))}% de comissão.`);
  addDRE('item',  '    Despesas Administrativas', -d.despAdmUnit, `R$ ${d.despAdm.toLocaleString('pt-BR')} / mês.`);
  if (d.despLogUnit > 0) addDRE('item', '    Logística e Exportação', -d.despLogUnit, 'Frete e aduaneira.');
  addDRE('total', '6. RESULTADO OPERACIONAL — EBIT', d.lucroOp);
  addDRE('item',  '( — ) Provisão IRPJ + CSLL', -d.irCsll, d.regime === 'lucro_real' ? `34% sobre o lucro.` : `Base presuntiva.`);
  addDRE('total', '7. LUCRO LÍQUIDO DO EXERCÍCIO', d.lucroLiq);

  let dreHtml = '';
  dreRows.forEach(r => {
    const avPct = RB > 0 ? (r.val / RB * 100).toFixed(1) + '%' : '—';
    const isneg = r.val < 0;
    const isTotal = r.type === 'total';
    const isGroup = r.type === 'group';
    let rowClass = 'dre-item-dark';
    if(isTotal) rowClass = 'dre-total-dark';
    else if(isGroup) rowClass = 'dre-group-dark';
    dreHtml += `<tr class="${rowClass}">
      <td style="${isGroup ? 'font-weight:700' : isTotal ? '' : 'padding-left:24px'}">
        <strong style="${isTotal ? 'font-size:.9rem' : (isGroup ? 'color:var(--text)' : 'color:var(--muted);font-weight:600')}">${r.label}</strong>
        ${r.nota ? `<br><small class="text-muted mt-1" style="display:block;font-weight:400;font-style:italic">${r.nota}</small>` : ''}
      </td>
      <td class="text-right mono" style="white-space:nowrap; ${isneg && !isTotal ? 'color:#ef4444' : ''}">${fmtBRL(Math.abs(r.val))}</td>
      <td class="text-right mono text-muted">${avPct}</td>
    </tr>`;
  });
  _el('dreTbody').innerHTML = dreHtml;

  const notas = [];
  if (d.regime === 'lucro_real') {
    notas.push({ tit: 'IPI', txt: `Alíquota: 5%. Valor: ${fmtBRL(RB * IPI_DESTAQUE)} destacado.` });
    notas.push({ tit: 'ICMS', txt: `${d.destino === 'export' ? 'Imunidade total.' : `Débito: ${(d.icmsPct*100).toFixed(0)}%. Crédito: ${fmtBRL(bTotICMS)}.`}` });
    notas.push({ tit: 'PIS / COFINS', txt: `Débito: ${(d.pisCofins.venda*100).toFixed(2)}%. Crédito: ${fmtBRL(bTotPIS)}.` });
    notas.push({ tit: 'IRPJ / CSLL', txt: `34% sobre o lucro operacional.` });
  } else {
    notas.push({ tit: 'IPI', txt: `5% destacado. Sem crédito.` });
    notas.push({ tit: 'ICMS', txt: `Débito: ${(d.icmsPct*100).toFixed(0)}%.` });
    notas.push({ tit: 'PIS / COFINS', txt: `Cumulativo. Sem direito a crédito.` });
    notas.push({ tit: 'IRPJ / CSLL', txt: `Base presuntiva conforme faturamento.` });
  }
  notas.push({ tit: 'Importação', txt: 'Multiplicador de 1,55× aplicado para componentes importados.' });
  notas.push({ tit: 'Depreciação', txt: `Rateio de ${fmtBRL(deprU)}/unidade.` });

  _el('notasGrid').innerHTML = notas.map(n =>
    `<div class="nota-box"><strong>${n.tit}</strong>${n.txt}</div>`
  ).join('');

  const indics = [];
  const margemBruta = d.recLiquida > 0 ? (d.lucroBruto / d.recLiquida * 100) : 0;
  const margemLiq   = d.recLiquida > 0 ? (d.lucroLiq / d.recLiquida * 100) : 0;
  const markup      = CPV > 0 ? (d.lucroLiq / CPV * 100) : 0;

  const ind = (lbl, val, desc, cls) => indics.push({ lbl, val, desc, cls });
  ind('Margem Bruta', margemBruta.toFixed(2) + '%', 'LB / Rec. Líquida', margemBruta > 30 ? 'ok' : margemBruta > 10 ? 'warn' : 'bad');
  ind('Margem Líquida', margemLiq.toFixed(2) + '%', 'LL / Rec. Líquida', margemLiq >= 10 ? 'ok' : margemLiq >= 0 ? 'warn' : 'bad');
  ind('Markup s/ CPV', markup.toFixed(2) + '%', 'LL / Custo Industrial', markup > 20 ? 'ok' : markup > 0 ? 'warn' : 'bad');
  ind('Ponto de Equilíbrio', d.PEC !== null ? d.PEC + ' un/mês' : 'N/D', 'Lucro zero', d.PEC !== null && d.PEC < lote ? 'ok' : 'warn');
  ind('Margem de Contribuição', fmtBRL(d.mc), 'PV - Var.', d.mc > 0 ? 'ok' : 'bad');
  ind('Preço Sugerido', fmtBRL(d.preSug), 'Margem desejada', '');

  _el('indicadoresGrid').innerHTML = indics.map(i =>
    `<div class="indic-box ${i.cls}"><div class="indic-label">${i.lbl}</div><div class="indic-val">${i.val}</div><div class="indic-desc">${i.desc}</div></div>`
  ).join('');
}

function fmtBRL(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}
function _el(id) { return document.getElementById(id); }

atualizarHintRegime();
atualizarHintDestino();
