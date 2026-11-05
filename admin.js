/* Painel da loja Doce Sono */
const KEY = 'ds_admin_data';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const brl = v => (+v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => parseFloat(String(v ?? '').replace(/\./g, '').replace(',', '.')) || 0;
const fmtNum = v => v ? String(v).replace('.', ',') : '';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const DEFAULT = { config: { storeName: 'Doce Sono Boutique de Pijamas', whatsapp: '', storeAddress: '', deliveryEnabled: true, pickupEnabled: true, deliveryFee: 0, freeShippingFrom: 0, maxInstallments: 1, announcement: '' }, payments: [], products: [] };

let data = (() => {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch {}
  d = d || JSON.parse(JSON.stringify(window.LOJA_DADOS || DEFAULT));
  d.config = Object.assign({}, DEFAULT.config, d.config || {});
  d.payments = d.payments || [];
  d.products = d.products || [];
  return d;
})();

function save(silent) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    if (!silent) toast('Salvo! ✨');
  } catch {
    toast('Espaço do navegador cheio. Use menos fotos ou publique e descarte o rascunho.', '⚠️');
  }
  renderAll();
}

function toast(msg, icon = '💗') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
}

/* ---------- Modais ---------- */
function openModal(sel) { $(sel).classList.add('open'); $('#overlay').classList.add('show'); document.body.classList.add('lock'); }
function closeModals() { $$('.modal.open').forEach(m => m.classList.remove('open')); $('#overlay').classList.remove('show'); document.body.classList.remove('lock'); }
document.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.id === 'overlay') closeModals(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModals(); });

/* ---------- Supabase Client ---------- */
let sbClient = null;
function initSupabase() {
  if (typeof supabase === 'undefined') return null;
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem('ds_supabase_config')) || window.SUPABASE_CONFIG || {}; } catch {}
  if (cfg.url && cfg.anonKey) {
    try {
      sbClient = supabase.createClient(cfg.url, cfg.anonKey);
      $('#liveStatusBadge').textContent = '● Supabase Conectado';
      $('#liveStatusBadge').style.background = '#e8f5e9';
      $('#liveStatusBadge').style.color = '#2e7d32';
      return sbClient;
    } catch (e) {
      console.error(e);
    }
  }
  $('#liveStatusBadge').textContent = '○ Modo Local (Navegador)';
  $('#liveStatusBadge').style.background = '#fff3e0';
  $('#liveStatusBadge').style.color = '#e65100';
  return null;
}
initSupabase();

/* ---------- Abas ---------- */
$$('.tab').forEach(t => t.onclick = () => {
  $$('.tab').forEach(x => x.classList.toggle('active', x === t));
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
});

/* ---------- Pedidos Recebidos ---------- */
let adminOrders = [];
let currentOrderFilter = 'todos';

async function fetchOrders() {
  if (sbClient) {
    try {
      const { data: dbOrders, error } = await sbClient
        .from('docesono_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && dbOrders) {
        adminOrders = dbOrders;
        renderAdminOrders();
        return;
      }
    } catch (err) {
      console.warn('Erro ao buscar pedidos no Supabase, usando local:', err);
    }
  }
  // Fallback local
  try {
    adminOrders = JSON.parse(localStorage.getItem('ds_system_orders')) || [];
  } catch {
    adminOrders = [];
  }
  renderAdminOrders();
}

function setupRealtime() {
  if (!sbClient) return;
  try {
    sbClient
      .channel('admin_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docesono_orders' }, payload => {
        toast('🔔 Novo pedido ou atualização recebida!', '📦');
        fetchOrders();
      })
      .subscribe();
  } catch (err) {
    console.error('Falha no Realtime:', err);
  }
}

const STATUS_MAP = {
  pendente: { label: 'Pendente', bg: '#fff3e0', color: '#e65100' },
  em_separacao: { label: 'Em Separação', bg: '#e3f2fd', color: '#1565c0' },
  pronto: { label: 'Pronto / Enviado', bg: '#f3e5f5', color: '#7b1fa2' },
  concluido: { label: 'Concluído', bg: '#e8f5e9', color: '#2e7d32' },
  cancelado: { label: 'Cancelado', bg: '#ffebee', color: '#c62828' }
};

function renderAdminOrders() {
  const all = adminOrders;
  $('#nOrders').textContent = all.length;
  $('#countAll').textContent = all.length;
  $('#countPending').textContent = all.filter(o => (o.status || 'pendente') === 'pendente').length;
  $('#countPrep').textContent = all.filter(o => o.status === 'em_separacao').length;
  $('#countReady').textContent = all.filter(o => o.status === 'pronto').length;
  $('#countDone').textContent = all.filter(o => o.status === 'concluido').length;

  let list = all;
  if (currentOrderFilter !== 'todos') {
    list = all.filter(o => (o.status || 'pendente') === currentOrderFilter);
  }

  if (!list.length) {
    $('#adminOrdersList').innerHTML = `
      <div class="empty-admin">
        <div class="big">📦</div>
        <p>Nenhum pedido encontrado nesta categoria.</p>
      </div>`;
    return;
  }

  $('#adminOrdersList').innerHTML = list.map(o => {
    const st = STATUS_MAP[o.status || 'pendente'] || STATUS_MAP.pendente;
    const phoneRaw = (o.customer_phone || (o.customer && o.customer.phone) || '').replace(/\D/g, '');
    const custName = o.customer_name || (o.customer && o.customer.name) || 'Cliente';
    const dateFormatted = new Date(o.created_at || o.date || Date.now()).toLocaleString('pt-BR');
    const items = o.items || [];
    const isDelivery = (o.delivery_type || o.delivery) === 'entrega';
    const waMsg = encodeURIComponent(`Olá, ${custName}! Aqui é da ${data.config.storeName || 'Doce Sono'}. Estamos entrando em contato a respeito do seu pedido #${o.order_code || o.id}! 🌙`);
    const waUrl = `https://wa.me/55${phoneRaw.replace(/^55/, '')}?text=${waMsg}`;

    return `
      <div class="box order-admin-card" style="margin-bottom:1.2rem;border-left:5px solid ${st.color}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem;margin-bottom:.8rem;">
          <div>
            <h3 style="font-size:1.4rem;color:var(--wine);display:flex;gap:.5rem;align-items:center;">
              Pedido #${o.order_code || o.id}
              <span class="pill" style="background:${st.bg};color:${st.color};font-size:.78rem;font-weight:600;">
                ${st.label}
              </span>
            </h3>
            <span class="muted" style="font-size:.8rem;">Feito em: ${dateFormatted}</span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.3rem;font-weight:700;color:var(--wine);">${brl(o.total)}</div>
            <span class="muted" style="font-size:.8rem;">${isDelivery ? '🛵 Entrega' : '🏬 Retirada na loja'}</span>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:1rem;background:var(--cream);padding:.9rem;border-radius:12px;margin-bottom:.8rem;">
          <div>
            <strong style="color:var(--wine);font-size:.88rem;display:block;margin-bottom:.2rem;">👤 Dados do Cliente:</strong>
            <div style="font-weight:500;">${esc(custName)}</div>
            <div style="margin-top:.2rem;">
              <a href="${waUrl}" target="_blank" class="btn btn--whats btn--sm" style="display:inline-flex;padding:.4rem .8rem;margin-top:.3rem;text-decoration:none;">
                💬 Chamar no WhatsApp (${esc(phoneRaw)})
              </a>
            </div>
          </div>

          <div>
            <strong style="color:var(--wine);font-size:.88rem;display:block;margin-bottom:.2rem;">📍 Destino / Endereço:</strong>
            <div style="font-size:.85rem;color:var(--text);">
              ${isDelivery ? esc(o.address || 'Endereço não informado') : 'Retirada na loja'}
            </div>
          </div>

          <div>
            <strong style="color:var(--wine);font-size:.88rem;display:block;margin-bottom:.2rem;">💳 Pagamento & Detalhes:</strong>
            <div style="font-size:.85rem;"><strong>Forma:</strong> ${esc(o.payment_method || o.payment || 'Não especificado')}</div>
            ${o.change_for || o.change ? `<div style="font-size:.85rem;color:var(--wine);">Troco para: ${esc(o.change_for || o.change)}</div>` : ''}
            ${o.notes ? `<div style="font-size:.82rem;color:var(--muted);margin-top:.3rem;"><em>Obs: "${esc(o.notes)}"</em></div>` : ''}
          </div>
        </div>

        <div style="margin-bottom:.8rem;">
          <strong style="font-size:.88rem;color:var(--wine);display:block;margin-bottom:.4rem;">🛍️ Itens do Pedido:</strong>
          <ul style="padding-left:1.2rem;font-size:.88rem;color:var(--text);">
            ${items.map(it => `<li><strong>${it.qty}x</strong> ${esc(it.name)} (Tam: ${esc(it.size || 'Único')}) — <strong>${brl(it.price * it.qty)}</strong></li>`).join('')}
          </ul>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.8rem;border-top:1px dashed var(--blush-2);padding-top:.8rem;">
          <div style="display:flex;align-items:center;gap:.5rem;">
            <label style="font-size:.85rem;font-weight:500;">Status do Pedido:</label>
            <select class="select" data-update-status="${o.id || o.order_code}" style="padding:.4rem 1.8rem .4rem .8rem;font-size:.82rem;">
              <option value="pendente" ${(o.status || 'pendente') === 'pendente' ? 'selected' : ''}>Pendente</option>
              <option value="em_separacao" ${o.status === 'em_separacao' ? 'selected' : ''}>Em Separação</option>
              <option value="pronto" ${o.status === 'pronto' ? 'selected' : ''}>Pronto / Enviado</option>
              <option value="concluido" ${o.status === 'concluido' ? 'selected' : ''}>Concluído</option>
              <option value="cancelado" ${o.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
          </div>
          <div>
            <button class="btn btn--danger btn--sm" data-delete-order="${o.id || o.order_code}">Remover do Painel</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Eventos de pedidos
$('#adminOrdersList').addEventListener('change', async e => {
  const sel = e.target.closest('[data-update-status]');
  if (!sel) return;
  const orderId = sel.dataset.updateStatus;
  const newStatus = sel.value;

  // Supabase update
  if (sbClient) {
    try {
      await sbClient.from('docesono_orders').update({ status: newStatus }).eq('id', orderId);
    } catch (err) {
      console.warn('Erro ao atualizar no Supabase:', err);
    }
  }

  // Local update
  const o = adminOrders.find(x => String(x.id) === String(orderId) || String(x.order_code) === String(orderId));
  if (o) o.status = newStatus;
  try {
    localStorage.setItem('ds_system_orders', JSON.stringify(adminOrders));
  } catch {}
  toast('Status do pedido atualizado!', '✅');
  renderAdminOrders();
});

$('#adminOrdersList').addEventListener('click', async e => {
  const btn = e.target.closest('[data-delete-order]');
  if (!btn) return;
  const orderId = btn.dataset.deleteOrder;
  if (!confirm('Deseja realmente remover este pedido do painel?')) return;

  if (sbClient) {
    try {
      await sbClient.from('docesono_orders').delete().eq('id', orderId);
    } catch (err) {
      console.warn('Erro ao deletar no Supabase:', err);
    }
  }
  adminOrders = adminOrders.filter(x => String(x.id) !== String(orderId) && String(x.order_code) !== String(orderId));
  try {
    localStorage.setItem('ds_system_orders', JSON.stringify(adminOrders));
  } catch {}
  toast('Pedido removido', '🗑️');
  renderAdminOrders();
});

$('#orderStatusFilter').addEventListener('click', e => {
  const chip = e.target.closest('[data-status]');
  if (!chip) return;
  $$('#orderStatusFilter .chip').forEach(c => c.classList.toggle('active', c === chip));
  currentOrderFilter = chip.dataset.status;
  renderAdminOrders();
});

$('#refreshOrdersBtn').onclick = () => {
  fetchOrders();
  toast('Pedidos atualizados', '🔄');
};

/* ---------- Produtos ---------- */
function renderProducts() {
  const q = $('#pSearch').value.trim().toLowerCase();
  $('#nProducts').textContent = data.products.length;
  const list = data.products.map((p, i) => ({ p, i })).filter(({ p }) => !q || (p.name + ' ' + (p.cat || '')).toLowerCase().includes(q));
  if (!data.products.length) {
    $('#productList').innerHTML = `<div class="empty-admin"><div class="big">🛍️</div><p>Nenhum produto cadastrado ainda.</p><button class="btn btn--primary" onclick="editProduct()">+ Cadastrar primeiro produto</button></div>`;
    return;
  }
  $('#productList').innerHTML = list.map(({ p, i }) => `
    <div class="prow ${p.active === false ? 'off' : ''}">
      <div class="prow__img">${p.images && p.images[0] ? `<img src="${p.images[0]}" alt="">` : '📷'}</div>
      <div>
        <div class="prow__name">${esc(p.name)}</div>
        <div class="prow__meta">${esc(p.cat || 'Sem categoria')} · ${(p.sizes || []).join(', ') || 'Único'}${p.active === false ? ' · <b>oculto</b>' : ''}</div>
        <div class="prow__price">${brl(p.price)} ${p.old ? `<s class="muted">${brl(p.old)}</s>` : ''}</div>
      </div>
      <div class="prow__actions">
        <button class="mini" data-act="up" data-i="${i}" title="Subir">↑</button>
        <button class="mini" data-act="down" data-i="${i}" title="Descer">↓</button>
        <button class="mini" data-act="toggle" data-i="${i}" title="${p.active === false ? 'Mostrar' : 'Ocultar'}">${p.active === false ? '🙈' : '👁️'}</button>
        <button class="mini" data-act="dup" data-i="${i}" title="Duplicar">⧉</button>
        <button class="mini" data-act="edit" data-i="${i}" title="Editar">✏️</button>
        <button class="mini mini--danger" data-act="del" data-i="${i}" title="Excluir">🗑️</button>
      </div>
    </div>`).join('') || '<p class="muted">Nenhum resultado.</p>';
}

$('#productList').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const i = +b.dataset.i, P = data.products;
  switch (b.dataset.act) {
    case 'up': if (i > 0) [P[i - 1], P[i]] = [P[i], P[i - 1]]; break;
    case 'down': if (i < P.length - 1) [P[i + 1], P[i]] = [P[i], P[i + 1]]; break;
    case 'toggle': P[i].active = P[i].active === false; break;
    case 'dup': P.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(P[i])), id: uid(), name: P[i].name + ' (cópia)' }); break;
    case 'edit': return editProduct(i);
    case 'del': if (!confirm(`Excluir "${P[i].name}"?`)) return; P.splice(i, 1); break;
  }
  save(true);
});
$('#pSearch').addEventListener('input', renderProducts);
$('#newProduct').onclick = () => editProduct();

let editing = null, photos = [];
const pf = $('#productForm');

function editProduct(i) {
  editing = i ?? null;
  const p = i != null ? data.products[i] : { active: true };
  $('#pfTitle').textContent = i != null ? 'Editar produto' : 'Novo produto';
  pf.elements.name.value = p.name || '';
  pf.elements.price.value = fmtNum(p.price);
  pf.elements.old.value = fmtNum(p.old);
  pf.elements.cat.value = p.cat || '';
  pf.elements.tag.value = p.tag || '';
  pf.elements.sizes.value = (p.sizes || []).join(', ');
  pf.elements.desc.value = p.desc || '';
  pf.elements.active.checked = p.active !== false;
  photos = [...(p.images || [])];
  $$('.field', pf).forEach(f => { f.classList.remove('invalid'); const er = $('.err', f); if (er) er.textContent = ''; });
  $('#catList').innerHTML = [...new Set(data.products.map(x => x.cat).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join('');
  renderPhotos();
  openModal('#productModal');
  setTimeout(() => pf.elements.name.focus(), 250);
}
window.editProduct = editProduct;

function renderPhotos() {
  $('#photos').innerHTML = photos.map((src, i) => `
    <div class="photo">
      <img src="${src}" alt="">
      ${i === 0 ? '<span class="photo__cover">capa</span>' : ''}
      <div class="photo__bar">
        <button type="button" data-ph="left" data-i="${i}" title="Mover">◀</button>
        <button type="button" data-ph="del" data-i="${i}" title="Remover">✕</button>
        <button type="button" data-ph="right" data-i="${i}" title="Mover">▶</button>
      </div>
    </div>`).join('') + `
    <label class="photo-add" id="photoAdd"><span><b>+</b>Adicionar fotos</span><input type="file" accept="image/*" multiple hidden id="photoInput"></label>`;
  $('#photoInput').onchange = e => addPhotos(e.target.files);
  const add = $('#photoAdd');
  add.ondragover = e => { e.preventDefault(); add.classList.add('drag'); };
  add.ondragleave = () => add.classList.remove('drag');
  add.ondrop = e => { e.preventDefault(); add.classList.remove('drag'); addPhotos(e.dataTransfer.files); };
}
$('#photos').addEventListener('click', e => {
  const b = e.target.closest('[data-ph]'); if (!b) return;
  const i = +b.dataset.i;
  if (b.dataset.ph === 'del') photos.splice(i, 1);
  if (b.dataset.ph === 'left' && i > 0) [photos[i - 1], photos[i]] = [photos[i], photos[i - 1]];
  if (b.dataset.ph === 'right' && i < photos.length - 1) [photos[i + 1], photos[i]] = [photos[i], photos[i + 1]];
  renderPhotos();
});

function compress(file, max = 900, q = .8) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej;
      img.src = r.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
async function addPhotos(files) {
  for (const f of [...files].filter(f => f.type.startsWith('image/'))) {
    try { photos.push(await compress(f)); } catch { toast('Não foi possível ler ' + f.name, '⚠️'); }
  }
  renderPhotos();
}

pf.addEventListener('submit', e => {
  e.preventDefault();
  const E = pf.elements;
  let ok = true;
  const setErr = (el, m) => { const f = el.closest('.field'); f.classList.toggle('invalid', !!m); $('.err', f).textContent = m || ''; if (m) ok = false; };
  setErr(E.name, E.name.value.trim() ? '' : 'Informe o nome');
  setErr(E.price, num(E.price.value) > 0 ? '' : 'Informe um preço válido');
  if (!ok) return;
  const prod = {
    id: editing != null ? data.products[editing].id : uid(),
    name: E.name.value.trim(),
    price: num(E.price.value),
    old: num(E.old.value) || 0,
    cat: E.cat.value.trim(),
    tag: E.tag.value.trim(),
    sizes: E.sizes.value.split(',').map(s => s.trim()).filter(Boolean),
    desc: E.desc.value.trim(),
    images: photos,
    active: E.active.checked,
  };
  if (editing != null) data.products[editing] = prod; else data.products.push(prod);
  closeModals();
  save();
});

/* ---------- Pagamentos ---------- */
const ICONS = ['💠', '💳', '💵', '🏦', '🧾', '📱', '🤝', '💰'];
let editingPay = null;
const payf = $('#paymentForm');

function renderPayments() {
  $('#nPayments').textContent = data.payments.length;
  $('#paymentList').innerHTML = data.payments.length ? data.payments.map((p, i) => `
    <div class="payrow">
      <span class="payrow__ico">${p.icon || '💳'}</span>
      <div class="payrow__body"><strong>${esc(p.name)}</strong>${p.short ? ` <span class="muted">· ${esc(p.short)}</span>` : ''}<p>${esc(p.details || '')}</p></div>
      <div class="prow__actions">
        <button class="mini" data-pay="up" data-i="${i}">↑</button>
        <button class="mini" data-pay="edit" data-i="${i}">✏️</button>
        <button class="mini mini--danger" data-pay="del" data-i="${i}">🗑️</button>
      </div>
    </div>`).join('') : `<div class="empty-admin"><div class="big">💳</div><p>Nenhuma forma de pagamento cadastrada.<br>Sem cadastro, o pedido vai como "a combinar".</p></div>`;

  const sel = $('#maxInstallments');
  sel.innerHTML = '<option value="1">Não exibir</option>' + Array.from({ length: 11 }, (_, k) => `<option value="${k + 2}">Até ${k + 2}x sem juros</option>`).join('');
  sel.value = data.config.maxInstallments || 1;
}
$('#maxInstallments').onchange = e => { data.config.maxInstallments = +e.target.value; save(); };

$('#paymentList').addEventListener('click', e => {
  const b = e.target.closest('[data-pay]'); if (!b) return;
  const i = +b.dataset.i, P = data.payments;
  if (b.dataset.pay === 'up' && i > 0) [P[i - 1], P[i]] = [P[i], P[i - 1]];
  if (b.dataset.pay === 'edit') return editPayment(i);
  if (b.dataset.pay === 'del') { if (!confirm(`Excluir "${P[i].name}"?`)) return; P.splice(i, 1); }
  save(true);
});
$('#newPayment').onclick = () => editPayment();

function editPayment(i) {
  editingPay = i ?? null;
  const p = i != null ? data.payments[i] : { icon: '💳' };
  payf.elements.name.value = p.name || '';
  payf.elements.short.value = p.short || '';
  payf.elements.details.value = p.details || '';
  payf.elements.icon.value = p.icon || '💳';
  $('#iconPick').innerHTML = ICONS.map(ic => `<button type="button" class="${ic === payf.elements.icon.value ? 'active' : ''}" data-ic="${ic}">${ic}</button>`).join('');
  openModal('#paymentModal');
}
$('#iconPick').addEventListener('click', e => {
  const b = e.target.closest('[data-ic]'); if (!b) return;
  payf.elements.icon.value = b.dataset.ic;
  $$('#iconPick button').forEach(x => x.classList.toggle('active', x === b));
});
payf.addEventListener('submit', e => {
  e.preventDefault();
  const E = payf.elements;
  const f = E.name.closest('.field');
  if (!E.name.value.trim()) { f.classList.add('invalid'); $('.err', f).textContent = 'Informe o nome'; return; }
  f.classList.remove('invalid'); $('.err', f).textContent = '';
  const p = { name: E.name.value.trim(), icon: E.icon.value, short: E.short.value.trim(), details: E.details.value.trim() };
  if (editingPay != null) data.payments[editingPay] = p; else data.payments.push(p);
  closeModals();
  save();
});

/* ---------- Configurações ---------- */
const cf = $('#configForm');
function fillConfig() {
  const c = data.config, E = cf.elements;
  E.storeName.value = c.storeName || '';
  E.whatsapp.value = c.whatsapp || '';
  E.announcement.value = c.announcement || '';
  E.deliveryEnabled.checked = !!c.deliveryEnabled;
  E.pickupEnabled.checked = !!c.pickupEnabled;
  E.deliveryFee.value = fmtNum(c.deliveryFee);
  E.freeShippingFrom.value = fmtNum(c.freeShippingFrom);
  E.storeAddress.value = c.storeAddress || '';
}
cf.addEventListener('submit', e => {
  e.preventDefault();
  const E = cf.elements;
  if (!E.deliveryEnabled.checked && !E.pickupEnabled.checked) return toast('Ative entrega e/ou retirada', '⚠️');
  const wa = E.whatsapp.value.replace(/\D/g, '');
  if (wa && wa.length < 12) return toast('WhatsApp deve ter 55 + DDD + número', '⚠️');
  Object.assign(data.config, {
    storeName: E.storeName.value.trim() || DEFAULT.config.storeName,
    whatsapp: wa,
    announcement: E.announcement.value.trim(),
    deliveryEnabled: E.deliveryEnabled.checked,
    pickupEnabled: E.pickupEnabled.checked,
    deliveryFee: num(E.deliveryFee.value),
    freeShippingFrom: num(E.freeShippingFrom.value),
    storeAddress: E.storeAddress.value.trim(),
  });
  save();
});

/* ---------- Supabase Config Form ---------- */
const sbf = $('#supabaseForm');
function fillSupabaseForm() {
  if (!sbf) return;
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem('ds_supabase_config')) || window.SUPABASE_CONFIG || {}; } catch {}
  sbf.elements.sbUrl.value = cfg.url || '';
  sbf.elements.sbAnonKey.value = cfg.anonKey || '';
}

sbf.addEventListener('submit', e => {
  e.preventDefault();
  const url = sbf.elements.sbUrl.value.trim();
  const anonKey = sbf.elements.sbAnonKey.value.trim();
  const cfg = { url, anonKey };
  localStorage.setItem('ds_supabase_config', JSON.stringify(cfg));
  initSupabase();
  fetchOrders();
  setupRealtime();
  toast('Configurações do Supabase salvas com sucesso!', '⚡');
  $('#sbConnStatus').textContent = url ? 'Configurado!' : 'Em branco';
});

$('#testSbBtn').onclick = async () => {
  const url = sbf.elements.sbUrl.value.trim();
  const anonKey = sbf.elements.sbAnonKey.value.trim();
  if (!url || !anonKey) return toast('Preencha a URL e a Anon Key primeiro', '⚠️');
  $('#sbConnStatus').textContent = 'Testando conexão...';
  try {
    const testClient = supabase.createClient(url, anonKey);
    const { error } = await testClient.from('docesono_orders').select('count', { count: 'exact', head: true });
    if (error) {
      $('#sbConnStatus').textContent = '❌ Erro ao conectar: ' + error.message;
      toast('Erro: Verifique se rodou o script SQL no Supabase!', '⚠️');
    } else {
      $('#sbConnStatus').textContent = '✅ Conexão bem-sucedida! Tabela docesono_orders encontrada.';
      toast('Conexão perfeita com o Supabase!', '🎉');
    }
  } catch (err) {
    $('#sbConnStatus').textContent = '❌ Falha: ' + err.message;
    toast('Falha ao conectar com o Supabase', '⚠️');
  }
};

/* ---------- Publicar / backup ---------- */
function publish() {
  if (!data.config.whatsapp) toast('Atenção: configure o WhatsApp em "Loja e entrega"', '⚠️');
  const content = 'window.LOJA_DADOS = ' + JSON.stringify(data, null, 2) + ';\n';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/javascript' }));
  a.download = 'dados.js';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('dados.js baixado! Substitua o arquivo na pasta do site.', '🚀');
}
$('#publishBtn').onclick = $('#publishBtn2').onclick = publish;

$('#importFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const txt = await f.text();
    const d = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
    if (!d.products) throw 0;
    data = { config: Object.assign({}, DEFAULT.config, d.config), payments: d.payments || [], products: d.products };
    save(); fillConfig();
    toast('Dados importados!', '✅');
  } catch { toast('Arquivo inválido', '⚠️'); }
  e.target.value = '';
};
$('#resetLocal').onclick = () => {
  if (!confirm('Descartar as alterações não publicadas deste navegador e voltar ao dados.js atual?')) return;
  localStorage.removeItem(KEY);
  location.reload();
};

function renderStorage() {
  const kb = Math.round(JSON.stringify(data).length / 1024);
  $('#storageInfo').textContent = `Tamanho atual dos dados: ${kb} KB (limite aproximado do navegador: 5.000 KB).`;
}

function renderAll() { renderProducts(); renderPayments(); renderStorage(); }
fillConfig();
fillSupabaseForm();
renderAll();
fetchOrders();
setupRealtime();
