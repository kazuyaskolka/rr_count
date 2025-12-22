// ===== app.js =====
document.addEventListener('DOMContentLoaded', function(){
  // ===== libs availability checks (XLSX/JSZip/Chart) are assumed loaded via HTML) =====

  // ===== Data load & normalization =====
  var products = JSON.parse(localStorage.getItem('products') || '[]');
  var orders = JSON.parse(localStorage.getItem('orders') || '[]');
  var quantities = {}; // temporary qty per product id in UI
  var payments = {};   // temporary payment selection per product id
  var categoryFilter = '';
  var viewMode = 'list'; // 'list' or 'tiles'

  // helper: generate order id
  function generateOrderNumber(){
    var d = new Date();
    var y = d.getFullYear().toString().slice(2);
    var m = ('0'+(d.getMonth()+1)).slice(-2);
    var day = ('0'+d.getDate()).slice(-2);
    return 'CHK-'+y+m+day+'-'+Date.now().toString().slice(-5);
  }

  // ----------------- Управление остатками -----------------
  function getAvailableStock(prodId){
    var prod = products.find(function(p){ return p && p.id === prodId; });
    if(!prod) return 0;
    var inCart = cart.reduce(function(acc, c){
      return acc + ((c.productId === prodId) ? Number(c.qty || 0) : 0);
    }, 0);
    var base = Number(prod.stock || 0);
    var avail = base - inCart;
    return avail < 0 ? 0 : avail;
  }

  function tryAddToCart(prodId, qty, payment, name, price){
    qty = Number(qty || 0);
    if(qty <= 0) return { ok:false, message: 'Неверное количество' };
    var avail = getAvailableStock(prodId);
    if(qty > avail) return { ok:false, message: 'Доступно только ' + avail + ' шт.' };

    var existing = cart.find(function(c){ return c.productId === prodId && c.payment === payment; });
    if(existing){
      var willTotal = existing.qty + qty;
      var currentInCart = cart.reduce(function(acc, c){ return acc + ((c.productId === prodId) ? c.qty : 0); }, 0);
      var baseStock = (products.find(function(p){ return p.id === prodId; }) || {}).stock || 0;
      if(willTotal + (currentInCart - existing.qty) > baseStock){
        return { ok:false, message: 'Нельзя добавить — не хватает на складе' };
      }
      existing.qty = existing.qty + qty;
    } else {
      cart.push({ productId: prodId, name: name, price: Number(price||0), qty: qty, payment: payment });
    }
    return { ok:true };
  }

  // normalize products/orders to avoid crashes
  products = Array.isArray(products) ? products : [];
  orders = Array.isArray(orders) ? orders : [];
  orders = orders.map(function(o){
    if(!o || typeof o !== 'object') return { id: String(o) || generateOrderNumber(), created_at: new Date().toISOString(), positions: [] };
    return {
      id: o.id || generateOrderNumber(),
      created_at: o.created_at || new Date().toISOString(),
      positions: Array.isArray(o.positions) ? o.positions : [],
      total: typeof o.total === 'number' ? o.total : (Array.isArray(o.positions) ? o.positions.reduce(function(acc,p){ return acc + (Number(p.price)||0)*(Number(p.qty)||0); },0) : 0),
      positions_count: typeof o.positions_count === 'number' ? o.positions_count : (Array.isArray(o.positions) ? o.positions.reduce(function(acc,p){ return acc + (Number(p.qty)||0); },0) : 0),
      payment: o.payment || (o.positions && o.positions[0] && o.positions[0].payment) || 'нал',
      comment: o.comment || ''
    };
  });

  // ===== state =====
  var cart = []; // {productId,name,price,qty,payment}

  // ===== DOM refs =====
  var productsDiv = document.getElementById('products');
  var ordersDiv = document.getElementById('orders');
  var filterSelect = document.getElementById('categoryFilter');
  var excelInput = document.getElementById('excelInput');
  var zipInput = document.getElementById('zipInput');
  var excelInputProfile = document.getElementById('excelInputProfile');
  var zipInputProfile = document.getElementById('zipInputProfile');
  var chartSumEl = document.getElementById('chartCategorySum');
  var chartCountEl = document.getElementById('chartCategoryCount');
  var cartItemsDiv = document.getElementById('cartItems');
  var cartPaymentSelect = document.getElementById('cartPayment');
  var orderCommentInput = document.getElementById('orderComment');
  var cartSummaryMini = document.getElementById('cartSummaryMini');

  // ===== storage helpers =====
  function saveProducts(){ localStorage.setItem('products', JSON.stringify(products)); }
  function saveOrders(){ localStorage.setItem('orders', JSON.stringify(orders)); renderOrders(); renderStats(); }

  // ===== update category filter =====
  function updateCategoryFilter(){
    var current = filterSelect.value || '';
    filterSelect.innerHTML = '<option value="">Все</option>';
    var cats = [];
    products.forEach(function(p){
      if(p && p.categories && cats.indexOf(p.categories) === -1) cats.push(p.categories);
    });
    cats.forEach(function(c){
      var opt = document.createElement('option'); opt.value = c; opt.textContent = c; filterSelect.appendChild(opt);
    });
    filterSelect.value = current;
  }

  // ===== render products =====
  function renderProducts(){
    productsDiv.innerHTML = '';

    if(viewMode === 'tiles') productsDiv.classList.add('tiles'); 
    else productsDiv.classList.remove('tiles');

    var filtered = products.filter(function(p){ return p && p.active !== false && (categoryFilter === '' || (p.categories || '') === categoryFilter); });

    if(filtered.length === 0){
      productsDiv.innerHTML = '<div class="panel">Нет товаров</div>';
      return;
    }

    filtered.forEach(function(p){
      var card = document.createElement('div');
      card.className = 'product';

      var img = document.createElement('img');
      img.alt = p.name || '';
      if (p.imageUrl && p.imageUrl.trim() !== '') img.src = normalizeDriveUrl(p.imageUrl);
      else img.style.display = 'none';

      var meta = document.createElement('div');
      meta.className = 'meta';

      var nameEl = document.createElement('div'); nameEl.className = 'name'; nameEl.textContent = p.name || 'Без имени';
      var priceEl = document.createElement('div'); priceEl.className = 'price'; priceEl.textContent = (p.price || 0) + ' ₽';
      var catEl = document.createElement('div'); catEl.className = 'muted'; catEl.textContent = 'Категория: ' + (p.categories || '—');
      var avail = getAvailableStock(p.id);
      var stockEl = document.createElement('div'); stockEl.className = 'muted'; stockEl.textContent = 'Остаток: ' + avail + (typeof p.stock === 'number' ? (' (в базе: ' + p.stock + ')') : '');

      meta.appendChild(nameEl);
      meta.appendChild(priceEl);
      meta.appendChild(catEl);
      meta.appendChild(stockEl);

      // controls
      var controls = document.createElement('div'); controls.style.marginTop = '8px';
      var qtyInput = document.createElement('input'); qtyInput.type='number'; qtyInput.min=1; qtyInput.value = quantities[p.id] || 1; qtyInput.style.width='70px';
      qtyInput.addEventListener('input', function(){ quantities[p.id] = Number(this.value) || 1; });

      var paySelect = document.createElement('select');
      var o1 = document.createElement('option'); o1.value='нал'; o1.text='Нал';
      var o2 = document.createElement('option'); o2.value='безнал'; o2.text='Безнал';
      paySelect.appendChild(o1); paySelect.appendChild(o2);
      paySelect.value = payments[p.id] || 'нал';
      paySelect.addEventListener('change', function(){ payments[p.id] = this.value; });

      var addBtn = document.createElement('button'); addBtn.className='button'; addBtn.textContent='Добавить в корзину';
      addBtn.addEventListener('click', function(){
        var qty = Number(quantities[p.id] || qtyInput.value || 1);
        var payment = payments[p.id] || paySelect.value || 'нал';
        var res = tryAddToCart(p.id, qty, payment, p.name, p.price);
        if(!res.ok){ alert(res.message || 'Не удалось добавить'); return; }
        renderCart();
        renderProducts();
      });

      controls.appendChild(document.createTextNode('Кол-во: ')); 
      controls.appendChild(qtyInput);
      controls.appendChild(document.createTextNode(' Оплата: ')); 
      controls.appendChild(paySelect);
      controls.appendChild(document.createElement('br'));
      controls.appendChild(addBtn);

      meta.appendChild(controls);

      // === режимы отображения ===
      if(viewMode === 'tiles'){
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.alignItems = 'flex-start';
        card.appendChild(img);
        card.appendChild(meta);
      } else {
        card.style.display = 'flex';
        card.style.flexDirection = 'row';
        card.style.alignItems = 'center';
        img.style.width = '100px';
        img.style.height = '100px';
        img.style.marginRight = '10px';
        card.appendChild(img);
        card.appendChild(meta);
      }

      productsDiv.appendChild(card);
    });
  } // <-- renderProducts закрыта

  // ===== renderOrders =====
  function renderOrders(){
    ordersDiv.innerHTML = '';
    if(!Array.isArray(orders) || orders.length === 0){ ordersDiv.innerHTML = '<div class="panel">Нет заказов</div>'; return; }
    orders.forEach(function(o){
      if(!o || typeof o !== 'object') return;
      var wrap = document.createElement('div'); wrap.className='panel';
      var header = document.createElement('div'); header.innerHTML = '<strong>Чек: ' + (o.id||'') + '</strong> — ' + (o.created_at ? (new Date(o.created_at)).toLocaleString() : '');
      wrap.appendChild(header);
      var list = document.createElement('div');
      (o.positions||[]).forEach(function(pos){
        if(!pos) return;
        var pdiv = document.createElement('div');
        var name = pos.name || ('Товар ' + (pos.productId||''));
        var qty = Number(pos.qty||0);
        var price = Number(pos.price||0);
        var payment = pos.payment || o.payment || 'нал';
        pdiv.textContent = name + ' x' + qty + ' — ' + (price * qty) + ' (' + payment + ')';
        list.appendChild(pdiv);
      });
      wrap.appendChild(list);
      var footer = document.createElement('div'); footer.style.marginTop='6px';
      var total = (typeof o.total === 'number') ? o.total : (o.positions||[]).reduce(function(acc,p){ return acc + (Number(p.price)||0)*(Number(p.qty)||0); },0);
      var pcnt = (typeof o.positions_count === 'number') ? o.positions_count : (o.positions||[]).reduce(function(acc,p){ return acc + (Number(p.qty)||0); },0);
      footer.innerHTML = 'Позиции: ' + pcnt + ' — Сумма: ' + total.toFixed(2) + ' — Оплата: ' + (o.payment||'—');
      if(o.comment) footer.innerHTML += ' — Комментарий: ' + o.comment;
      wrap.appendChild(footer);
      ordersDiv.appendChild(wrap);
    });
  }

  // ===== renderCart =====
  function renderCart(){
    cartItemsDiv.innerHTML = '';
    if(cart.length === 0){ cartItemsDiv.innerHTML = '<div class="muted">Корзина пуста</div>'; cartSummaryMini.textContent = '0 / 0'; return; }
    var total = 0; var qtySum = 0;
    cart.forEach(function(c, idx){
      var row = document.createElement('div'); row.className='cart-row';
      var left = document.createElement('div'); left.textContent = c.name + ' (' + (c.price||0) + '₽)';
      var right = document.createElement('div'); right.style.display='flex'; right.style.alignItems='center';

      var qtySpan = document.createElement('span'); qtySpan.textContent = ' x' + c.qty; qtySpan.style.marginRight='8px';
      var controls = document.createElement('div'); controls.className='qty-controls';

      var minus = document.createElement('button'); minus.textContent='−';
      minus.addEventListener('click', function(){
        if(c.qty > 1){ c.qty--; renderCart(); renderProducts(); } 
        else if(confirm('Удалить позицию из корзины?')){ cart.splice(idx,1); renderCart(); renderProducts(); }
      });

      var plus = document.createElement('button'); plus.textContent='+'; 
      plus.addEventListener('click', function(){ 
        var avail = getAvailableStock(c.productId); 
        if(avail <= 0){ alert('Больше нет на складе'); return; }
        c.qty++; renderCart(); renderProducts();
      });

      var del = document.createElement('button'); del.textContent='✕'; del.style.marginLeft='8px';
      del.addEventListener('click', function(){ if(confirm('Удалить позицию из корзины?')){ cart.splice(idx,1); renderCart(); renderProducts(); } });

      controls.appendChild(minus); controls.appendChild(plus); controls.appendChild(del);
      right.appendChild(qtySpan); right.appendChild(controls);
      row.appendChild(left); row.appendChild(right);
      cartItemsDiv.appendChild(row);
      total += (Number(c.price)||0) * (Number(c.qty)||0);
      qtySum += Number(c.qty)||0;
    });
    var sumDiv = document.createElement('div'); sumDiv.style.marginTop='8px'; sumDiv.innerHTML = '<strong>Позиции: '+cart.length+', Кол-во: '+qtySum+', Сумма: '+total.toFixed(2)+' ₽</strong>';
    cartItemsDiv.appendChild(sumDiv);
    cartSummaryMini.textContent = cart.length + ' / ' + qtySum;
  }

  // ===== finalizeOrder =====
  function finalizeOrder(){
    if(cart.length === 0){ alert('Корзина пуста'); return; }

    for(var i=0;i<cart.length;i++){
      var c = cart[i];
      var prod = products.find(function(p){ return p.id === c.productId; });
      var baseStock = Number(prod && prod.stock || 0);
      var inCartTotal = cart.reduce(function(acc,it){ return acc + ((it.productId === c.productId)? it.qty:0); },0);
      if(c.qty > (baseStock - (inCartTotal - c.qty))){ 
        alert('Недостаточно на складе для товара: ' + (c.name||'') + '. Доступно: ' + (baseStock - (inCartTotal - c.qty))); 
        return;
      }
    }

    var positions = cart.map(function(c){ return { productId: c.productId, name: c.name, qty: c.qty, price: c.price, payment: c.payment }; });
    var paymentOverall = (cartPaymentSelect && cartPaymentSelect.value) ? cartPaymentSelect.value : (positions[0] && positions[0].payment) || 'нал';
    var orderObj = {
      id: generateOrderNumber(),
      created_at: new Date().toISOString(),
      positions: positions,
      total: positions.reduce(function(acc,p){ return acc + (Number(p.price)||0)*(Number(p.qty)||0); },0),
      positions_count: positions.reduce(function(acc,p){ return acc + (Number(p.qty)||0); },0),
      payment: paymentOverall,
      comment: orderCommentInput ? (orderCommentInput.value || '') : ''
    };

    orderObj.positions.forEach(function(pos){
      var prod = products.find(function(pp){ return pp.id === pos.productId; });
      if(prod && typeof prod.stock === 'number'){ prod.stock = Math.max(0, Number(prod.stock) - Number(pos.qty || 0)); }
    });

    orders.push(orderObj);
    saveOrders();
    saveProducts();

    cart.length = 0; quantities = {}; payments = {};
    if(orderCommentInput) orderCommentInput.value = '';
    renderCart(); renderProducts();

    alert('Заказ записан: ' + orderObj.id);
  }

  // ===== init event bindings =====
  filterSelect.addEventListener('change', function(){ categoryFilter = this.value; renderProducts(); });
  document.getElementById('viewList').addEventListener('click', function(){ viewMode='list'; renderProducts(); });
  document.getElementById('viewTiles').addEventListener('click', function(){ viewMode='tiles'; renderProducts(); });

  excelInput.addEventListener('change', function(e){ handleExcelFile(e.target.files[0]); });
  zipInput.addEventListener('change', function(e){ handleZipFile(e.target.files[0]); });
  if(excelInputProfile) excelInputProfile.addEventListener('change', function(e){ handleExcelFile(e.target.files[0]); });
  if(zipInputProfile) zipInputProfile.addEventListener('change', function(e){ handleZipFile(e.target.files[0]); });

  document.getElementById('downloadProductsBtn').addEventListener('click', downloadProductsExcel);
  document.getElementById('downloadOrdersBtn').addEventListener('click', downloadOrdersExcel);

  document.getElementById('openProfileBtn').addEventListener('click
