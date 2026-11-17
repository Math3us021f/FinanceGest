import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);
const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brlCompacto = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const GRID = '#2a2f38';
Chart.defaults.color = '#c3c9d3';
Chart.defaults.font.family = 'system-ui, sans-serif';
const pad = (n) => String(n).padStart(2, '0');
const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

let dados = [];       // lançamentos do período
let editandoId = null;
let chart = null;
let factorId = null;

/* ---------- Autenticação (RF01–RF04) ---------- */
function mostrarAuth(qual) {
  $('#app').hidden = true; $('#auth').hidden = false;
  for (const f of ['login', 'enroll', 'challenge']) $(`#form-${f}`).hidden = f !== qual;
  $('#btn-cancelar-auth').hidden = qual === 'login';
  $('#auth-msg').textContent = '';
}

async function rotear() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return mostrarAuth('login');
  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal.currentLevel === 'aal2') return entrarNoApp();
  if (aal.nextLevel === 'aal2') {
    const { data } = await sb.auth.mfa.listFactors();
    factorId = data.totp[0].id; // totp = apenas fatores verificados
    return mostrarAuth('challenge');
  }
  return iniciarEnroll();
}

async function iniciarEnroll() {
  mostrarAuth('enroll');
  // remove fatores TOTP pendentes de tentativas anteriores
  const { data: lf } = await sb.auth.mfa.listFactors();
  for (const f of lf?.all ?? []) if (f.factor_type === 'totp' && f.status === 'unverified') await sb.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' });
  if (error) return ($('#auth-msg').textContent = error.message);
  factorId = data.id;
  $('#qr').src = data.totp.qr_code;
  $('#segredo').textContent = data.totp.secret;
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('senha') });
  if (error) return ($('#auth-msg').textContent = 'E-mail ou senha inválidos.');
  e.target.reset();
  rotear();
});

async function verificar(e) {
  e.preventDefault();
  const code = new FormData(e.target).get('codigo').trim();
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return ($('#auth-msg').textContent = 'Código inválido.');
  e.target.reset();
  rotear(); // agora aal2
}
$('#form-enroll').addEventListener('submit', verificar);
$('#form-challenge').addEventListener('submit', verificar);

async function sair() { await sb.auth.signOut(); dados = []; mostrarAuth('login'); }
$('#btn-logout').addEventListener('click', sair);
$('#btn-cancelar-auth').addEventListener('click', sair);

/* ---------- App ---------- */
function entrarNoApp() {
  $('#auth').hidden = true; $('#app').hidden = false;
  resetForm();
  carregar();
}

function periodo() {
  const m = +$('#sel-mes').value, a = +$('#sel-ano').value;
  const ini = `${a}-${pad(m + 1)}-01`;
  const fim = m === 11 ? `${a + 1}-01-01` : `${a}-${pad(m + 2)}-01`;
  return { ini, fim };
}

async function carregar() {
  const { ini, fim } = periodo();
  const { data, error } = await sb.from('lancamentos').select('*')
    .gte('data', ini).lt('data', fim)
    .order('data', { ascending: false }).order('criado_em', { ascending: false });
  if (error) { if (/JWT|aal/i.test(error.message)) return rotear(); return alert(error.message); }
  dados = data;
  renderResumo(); renderCategorias(); renderLista();
  carregarEvolucao();
}

const ICONES = { alimentação: '🍽️', transporte: '🚗', moradia: '🏠', lazer: '🎮', saúde: '💊', educação: '📚', salário: '💰', outros: '📦' };
const icone = (c) => ICONES[c.toLowerCase()] ?? '🏷️';

function delta(el, atual, ant, boaSeSobe) {
  if (!ant) { el.textContent = atual ? 'sem base no mês anterior' : ''; el.className = ''; return; }
  const p = ((atual - ant) / Math.abs(ant)) * 100;
  el.textContent = `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}% vs mês anterior`;
  el.className = (p >= 0) === boaSeSobe ? 'up' : 'down';
}

let chartEvol = null;
async function carregarEvolucao() {
  const m = +$('#sel-mes').value, a = +$('#sel-ano').value;
  const base = new Date(a, m - 5, 1);
  const ini = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-01`;
  const { data, error } = await sb.from('lancamentos').select('tipo,valor,data').gte('data', ini).lt('data', periodo().fim);
  chartEvol?.destroy(); chartEvol = null;
  const msg = $('#evol-msg');
  if (error) { msg.textContent = 'Não foi possível carregar a evolução.'; msg.hidden = false; $('#box-evol').hidden = true; return; }
  const meses = Array.from({ length: 6 }, (_, i) => new Date(a, m - 5 + i, 1));
  const chave = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const tot = Object.fromEntries(meses.map((d) => [chave(d), { receita: 0, despesa: 0 }]));
  for (const l of data) tot[l.data.slice(0, 7)][l.tipo] += Number(l.valor);
  const [ant, atu] = [tot[chave(meses[4])], tot[chave(meses[5])]];
  delta($('#d-rec'), atu.receita, ant.receita, true);
  delta($('#d-desp'), atu.despesa, ant.despesa, false);
  delta($('#d-saldo'), atu.receita - atu.despesa, ant.receita - ant.despesa, true);
  const vazio = !data.length;
  msg.textContent = 'Sem lançamentos nos últimos 6 meses.'; msg.hidden = !vazio; $('#box-evol').hidden = vazio;
  if (vazio) return;
  chartEvol = new Chart($('#grafico-evol'), {
    type: 'bar',
    data: {
      labels: meses.map((d) => MESES[d.getMonth()].slice(0, 3) + '/' + String(d.getFullYear()).slice(2)),
      datasets: [
        { label: 'Receitas', data: meses.map((d) => tot[chave(d)].receita), backgroundColor: '#22c55e', borderRadius: 4 },
        { label: 'Despesas', data: meses.map((d) => tot[chave(d)].despesa), backgroundColor: '#ef4444', borderRadius: 4 },
      ],
    },
    options: { maintainAspectRatio: false, plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${brl(c.parsed.y)}` } }, legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (v) => brlCompacto(v) }, grid: { color: GRID } }, x: { grid: { display: false } } } },
  });
}

function renderResumo() {
  const soma = (t) => dados.filter((l) => l.tipo === t).reduce((s, l) => s + Number(l.valor), 0);
  const rec = soma('receita'), desp = soma('despesa'), saldo = rec - desp;
  $('#k-rec').textContent = brl(rec);
  $('#k-desp').textContent = brl(desp);
  const k = $('#k-saldo'); k.textContent = brl(saldo); k.className = saldo > 0 ? 'pos' : saldo < 0 ? 'neg' : 'neu';

  const porCat = {};
  for (const l of dados) if (l.tipo === 'despesa') porCat[l.categoria] = (porCat[l.categoria] || 0) + Number(l.valor);
  const labels = Object.keys(porCat);
  $('#sem-dados').hidden = labels.length > 0;
  $('#box-cat').hidden = labels.length === 0;
  chart?.destroy(); chart = null;
  if (!labels.length) return;
  const cores = labels.map((_, i) => `hsl(${(i * 47) % 360} 65% 55%)`);
  chart = new Chart($('#grafico'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data: labels.map((c) => porCat[c]), backgroundColor: cores, borderColor: '#181b21' }] },
    options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${brl(c.parsed)}` } } } },
  });
  $('#legenda-cat').innerHTML = labels.map((c, i) => `<li><span class="dot" style="background:${cores[i]}"></span><span class="nome">${esc(c)}</span><span class="val">${brl(porCat[c])}</span><span class="pct">${((porCat[c] / desp) * 100).toFixed(0)}%</span></li>`).join('');
}

function renderCategorias() {
  const sel = $('#f-cat'), atual = sel.value;
  const cats = [...new Set(dados.map((l) => l.categoria))].sort();
  sel.innerHTML = '<option value="">Todas categorias</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  sel.value = cats.includes(atual) ? atual : '';
}

function filtrados() {
  const t = $('#f-texto').value.trim().toLowerCase(), tp = $('#f-tipo').value, c = $('#f-cat').value;
  return dados.filter((l) => (!t || l.descricao.toLowerCase().includes(t)) && (!tp || l.tipo === tp) && (!c || l.categoria === c));
}

function renderLista() {
  const ls = filtrados();
  $('#lista-vazia').hidden = ls.length > 0;
  $('#lista').innerHTML = ls.map((l) => {
    const r = l.tipo === 'receita';
    return `
    <tr data-id="${l.id}">
      <td>${l.data.split('-').reverse().join('/')}</td>
      <td class="desc" title="${esc(l.descricao)}">${esc(l.descricao)}</td>
      <td>${icone(l.categoria)} ${esc(l.categoria)}</td>
      <td>${esc(l.metodo_pagamento ?? '')}</td>
      <td><span class="badge ${r ? 'pos' : 'neg'}">${r ? 'Receita' : 'Despesa'}</span></td>
      <td class="num ${r ? 'pos' : 'neg'}">${r ? '+' : '−'}${brl(l.valor)}</td>
      <td class="acoes"><button data-a="edit" aria-label="Editar">✎</button><button data-a="del" aria-label="Excluir">🗑</button></td>
    </tr>`;
  }).join('');
}

['#f-texto', '#f-tipo', '#f-cat'].forEach((s) => $(s).addEventListener('input', renderLista));

$('#lista').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('tr').dataset.id, l = dados.find((x) => x.id === id);
  if (b.dataset.a === 'del') {
    if (!confirm(`Excluir "${l.descricao}"?`)) return;
    const { error } = await sb.from('lancamentos').delete().eq('id', id);
    if (error) return alert(error.message);
    carregar();
  } else {
    editandoId = id;
    const f = $('#form-lanc');
    for (const k of ['valor', 'descricao', 'categoria', 'metodo_pagamento', 'data']) f.elements[k].value = l[k];
    f.elements.tipo.value = l.tipo;
    $('#form-titulo').textContent = 'Editar lançamento';
    $('#form-msg').textContent = '';
    abrirDrawer();
  }
});

/* ---------- Painel lateral ---------- */
let sujo = false;
function resetForm() {
  editandoId = null; sujo = false;
  const f = $('#form-lanc'); f.reset();
  f.elements.data.value = hoje();
  $('#form-titulo').textContent = 'Novo lançamento';
  $('#form-msg').textContent = '';
}
function abrirDrawer() {
  $('#overlay').hidden = false;
  const d = $('#drawer'); d.classList.add('aberto'); d.setAttribute('aria-hidden', 'false');
  sujo = false;
  setTimeout(() => $('#form-lanc').elements.valor.focus(), 50);
}
function fecharDrawer(forcar = false) {
  if (!forcar && sujo && !confirm('Descartar as alterações não salvas?')) return;
  $('#overlay').hidden = true;
  const d = $('#drawer'); d.classList.remove('aberto'); d.setAttribute('aria-hidden', 'true');
  resetForm();
}
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3000);
}
$('#btn-novo').addEventListener('click', () => { resetForm(); abrirDrawer(); });
$('#btn-fechar').addEventListener('click', () => fecharDrawer());
$('#btn-cancelar-edicao').addEventListener('click', () => fecharDrawer());
$('#overlay').addEventListener('click', () => fecharDrawer());
$('#form-lanc').addEventListener('input', () => { sujo = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#drawer').classList.contains('aberto')) fecharDrawer(); });

$('#form-lanc').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const row = {
    tipo: f.elements.tipo.value,
    valor: Number(f.elements.valor.value),
    descricao: f.elements.descricao.value.trim(),
    categoria: f.elements.categoria.value.trim(),
    metodo_pagamento: f.elements.metodo_pagamento.value,
    data: f.elements.data.value,
  };
  const q = editandoId ? sb.from('lancamentos').update(row).eq('id', editandoId) : sb.from('lancamentos').insert(row);
  const { error } = await q;
  if (error) return ($('#form-msg').textContent = error.message);
  // mostra o mês do lançamento salvo para o dashboard refletir imediatamente
  const [a, m] = row.data.split('-');
  $('#sel-ano').value = a; $('#sel-mes').value = +m - 1;
  const foiEdicao = !!editandoId;
  fecharDrawer(true);
  toast(foiEdicao ? 'Lançamento atualizado com sucesso.' : 'Lançamento salvo com sucesso.');
  carregar();
});

/* ---------- CSV (RF12) ---------- */
$('#btn-csv').addEventListener('click', () => {
  const cel = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const linhas = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Pagamento', 'Valor'].map(cel).join(';')];
  for (const l of filtrados()) linhas.push([l.data, l.tipo, l.descricao, l.categoria, l.metodo_pagamento ?? '', String(l.valor).replace('.', ',')].map(cel).join(';'));
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `lancamentos-${$('#sel-ano').value}-${pad(+$('#sel-mes').value + 1)}.csv` });
  a.click(); URL.revokeObjectURL(a.href);
});

/* ---------- Init ---------- */
$('#sel-mes').innerHTML = MESES.map((m, i) => `<option value="${i}">${m}</option>`).join('');
const d = new Date();
$('#sel-mes').value = d.getMonth(); $('#sel-ano').value = d.getFullYear();
$('#sel-mes').addEventListener('change', carregar);
$('#sel-ano').addEventListener('change', carregar);

sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') mostrarAuth('login'); });
rotear();
