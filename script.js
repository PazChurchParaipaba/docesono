/* =========================================================
   Doce Sono · Boutique de Pijamas
   Os dados (produtos, preços, pagamentos, fotos) são
   cadastrados no painel: admin.html
   ========================================================= */

/* Carrega dados: 1) rascunho salvo no painel neste navegador  2) arquivo dados.js publicado */
const DATA = (() => {
  let local = null;
  try { local = JSON.parse(localStorage.getItem('ds_admin_data')); } catch {}
  const d = local || window.LOJA_DADOS || {};
  return {
    config: Object.assign({ storeName: 'Doce Sono Boutique de Pijamas', whatsapp: '', storeAddress: '', deliveryEnabled: true, pickupEnabled: true, deliveryFee: 0, freeShippingFrom: 0, maxInstallments: 1, announcement: '' }, d.config || {}),
    payments: d.payments || [],
    products: (d.products || []).filter(p => p.active !== false),
  };
})();
const CONFIG = DATA.config;
const PALETTE = [['#fbe9e4', '#f2c9c4'], ['#fde8ec', '#e7a9a6'], ['#f6dcd5', '#d08a8f'], ['#fff1ec', '#f2c9c4']];
const PRODUCTS = DATA.products.map((p, i) => ({
  ...p,
  price: +p.price || 0,
  old: +p.old || 0,
  sizes: (p.sizes && p.sizes.length) ? p.sizes : ['Único'],
  images: p.images || [],
  img: (p.images || [])[0],
  emoji: '🌙',
  bg: PALETTE[i % PALETTE.length],
  desc: p.desc || '',
}));

/* ---------------- Utils ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const brl = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
const bgOf = p => `linear-gradient(135deg, ${p.bg[0]}, ${p.bg[1]})`;
const instText = v => {
  const n = parseInt(CONFIG.maxInstallments) || 1;
  return n > 1 ? `<span class="card__inst">ou ${n}x de ${brl(v / n)} sem juros</span>` : '';
};
const media = p => p.img ? `<img src="${p.img}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover">` : `<span class="emoji">${p.emoji}</span>`;

/* ---------------- Supabase Client ---------------- */
const getSupabase = () => {
  if (typeof supabase === 'undefined') return null;
  const cfg = store.get('ds_supabase_config', window.SUPABASE_CONFIG || {});
  if (!cfg.url || !cfg.anonKey) return null;
  try {
    return supabase.createClient(cfg.url, cfg.anonKey);
  } catch (err) {
    console.error('Erro ao inicializar Supabase:', err);
    return null;
  }
};
const sbClient = getSupabase();

/* ---------------- Estado ---------------- */
let cart = store.get('ds_cart', []);
let orders = store.get('ds_orders', []);
let filter = { cat: 'Todos', q: '', sort: 'featured' };
let currentStep = 1;

/* ---------------- Toast ---------------- */
function toast(msg, icon = '💗') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2400);
}

/* ---------------- Catálogo ---------------- */
function renderChips() {
  const cats = ['Todos', ...new Set(PRODUCTS.map(p => p.cat))];
  $('#categoryChips').innerHTML = cats.map(c =>
    `<button class="chip ${c === filter.cat ? 'active' : ''}" data-cat="${c}" role="tab">${c}</button>`).join('');
}

function renderProducts() {
  const q = filter.q.trim().toLowerCase();
  let list = PRODUCTS.filter(p =>
    (filter.cat === 'Todos' || p.cat === filter.cat) &&
    (!q || (p.name + p.cat + p.desc).toLowerCase().includes(q)));

  if (filter.sort === 'price-asc') list.sort((a, b) => a.price - b.price);
  if (filter.sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  if (filter.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));

  $('#emptyState').hidden = list.length > 0;
  $('#emptyText').textContent = PRODUCTS.length ? 'Nenhum produto encontrado.' : 'Em breve nossos produtos estarão aqui. 🌙';
  $('#productGrid').innerHTML = list.map((p, i) => `
    <article class="card" style="animation-delay:${i * 40}ms">
      <div class="card__media" style="background:${bgOf(p)}" data-open="${p.id}">
        ${p.tag ? `<span class="card__tag ${p.old ? 'card__tag--sale' : ''}">${p.tag}</span>` : ''}
        ${media(p)}
        <span class="card__quick">Ver detalhes</span>
      </div>
      <div class="card__body">
        <span class="card__cat">${p.cat}</span>
        <h3 class="card__title" data-open="${p.id}">${p.name}</h3>
        <div class="card__price"><strong>${brl(p.price)}</strong>${p.old ? `<s>${brl(p.old)}</s>` : ''}</div>
        ${instText(p.price)}
        <button class="card__add" data-open="${p.id}">
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Adicionar
        </button>
      </div>
    </article>`).join('');
}

/* ---------------- Modal de produto ---------------- */
function openProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  let size = p.sizes.length === 1 ? p.sizes[0] : null;
  let qty = 1;

  $('#productModalContent').innerHTML = `
    <div class="pmodal">
      <div class="pmodal__media" style="background:${bgOf(p)}">
        <div class="gallery__main" id="pmMain">${media(p)}</div>
        ${p.images.length > 1 ? `<div class="gallery__thumbs">${p.images.map((src, i) => `<button class="thumb ${i ? '' : 'active'}" data-img="${i}"><img src="${src}" alt=""></button>`).join('')}</div>` : ''}
      </div>
      <div class="pmodal__info">
        <span class="card__cat">${p.cat}</span>
        <h3>${p.name}</h3>
        <div class="pmodal__price"><strong>${brl(p.price)}</strong>${p.old ? `<s>${brl(p.old)}</s>` : ''}</div>
        <p class="pmodal__desc">${p.desc}</p>
        <div>
          <span class="label-sm">Tamanho</span>
          <div class="sizes" id="pmSizes">
            ${p.sizes.map(s => `<button class="size ${s === size ? 'active' : ''}" data-size="${s}">${s}</button>`).join('')}
          </div>
        </div>
        <div class="pmodal__actions">
          <div class="qty"><button data-q="-1" aria-label="Diminuir">−</button><span id="pmQty">1</span><button data-q="1" aria-label="Aumentar">+</button></div>
          <button class="btn btn--primary" id="pmAdd">Adicionar · ${brl(p.price)}</button>
        </div>
      </div>
    </div>`;

  const box = $('#productModalContent');
  box.onclick = e => {
    const th = e.target.closest('[data-img]');
    if (th) {
      $('#pmMain').innerHTML = `<img src="${p.images[+th.dataset.img]}" alt="${p.name}">`;
      $$('.thumb', box).forEach(b => b.classList.toggle('active', b === th));
    }
    const s = e.target.closest('[data-size]');
    if (s) {
      size = s.dataset.size;
      $$('.size', box).forEach(b => b.classList.toggle('active', b === s));
    }
    const q = e.target.closest('[data-q]');
    if (q) {
      qty = Math.max(1, Math.min(20, qty + +q.dataset.q));
      $('#pmQty').textContent = qty;
      $('#pmAdd').textContent = `Adicionar · ${brl(p.price * qty)}`;
    }
    if (e.target.closest('#pmAdd')) {
      if (!size) {
        const el = $('#pmSizes');
        el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
        toast('Escolha um tamanho 😊', '📏');
        return;
      }
      addToCart(p.id, size, qty);
      closeAll();
      setTimeout(() => openPanel('#cartDrawer'), 250);
    }
  };
  openPanel('#productModal');
}

/* ---------------- Carrinho ---------------- */
const saveCart = () => store.set('ds_cart', cart);
const subtotal = () => cart.reduce((s, i) => s + i.price * i.qty, 0);
const itemsCount = () => cart.reduce((s, i) => s + i.qty, 0);

function addToCart(id, size, qty = 1) {
  const p = PRODUCTS.find(x => x.id === id);
  const key = `${id}-${size}`;
  const ex = cart.find(i => i.key === key);
  if (ex) ex.qty += qty;
  else cart.push({ key, id, name: p.name, price: p.price, size, qty, emoji: p.emoji, img: p.img, bg: p.bg });
  saveCart(); renderCart();
  toast(`${p.name} adicionado à sacola`, '🛍️');
  $$('.badge').forEach(b => { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); });
}

function updateQty(key, d) {
  const it = cart.find(i => i.key === key);
  if (!it) return;
  it.qty += d;
  if (it.qty <= 0) cart = cart.filter(i => i.key !== key);
  saveCart(); renderCart();
}

function renderCart() {
  const count = itemsCount(), sub = subtotal();
  ['#cartCount', '#fabCount'].forEach(s => { $(s).textContent = count; $(s).classList.toggle('show', count > 0); });
  $('#fabTotal').textContent = brl(sub);
  $('#fabCart').classList.toggle('show', count > 0);
  $('#cartSubtotal').textContent = brl(sub);
  $('#cartFoot').hidden = count === 0;

  if (!count) {
    $('#cartItems').innerHTML = `
      <div class="cart-empty">
        <div class="big">☁️</div>
        <h4>Sua sacola está vazia</h4>
        <p>Que tal escolher um pijama fofinho?</p>
        <button class="btn btn--primary" data-close data-goto="produtos">Ver produtos</button>
      </div>`;
    return;
  }

  const fs = +CONFIG.freeShippingFrom;
  const missing = fs - sub;
  const pct = fs ? Math.min(100, (sub / fs) * 100) : 0;
  $('#shippingProgress').hidden = !(fs > 0 && CONFIG.deliveryEnabled);
  $('#shippingProgress').innerHTML = missing > 0
    ? `Faltam <b>${brl(missing)}</b> para ganhar <b>frete grátis</b> 🚚<div class="bar"><span style="width:${pct}%"></span></div>`
    : `🎉 Você ganhou <b>frete grátis</b>!<div class="bar"><span style="width:100%"></span></div>`;

  $('#cartItems').innerHTML = cart.map(i => `
    <div class="citem">
      <div class="citem__img" style="background:linear-gradient(135deg,${i.bg[0]},${i.bg[1]})">${i.img ? `<img src="${i.img}" alt="">` : i.emoji}</div>
      <div>
        <div class="citem__name">${i.name}</div>
        <div class="citem__meta">Tamanho: ${i.size} · ${brl(i.price)} un.</div>
        <div class="citem__price">${brl(i.price * i.qty)}</div>
      </div>
      <div class="citem__side">
        <div class="qty">
          <button data-dec="${i.key}" aria-label="Diminuir">−</button>
          <span>${i.qty}</span>
          <button data-inc="${i.key}" aria-label="Aumentar">+</button>
        </div>
        <button class="remove" data-rm="${i.key}">remover</button>
      </div>
    </div>`).join('');
}

/* ---------------- Painéis ---------------- */
function openPanel(sel) {
  $(sel).classList.add(sel.includes('Drawer') ? 'open' : 'open');
  $(sel).setAttribute('aria-hidden', 'false');
  $('#overlay').classList.add('show');
  document.body.classList.add('lock');
}
function closeAll() {
  $$('.drawer.open, .modal.open').forEach(el => { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); });
  $('#overlay').classList.remove('show');
  document.body.classList.remove('lock');
}

/* ---------------- Checkout ---------------- */
const form = $('#checkoutForm');
const F = form.elements;
const isDelivery = () => F.delivery.value === 'entrega';
const hasFreeShip = () => +CONFIG.freeShippingFrom > 0 && subtotal() >= +CONFIG.freeShippingFrom;
const deliveryFee = () => (!isDelivery() || hasFreeShip()) ? 0 : (+CONFIG.deliveryFee || 0);
const selectedPayment = () => DATA.payments.find(p => p.name === F.payment.value);
const isCash = () => /dinheiro/i.test(F.payment.value || '');

function openCheckout() {
  if (!cart.length) return toast('Sua sacola está vazia', '☁️');
  const saved = store.get('ds_customer', {});
  Object.entries(saved).forEach(([k, v]) => { if (F[k] && F[k].type !== 'radio') F[k].value = v; });
  if (saved.delivery) F.delivery.value = saved.delivery;
  if (!CONFIG.deliveryEnabled) F.delivery.value = 'retirada';
  if (!CONFIG.pickupEnabled) F.delivery.value = 'entrega';
  goStep(1);
  updateDeliveryUI();
  closeAll();
  setTimeout(() => openPanel('#checkoutModal'), 200);
}

function goStep(n) {
  currentStep = n;
  $$('.cstep').forEach(f => f.classList.toggle('active', +f.dataset.step === n));
  $$('.stepper__item').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === n);
    s.classList.toggle('done', i + 1 < n);
  });
  $('#prevStep').hidden = n === 1;
  $('#nextStep').hidden = n === 3;
  $('#submitOrder').hidden = n !== 3;
  if (n === 3) renderSummary();
  $('.modal__box--checkout').scrollTop = 0;
}

function setErr(name, msg) {
  const f = F[name].closest('.field');
  f.classList.toggle('invalid', !!msg);
  $('.err', f).textContent = msg || '';
  return !msg;
}

function validateStep(n) {
  let ok = true;
  if (n === 1) {
    ok = setErr('name', F.name.value.trim().length < 3 ? 'Informe seu nome completo' : '') && ok;
    ok = setErr('phone', F.phone.value.replace(/\D/g, '').length < 10 ? 'Informe um WhatsApp válido' : '') && ok;
  }
  if (n === 2 && isDelivery()) {
    ok = setErr('cep', F.cep.value.replace(/\D/g, '').length !== 8 ? 'CEP inválido' : '') && ok;
    ['number', 'street', 'district', 'city'].forEach(k => {
      ok = setErr(k, !F[k].value.trim() ? 'Obrigatório' : '') && ok;
    });
  }
  if (!ok) {
    const first = $('.cstep.active .invalid input');
    first && first.focus();
  }
  return ok;
}

function updateDeliveryUI() {
  const d = isDelivery();
  $('#addressFields').hidden = !d;
  $('#pickupInfo').hidden = d;
  $('#deliveryFeeLabel').textContent = hasFreeShip() ? 'Frete grátis 🎉' : (+CONFIG.deliveryFee ? `Taxa ${brl(+CONFIG.deliveryFee)}` : 'Taxa a combinar');
  $('#changeField').hidden = !isCash();
  const pay = selectedPayment();
  $('#paymentDetails').hidden = !(pay && pay.details);
  $('#paymentDetails').textContent = pay && pay.details ? pay.details : '';
}

function addressText() {
  const f = F;
  return `${f.street.value.trim()}, ${f.number.value.trim()}${f.complement.value.trim() ? ' - ' + f.complement.value.trim() : ''} - ${f.district.value.trim()}, ${f.city.value.trim()} - CEP ${f.cep.value.trim()}`;
}

function renderSummary() {
  const sub = subtotal(), fee = deliveryFee(), total = sub + fee;
  $('#orderSummary').innerHTML = `
    <h4>Resumo do pedido</h4>
    ${cart.map(i => `<div class="line"><span>${i.qty}x ${i.name} (${i.size})</span><span>${brl(i.price * i.qty)}</span></div>`).join('')}
    <div class="line" style="margin-top:.4rem"><span>Subtotal</span><span>${brl(sub)}</span></div>
    <div class="line"><span>${isDelivery() ? 'Entrega' : 'Retirada'}</span><span>${fee ? brl(fee) : 'Grátis'}</span></div>
    <div class="line total"><span>Total</span><span>${brl(total)}</span></div>
    <div class="addr">${isDelivery() ? '📍 ' + addressText() : '🏬 Retirada: ' + CONFIG.storeAddress}</div>`;
}

function buildMessage(order) {
  const L = [];
  L.push(`🌙 *NOVO PEDIDO - ${CONFIG.storeName.toUpperCase()}*`);
  L.push(`Pedido: *#${order.id}*`);
  L.push(`Data: ${new Date(order.date).toLocaleString('pt-BR')}`);
  L.push('');
  L.push('👤 *Cliente*');
  L.push(`Nome: ${order.customer.name}`);
  L.push(`WhatsApp: ${order.customer.phone}`);
  L.push('');
  L.push('🛍️ *Itens do pedido*');
  order.items.forEach(i => L.push(`• ${i.qty}x ${i.name} (Tam: ${i.size}) — ${brl(i.price * i.qty)}`));
  L.push('');
  L.push(`Subtotal: ${brl(order.subtotal)}`);
  L.push(`${order.delivery === 'entrega' ? 'Taxa de entrega' : 'Retirada'}: ${order.fee ? brl(order.fee) : 'Grátis'}`);
  L.push(`💰 *TOTAL: ${brl(order.total)}*`);
  L.push('');
  if (order.delivery === 'entrega') {
    L.push('🛵 *Entrega no endereço:*');
    L.push(order.address);
  } else {
    L.push('🏬 *Retirada na loja*');
    L.push(CONFIG.storeAddress);
  }
  L.push('');
  L.push(`💳 *Pagamento:* ${order.payment}${order.change ? ` (troco para ${order.change})` : ''}`);
  if (order.paymentDetails) L.push(order.paymentDetails);
  if (order.delivery === 'entrega' && !order.fee && !order.freeShip) L.push('_Taxa de entrega a combinar_');
  if (order.notes) { L.push(''); L.push(`📝 *Observações:* ${order.notes}`); }
  L.push('');
  L.push('Obrigada pela preferência! 💗');
  return L.join('\n');
}

function sendWhats(order) {
  const url = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(buildMessage(order))}`;
  window.open(url, '_blank');
}

async function submitOrder(e) {
  e.preventDefault();
  if (!validateStep(1)) return goStep(1);
  if (!validateStep(2)) return goStep(2);

  const sub = subtotal(), fee = deliveryFee();
  if (!F.payment.value) return toast('Escolha a forma de pagamento', '💳');
  const change = isCash() && F.change.value.trim()
    ? brl(parseFloat(F.change.value.replace(',', '.')) || 0) : '';

  const orderId = Date.now().toString().slice(-6);
  const order = {
    id: orderId,
    order_code: orderId,
    date: new Date().toISOString(),
    customer: { name: F.name.value.trim(), phone: F.phone.value.trim() },
    customer_name: F.name.value.trim(),
    customer_phone: F.phone.value.trim(),
    delivery: F.delivery.value,
    delivery_type: F.delivery.value,
    address: isDelivery() ? addressText() : '',
    payment: F.payment.value,
    payment_method: F.payment.value,
    paymentDetails: (selectedPayment() || {}).details || '',
    payment_details: (selectedPayment() || {}).details || '',
    freeShip: isDelivery() && hasFreeShip(),
    change,
    change_for: change,
    notes: F.notes.value.trim(),
    subtotal: sub,
    fee,
    delivery_fee: fee,
    total: sub + fee,
    items: cart.map(({ name, size, qty, price }) => ({ name, size, qty, price })),
    status: 'pendente'
  };

  // Salva dados do cliente no navegador para próximas compras
  const keep = {};
  ['name', 'phone', 'cep', 'number', 'street', 'district', 'city', 'complement'].forEach(k => keep[k] = F[k].value);
  keep.delivery = F.delivery.value;
  store.set('ds_customer', keep);

  // Desativa botão para evitar clique duplo
  const submitBtn = $('#submitOrder');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Enviando pedido...'; }

  // 1. Salva no Supabase (se configurado)
  if (sbClient) {
    try {
      const { error } = await sbClient.from('docesono_orders').insert([{
        order_code: order.order_code,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        delivery_type: order.delivery_type,
        address: order.address,
        payment_method: order.payment_method,
        payment_details: order.payment_details,
        change_for: order.change_for,
        notes: order.notes,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        total: order.total,
        items: order.items,
        status: 'pendente'
      }]);
      if (error) console.error('Aviso ao salvar no Supabase:', error);
    } catch (err) {
      console.error('Falha de rede ao conectar com Supabase:', err);
    }
  }

  // 2. Salva localmente para o painel admin (e para o cliente visualizar)
  const allSystemOrders = store.get('ds_system_orders', []);
  allSystemOrders.unshift(order);
  store.set('ds_system_orders', allSystemOrders);

  orders.unshift(order);
  store.set('ds_orders', orders);

  cart = []; saveCart(); renderCart(); renderOrders();
  F.notes.value = ''; F.change.value = '';
  closeAll();

  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg> Confirmar e Concluir Pedido`;
  }

  // Modal / Toast de Sucesso
  toast(`Pedido #${order.id} confirmado com sucesso! Entraremos em contato via WhatsApp.`, '🎉');
  setTimeout(() => {
    alert(`🎉 Parabéns, ${order.customer_name}!\n\nSeu pedido #${order.id} foi registrado com sucesso em nosso sistema!\n\nNossa equipe já recebeu suas informações e entrará em contato com você pelo WhatsApp (${order.customer_phone}) para confirmar os detalhes.\n\nMuito obrigado por comprar na Doce Sono! 🌙`);
  }, 400);
}

/* ---------------- Pedidos ---------------- */
function renderOrders() {
  if (!orders.length) {
    $('#ordersList').innerHTML = `<div class="cart-empty"><div class="big">📋</div><h4>Nenhum pedido ainda</h4><p>Seus pedidos aparecerão aqui.</p></div>`;
    return;
  }
  $('#ordersList').innerHTML = orders.map(o => `
    <div class="order">
      <div class="order__top">
        <span class="order__id">#${o.id}</span>
        <span class="order__date">${new Date(o.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </div>
      <div class="order__items">${o.items.map(i => `${i.qty}x ${i.name} (${i.size})`).join('<br>')}</div>
      <div class="order__bottom">
        <span class="pill">${o.delivery === 'entrega' ? '🛵 Entrega' : '🏬 Retirada'} · ${o.payment}</span>
        <strong>${brl(o.total)}</strong>
      </div>
      <div class="order__actions">
        <button data-resend="${o.id}">Reenviar no WhatsApp</button>
        <button data-repeat="${o.id}">Comprar de novo</button>
      </div>
    </div>`).join('');
}

/* ---------------- Máscaras & CEP ---------------- */
function maskPhone(v) {
  v = v.replace(/\D/g, '').slice(0, 11);
  if (v.length > 10) return v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  if (v.length > 6) return v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  if (v.length > 2) return v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
  return v;
}
async function lookupCep(cep) {
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) return setErr('cep', 'CEP não encontrado');
    F.street.value = d.logradouro || F.street.value;
    F.district.value = d.bairro || F.district.value;
    F.city.value = d.localidade ? `${d.localidade} - ${d.uf}` : F.city.value;
    setErr('cep', '');
    F.number.focus();
  } catch { /* offline: preenchimento manual */ }
}

/* ---------------- Eventos ---------------- */
function bind() {
  $('#categoryChips').addEventListener('click', e => {
    const c = e.target.closest('[data-cat]'); if (!c) return;
    filter.cat = c.dataset.cat; renderChips(); renderProducts();
  });
  let t;
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => {
      filter.q = e.target.value; renderProducts();
      if (filter.q) document.getElementById('produtos').scrollIntoView({ behavior: 'smooth' });
    }, 250);
  });
  $('#sortSelect').addEventListener('change', e => { filter.sort = e.target.value; renderProducts(); });
  $('#productGrid').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) openProduct(+o.dataset.open);
  });

  $('#cartBtn').onclick = $('#fabCart').onclick = () => openPanel('#cartDrawer');
  $('#ordersBtn').onclick = () => { renderOrders(); openPanel('#ordersDrawer'); };
  $('#checkoutBtn').onclick = openCheckout;
  $('#overlay').onclick = closeAll;

  document.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) {
      closeAll();
      const g = e.target.closest('[data-goto]');
      if (g) document.getElementById(g.dataset.goto).scrollIntoView({ behavior: 'smooth' });
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });

  $('#cartItems').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.inc) updateQty(b.dataset.inc, 1);
    if (b.dataset.dec) updateQty(b.dataset.dec, -1);
    if (b.dataset.rm) { cart = cart.filter(i => i.key !== b.dataset.rm); saveCart(); renderCart(); toast('Item removido', '🗑️'); }
  });

  $('#ordersList').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const o = orders.find(x => x.id === (b.dataset.resend || b.dataset.repeat));
    if (!o) return;
    if (b.dataset.resend) sendWhats(o);
    if (b.dataset.repeat) {
      o.items.forEach(i => {
        const p = PRODUCTS.find(x => x.name === i.name);
        if (p) addToCart(p.id, i.size, i.qty);
      });
      closeAll(); setTimeout(() => openPanel('#cartDrawer'), 250);
    }
  });

  // checkout
  $('#nextStep').onclick = () => { if (validateStep(currentStep)) goStep(currentStep + 1); };
  $('#prevStep').onclick = () => goStep(currentStep - 1);
  form.addEventListener('submit', submitOrder);
  form.addEventListener('change', e => {
    if (e.target.name === 'delivery' || e.target.name === 'payment') updateDeliveryUI();
  });
  form.addEventListener('input', e => {
    const f = e.target.closest('.field');
    if (f && f.classList.contains('invalid')) { f.classList.remove('invalid'); $('.err', f).textContent = ''; }
  });
  form.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && currentStep < 3) { e.preventDefault(); $('#nextStep').click(); }
  });
  F.phone.addEventListener('input', e => e.target.value = maskPhone(e.target.value));
  F.cep.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 8);
    e.target.value = v.length > 5 ? v.replace(/(\d{5})(\d+)/, '$1-$2') : v;
    if (v.length === 8) lookupCep(v);
  });

  window.addEventListener('scroll', () => $('#header').classList.toggle('scrolled', scrollY > 10), { passive: true });
}

/* ---------------- Init ---------------- */
function applyConfig() {
  const tb = $('#topbar');
  if (CONFIG.announcement) { tb.textContent = CONFIG.announcement; tb.hidden = false; }
  $('#optDelivery').hidden = !CONFIG.deliveryEnabled;
  $('#optPickup').hidden = !CONFIG.pickupEnabled;
  $('#deliveryOptions').style.gridTemplateColumns = (CONFIG.deliveryEnabled && CONFIG.pickupEnabled) ? '' : '1fr';
  $('#paymentOptions').innerHTML = DATA.payments.length
    ? DATA.payments.map((p, i) => `
      <label class="option"><input type="radio" name="payment" value="${p.name.replace(/"/g, '&quot;')}" ${i ? '' : 'checked'} />
        <div class="option__card"><span class="option__ico">${p.icon || '💳'}</span><strong>${p.name}</strong>${p.short ? `<small>${p.short}</small>` : ''}</div>
      </label>`).join('')
    : '<p class="pay-details">Forma de pagamento a combinar pelo WhatsApp.</p>';
  if (!DATA.payments.length) $('#paymentOptions').insertAdjacentHTML('beforeend', '<input type="radio" name="payment" value="A combinar" checked hidden>');
}
applyConfig();
$('#storeAddress').textContent = CONFIG.storeAddress || 'Combinaremos o local pelo WhatsApp.';
$('#year').textContent = new Date().getFullYear();
renderChips();
renderProducts();
renderCart();
renderOrders();
bind();
