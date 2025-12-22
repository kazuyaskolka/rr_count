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
/**
 * Возвращает доступный остаток товара с учётом текущей корзины
 * @param {number|string} prodId
 * @returns {number}
 */
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


/**
 * Пытается добавить qty штук товара в корзину, соблюдая остаток.
 * Возвращает {ok: boolean, message?: string}
 */
function tryAddToCart(prodId, qty, payment, name, price){
  qty = Number(qty || 0);
  if(qty <= 0) return { ok:false, message: 'Неверное количество' };
  var avail = getAvailableStock(prodId);
  if(qty > avail) return { ok:false, message: 'Доступно только ' + avail + ' шт.' };


  var existing = cart.find(function(c){ return c.productId === prodId && c.payment === payment; });
  if(existing){
    // проверим, можно ли увеличить
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


  // переключаем класс для контейнера
  if(viewMode === 'tiles') productsDiv.classList.add('tiles'); else productsDiv.classList.remove('tiles');


  var filtered = products.filter(function(p){ return p && p.active !== false && (categoryFilter === '' || (p.categories || '') === categoryFilter); });


  if(filtered.length === 0){
    productsDiv.innerHTML = '<div class="panel">Нет товаров</div>';
    return;
  }


var img = document.createElement('img');
img.alt = p.name || '';

if (p.imageUrl && p.imageUrl.trim() !== '') {
  img.src = normalizeDriveUrl(p.imageUrl);
} else {
  img.style.display = 'none';
}



    var meta = document.createElement('div');
    meta.className = 'meta';


    var name = document.createElement('div'); name.className = 'name'; name.textContent = p.name || 'Без имени';
    var price = document.createElement('div'); price.className = 'price'; price.textContent = (p.price || 0) + ' ₽';
    var cat = document.createElement('div'); cat.className = 'muted'; cat.textContent = 'Категория: ' + (p.categories || '—');


    // остаток (с учётом текущей корзины)
    var avail = getAvailableStock(p.id);
    var stockEl = document.createElement('div'); stockEl.className = 'muted'; stockEl.textContent = 'Остаток: ' + avail + (typeof p.stock === 'number' ? (' (в базе: ' + p.stock + ')') : '');


    // qty и оплата
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
      if(!res.ok){
        alert(res.message || 'Не удалось добавить');
        return;
      }
      renderCart();
      renderProducts(); // обновим остатки на карточках
    });


    controls.appendChild(document.createTextNode('Кол-во: ')); controls.appendChild(qtyInput);
    controls.appendChild(document.createTextNode(' Оплата: ')); controls.appendChild(paySelect);
    controls.appendChild(document.createElement('br'));
    controls.appendChild(addBtn);


    meta.appendChild(name); meta.appendChild(price); meta.appendChild(cat); meta.appendChild(stockEl); meta.appendChild(controls);


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
}

  
  
  
  
  // ===== render orders (safe) =====
  function renderOrders(){
    ordersDiv.innerHTML = '';
    if(!Array.isArray(orders) || orders.length === 0){ ordersDiv.innerHTML = '<div class="panel">Нет заказов</div>'; return; }
    orders.forEach(function(o){
      if(!o || typeof o !== 'object') return;
      var wrap = document.createElement('div'); wrap.className='panel';
      var header = document.createElement('div'); header.innerHTML = '<strong>Чек: ' + (o.id||'') + '</strong> — ' + (o.created_at ? (new Date(o.created_at)).toLocaleString() : '');
      wrap.appendChild(header);
      var list = document.createElement('div');
      var positions = Array.isArray(o.positions) ? o.positions : [];
      if(positions.length === 0){
        var e = document.createElement('div'); e.className='muted'; e.textContent='Состав отсутствует';
        list.appendChild(e);
      } else {
        positions.forEach(function(pos){
          if(!pos) return;
          var pdiv = document.createElement('div');
          var name = pos.name || ('Товар ' + (pos.productId||''));
          var qty = Number(pos.qty||0);
          var price = Number(pos.price||0);
          var payment = pos.payment || o.payment || 'нал';
          pdiv.textContent = name + ' x' + qty + ' — ' + (price * qty) + ' (' + payment + ')';
          list.appendChild(pdiv);
        });
      }
      wrap.appendChild(list);
      var footer = document.createElement('div'); footer.style.marginTop='6px';
      var total = (typeof o.total === 'number') ? o.total : positions.reduce(function(acc,p){ return acc + (Number(p.price)||0)*(Number(p.qty)||0); },0);
      var pcnt = (typeof o.positions_count === 'number') ? o.positions_count : positions.reduce(function(acc,p){ return acc + (Number(p.qty)||0); },0);
      footer.innerHTML = 'Позиции: ' + pcnt + ' — Сумма: ' + total.toFixed(2) + ' — Оплата: ' + (o.payment||'—');
      if(o.comment) footer.innerHTML += ' — Комментарий: ' + o.comment;
      wrap.appendChild(footer);
      ordersDiv.appendChild(wrap);
    });
  }
  
  
  // ===== render cart =====
  // ----------------- renderCart (замена) -----------------
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


      // minus
      var minus = document.createElement('button'); minus.textContent='−';
      minus.addEventListener('click', function(){
        if(c.qty > 1){
          c.qty = c.qty - 1;
          renderCart();
          renderProducts(); // обновляем остатки
        } else {
          // удалить совсем
          if(confirm('Удалить позицию из корзины?')){
            cart.splice(idx,1);
            renderCart();
            renderProducts();
          }
        }
      });


      // plus (проверка остатка)
      var plus = document.createElement('button'); plus.textContent='+';
      plus.addEventListener('click', function(){
        var avail = getAvailableStock(c.productId);
        if(avail <= 0){
          alert('Больше нет на складе');
          return;
        }
        c.qty = c.qty + 1;
        renderCart();
        renderProducts();
      });


      // delete
      var del = document.createElement('button'); del.textContent='✕'; del.style.marginLeft='8px';
      del.addEventListener('click', function(){
        if(confirm('Удалить позицию из корзины?')){
          cart.splice(idx,1);
          renderCart();
          renderProducts();
        }
      });


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

  
  function normalizeDriveUrl(url) {
  if (!url) return '';

  // если это обычная drive-ссылка — переделываем
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return 'https://drive.google.com/uc?id=' + match[1];
  }

  return url; // если уже норм или не drive
}

  
  // ===== finalize order =====
  // ----------------- finalizeOrder (замена) -----------------
function finalizeOrder(){
  if(cart.length === 0){ alert('Корзина пуста'); return; }


  // перед финалом — убедимся, что все позиции доступны
  for(var i=0;i<cart.length;i++){
    var c = cart[i];
    var avail = getAvailableStock(c.productId);
    // note: getAvailableStock учитывает текущую корзину, поэтому временно "освободим" текущую позицию
    // для проверки: доступно ли stock >= qty + (inCart - this.qty)
    var prod = products.find(function(p){ return p.id === c.productId; });
    var baseStock = Number(prod && prod.stock || 0);
    var inCartTotal = cart.reduce(function(acc, it){ return acc + ((it.productId === c.productId) ? it.qty : 0); }, 0);
    if(c.qty > (baseStock - (inCartTotal - c.qty))){
      alert('Недостаточно на складе для товара: ' + (c.name || '') + '. Доступно: ' + (baseStock - (inCartTotal - c.qty)));
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


  // уменьшение stock (только при успешной финализации)
  orderObj.positions.forEach(function(pos){
    var prod = products.find(function(pp){ return pp.id === pos.productId; });
    if(prod && typeof prod.stock === 'number'){
      prod.stock = Math.max(0, Number(prod.stock) - Number(pos.qty || 0));
    }
  });


  orders.push(orderObj);
  saveOrders();
  saveProducts();


  // очистка корзины (не трогаем products.stock дальше — уже списали)
  cart.length = 0;
  quantities = {};
  payments = {};
  if(orderCommentInput) orderCommentInput.value = '';
  renderCart();
  renderProducts();


  alert('Заказ записан: ' + orderObj.id);
}

  
  
function compressImage(base64, maxWidth=300, maxHeight=300){
  return new Promise(resolve=>{
    const img = new Image();
    img.onload = function(){
      let w = img.width, h = img.height;
      const ratio = Math.min(maxWidth/w, maxHeight/h, 1);
      w *= ratio; h *= ratio;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      resolve(canvas.toDataURL('image/png', 0.8));
    }
    img.src = base64;
  });
}

  // ===== export =====
  function downloadProductsExcel(){
    if(typeof XLSX === 'undefined') return alert('XLSX не найден');
    var ws = XLSX.utils.json_to_sheet(products.map(function(p){ return {name:p.name,price:p.price,stock:p.stock,categories:p.categories,image_file:p.imageFile,active:p.active?1:0}; }));
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'products');
    var wbout = XLSX.write(wb,{bookType:'xlsx',type:'binary'});
    var buf = new ArrayBuffer(wbout.length); var view = new Uint8Array(buf);
    for(var i=0;i<wbout.length;i++) view[i]=wbout.charCodeAt(i)&0xFF;
    var blob = new Blob([buf],{type:'application/octet-stream'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='products_export.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  }
  
  
  function downloadOrdersExcel(){
    if(typeof XLSX === 'undefined') return alert('XLSX не найден');
    var rows = [];
    orders.forEach(function(o){
      (o.positions||[]).forEach(function(p){
        rows.push({order_id:o.id, created_at:o.created_at, product_name:p.name, qty:p.qty, price:p.price, line_total:(p.qty*p.price), payment:o.payment, comment:o.comment||''});
      });
    });
    var ws = XLSX.utils.json_to_sheet(rows);
    var wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'orders');
    var wbout = XLSX.write(wb,{bookType:'xlsx',type:'binary'});
    var buf = new ArrayBuffer(wbout.length); var view = new Uint8Array(buf);
    for(var i=0;i<wbout.length;i++) view[i]=wbout.charCodeAt(i)&0xFF;
    var blob = new Blob([buf],{type:'application/octet-stream'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='orders_export.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  }
  
  
  // ===== stats (chart.js) =====
  var _chartSum = null, _chartCount = null;
  // ===== renderStats (замена) =====
  function renderStats(){
    var sumByCat = {}, countByCat = {};
    orders.forEach(function(o){
      (o.positions||[]).forEach(function(pos){
        var prod = products.find(function(pp){ return pp.id === pos.productId; });
        var cat = (prod && prod.categories) ? prod.categories : 'Без категории';
        sumByCat[cat] = (sumByCat[cat]||0) + (Number(pos.price)||0)*(Number(pos.qty)||0);
        countByCat[cat] = (countByCat[cat]||0) + (Number(pos.qty)||0);
      });
    });


    var cats = Object.keys(sumByCat);
    var sums = cats.map(function(c){ return sumByCat[c]; });
    var counts = cats.map(function(c){ return countByCat[c]; });


    // уничтожаем старые чарты если есть
    if(_chartSum){ try{ _chartSum.destroy(); } catch(e){} _chartSum = null; }
    if(_chartCount){ try{ _chartCount.destroy(); } catch(e){} _chartCount = null; }


    var commonOptions = {
      responsive: true,
      maintainAspectRatio: true, // чтобы respect height attribute / CSS
      aspectRatio: 2,            // ширина/высота — подстраивай (2 = шире)
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: false } }
    };


    if(chartSumEl && cats.length > 0){
      _chartSum = new Chart(chartSumEl.getContext('2d'), {
        type: 'bar',
        data: { labels: cats, datasets: [{ label: 'Сумма продаж', data: sums }] },
        options: commonOptions
      });
    } else if(chartSumEl){
      // очистка холста
      var ctx = chartSumEl.getContext('2d');
      ctx.clearRect(0,0,chartSumEl.width, chartSumEl.height);
    }


    if(chartCountEl && cats.length > 0){
      _chartCount = new Chart(chartCountEl.getContext('2d'), {
        type: 'bar',
        data: { labels: cats, datasets: [{ label: 'Кол-во продаж', data: counts }] },
        options: commonOptions
      });
    } else if(chartCountEl){
      var ctx2 = chartCountEl.getContext('2d');
      ctx2.clearRect(0,0,chartCountEl.width, chartCountEl.height);
    }
  }

  
  
  // ===== init event bindings =====
  filterSelect.addEventListener('change', function(){ categoryFilter = this.value; renderProducts(); });
  document.getElementById('viewList').addEventListener('click', function(){ viewMode='list'; renderProducts(); });
  document.getElementById('viewTiles').addEventListener('click', function(){ viewMode='tiles'; renderProducts(); });
  
  
  document.getElementById('downloadProductsBtn').addEventListener('click', downloadProductsExcel);
  document.getElementById('downloadOrdersBtn').addEventListener('click', downloadOrdersExcel);
  
  
  document.getElementById('openProfileBtn').addEventListener('click', function(){
    var el = document.getElementById('profileSection'); if(!el) return;
    el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
    var s = document.getElementById('statsSection'); if(s) s.style.display='none';
  });
  document.getElementById('openStatsBtn').addEventListener('click', function(){
    var el = document.getElementById('statsSection'); if(!el) return;
    el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'block' : 'none';
    var p = document.getElementById('profileSection'); if(p) p.style.display='none';
  });
  
  
  document.getElementById('cleanStorageBtn')?.addEventListener('click', function(){
    if(!confirm('Удалить все данные (products + orders) в localStorage?')) return;
    localStorage.removeItem('products'); localStorage.removeItem('orders');
    products = []; orders = []; saveProducts(); saveOrders();
    renderProducts(); renderOrders(); renderStats();
  });
  
  
  document.getElementById('finalizeOrderBtn').addEventListener('click', finalizeOrder);
  document.getElementById('clearCartBtn').addEventListener('click', function(){ if(confirm('Очистить корзину?')){ cart.length=0; renderCart(); } });
  
  
  // ===== initial render =====
  updateCategoryFilter();
  renderProducts();
  renderOrders();
  renderCart();
  renderStats();
  
  
  // expose for debug (optional)
  window.__app = { products, orders, cart, renderProducts, renderOrders, renderCart, renderStats };
  
  
  }); // DOMContentLoaded end

  


