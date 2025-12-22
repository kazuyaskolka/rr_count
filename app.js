// ===== app.js =====
document.addEventListener('DOMContentLoaded', function(){


  // ===== Data load & state =====
  var products = JSON.parse(localStorage.getItem('products') || '[]');
  var orders = JSON.parse(localStorage.getItem('orders') || '[]');
  var cart = []; // {productId,name,price,qty,payment}
  var quantities = {}; // temporary qty per product id in UI
  var payments = {};   // temporary payment selection per product id
  var categoryFilter = '';
  var viewMode = 'list'; // 'list' or 'tiles'


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


  // ===== helpers =====
  function generateOrderNumber(){
    var d = new Date();
    var y = d.getFullYear().toString().slice(2);
    var m = ('0'+(d.getMonth()+1)).slice(-2);
    var day = ('0'+d.getDate()).slice(-2);
    return 'CHK-'+y+m+day+'-'+Date.now().toString().slice(-5);
  }


  function getAvailableStock(prodId){
    var prod = products.find(p => p && p.id === prodId);
    if(!prod) return 0;
    var inCart = cart.reduce((acc, c) => acc + ((c.productId === prodId) ? Number(c.qty || 0) : 0), 0);
    var base = Number(prod.stock || 0);
    return Math.max(0, base - inCart);
  }


  function tryAddToCart(prodId, qty, payment, name, price){
    qty = Number(qty || 0);
    if(qty <= 0) return { ok:false, message: 'Неверное количество' };
    var avail = getAvailableStock(prodId);
    if(qty > avail) return { ok:false, message: 'Доступно только ' + avail + ' шт.' };


    var existing = cart.find(c => c.productId === prodId && c.payment === payment);
    if(existing){
      var willTotal = existing.qty + qty;
      var currentInCart = cart.reduce((acc, c) => acc + ((c.productId === prodId) ? c.qty : 0), 0);
      var baseStock = (products.find(p => p.id === prodId) || {}).stock || 0;
      if(willTotal + (currentInCart - existing.qty) > baseStock){
        return { ok:false, message: 'Нельзя добавить — не хватает на складе' };
      }
      existing.qty += qty;
    } else {
      cart.push({ productId: prodId, name, price: Number(price||0), qty, payment });
    }
    return { ok:true };
  }


  function saveProducts(){ localStorage.setItem('products', JSON.stringify(products)); }
  function saveOrders(){ localStorage.setItem('orders', JSON.stringify(orders)); renderOrders(); renderStats(); }


  // ===== render functions =====
  function updateCategoryFilter(){
    var current = filterSelect.value || '';
    filterSelect.innerHTML = '<option value="">Все</option>';
    var cats = [];
    products.forEach(p => {
      if(p && p.categories && !cats.includes(p.categories)) cats.push(p.categories);
    });
    cats.forEach(c => {
      var opt = document.createElement('option'); opt.value = c; opt.textContent = c;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = current;
  }


  function renderProducts(){
    productsDiv.innerHTML = '';
    if(viewMode==='tiles') productsDiv.classList.add('tiles'); else productsDiv.classList.remove('tiles');


    var filtered = products.filter(p => p && p.active !== false && (categoryFilter==='' || (p.categories||'')===categoryFilter));
    if(filtered.length === 0){ productsDiv.innerHTML='<div class="panel">Нет товаров</div>'; return; }


    filtered.forEach(p => {
      var card = document.createElement('div'); card.className='product';


      // image
      var img = document.createElement('img'); img.alt = p.name || '';
      if(p.imageUrl && p.imageUrl.trim() !== '') img.src = normalizeDriveUrl(p.imageUrl); else img.style.display='none';


      // meta
      var meta = document.createElement('div'); meta.className='meta';
      var nameEl = document.createElement('div'); nameEl.className='name'; nameEl.textContent=p.name||'Без имени';
      var priceEl = document.createElement('div'); priceEl.className='price'; priceEl.textContent=(p.price||0)+' ₽';
      var catEl = document.createElement('div'); catEl.className='muted'; catEl.textContent='Категория: '+(p.categories||'—');
      var avail = getAvailableStock(p.id);
      var stockEl = document.createElement('div'); stockEl.className='muted'; stockEl.textContent='Остаток: '+avail+(typeof p.stock==='number'?(' (в базе: '+p.stock+')'):'');
      meta.appendChild(nameEl); meta.appendChild(priceEl); meta.appendChild(catEl); meta.appendChild(stockEl);


      // controls
      var controls = document.createElement('div'); controls.style.marginTop='8px';
      var qtyInput = document.createElement('input'); qtyInput.type='number'; qtyInput.min=1; qtyInput.value=quantities[p.id]||1; qtyInput.style.width='70px';
      qtyInput.addEventListener('input', ()=>{ quantities[p.id]=Number(qtyInput.value)||1; });


      var paySelect = document.createElement('select');
      ['нал','безнал'].forEach(val=>{
        var opt=document.createElement('option'); opt.value=val; opt.text=val==='нал'?'Нал':'Безнал'; paySelect.appendChild(opt);
      });
      paySelect.value = payments[p.id]||'нал';
      paySelect.addEventListener('change', ()=>{ payments[p.id]=paySelect.value; });


      var addBtn = document.createElement('button'); addBtn.className='button'; addBtn.textContent='Добавить в корзину';
      addBtn.addEventListener('click', ()=>{
        var qty = Number(quantities[p.id]||qtyInput.value||1);
        var payment = payments[p.id]||paySelect.value||'нал';
        var res = tryAddToCart(p.id, qty, payment, p.name, p.price);
        if(!res.ok){ alert(res.message||'Не удалось добавить'); return; }
        renderCart(); renderProducts();
      });


      controls.appendChild(document.createTextNode('Кол-во: ')); controls.appendChild(qtyInput);
      controls.appendChild(document.createTextNode(' Оплата: ')); controls.appendChild(paySelect);
      controls.appendChild(document.createElement('br'));
      controls.appendChild(addBtn);
      meta.appendChild(controls);


      // append to card
      if(viewMode==='tiles'){
        card.style.display='flex'; card.style.flexDirection='column'; card.style.alignItems='flex-start';
        card.appendChild(img); card.appendChild(meta);
      } else {
        card.style.display='flex'; card.style.flexDirection='row'; card.style.alignItems='center';
        img.style.width='100px'; img.style.height='100px'; img.style.marginRight='10px';
        card.appendChild(img); card.appendChild(meta);
      }


      productsDiv.appendChild(card);
    });
  }


  function renderOrders(){
    ordersDiv.innerHTML='';
    if(!orders.length){ ordersDiv.innerHTML='<div class="panel">Нет заказов</div>'; return; }
    orders.forEach(o=>{
      if(!o||typeof o!=='object') return;
      var wrap=document.createElement('div'); wrap.className='panel';
      var header=document.createElement('div'); header.innerHTML='<strong>Чек: '+(o.id||'')+'</strong> — '+(o.created_at?(new Date(o.created_at)).toLocaleString():'');
      wrap.appendChild(header);
      var list=document.createElement('div');
      (o.positions||[]).forEach(pos=>{
        if(!pos) return;
        var pdiv=document.createElement('div');
        pdiv.textContent=(pos.name||('Товар '+(pos.productId||'')))+' x'+(pos.qty||0)+' — '+((pos.price||0)*(pos.qty||0))+' ('+(pos.payment||o.payment||'нал')+')';
        list.appendChild(pdiv);
      });
      if(!list.hasChildNodes()){ var e=document.createElement('div'); e.className='muted'; e.textContent='Состав отсутствует'; list.appendChild(e); }
      wrap.appendChild(list);
      var footer=document.createElement('div'); footer.style.marginTop='6px';
      var total=o.total||0, pcnt=o.positions_count||0;
      footer.innerHTML='Позиции: '+pcnt+' — Сумма: '+total.toFixed(2)+' — Оплата: '+(o.payment||'—');
      if(o.comment) footer.innerHTML+=' — Комментарий: '+o.comment;
      wrap.appendChild(footer);
      ordersDiv.appendChild(wrap);
    });
  }


  function renderCart(){
    cartItemsDiv.innerHTML='';
    if(cart.length===0){ cartItemsDiv.innerHTML='<div class="muted">Корзина пуста</div>'; cartSummaryMini.textContent='0 / 0'; return; }
    var total=0, qtySum=0;
    cart.forEach((c, idx)=>{
      var row=document.createElement('div'); row.className='cart-row';
      var left=document.createElement('div'); left.textContent=c.name+' ('+(c.price||0)+'₽)';
      var right=document.createElement('div'); right.style.display='flex'; right.style.alignItems='center';
      var qtySpan=document.createElement('span'); qtySpan.textContent=' x'+c.qty; qtySpan.style.marginRight='8px';
      var controls=document.createElement('div'); controls.className='qty-controls';


      var minus=document.createElement('button'); minus.textContent='−';
      minus.addEventListener('click', ()=>{
        if(c.qty>1){ c.qty--; renderCart(); renderProducts(); }
        else if(confirm('Удалить позицию из корзины?')){ cart.splice(idx,1); renderCart(); renderProducts(); }
      });


      var plus=document.createElement('button'); plus.textContent='+';
      plus.addEventListener('click', ()=>{
        if(getAvailableStock(c.productId)<=0){ alert('Больше нет на складе'); return; }
        c.qty++; renderCart(); renderProducts();
      });


      var del=document.createElement('button'); del.textContent='✕'; del.style.marginLeft='8px';
      del.addEventListener('click', ()=>{
        if(confirm('Удалить позицию из корзины?')){ cart.splice(idx,1); renderCart(); renderProducts(); }
      });


      controls.appendChild(minus); controls.appendChild(plus); controls.appendChild(del);
      right.appendChild(qtySpan); right.appendChild(controls);
      row.appendChild(left); row.appendChild(right);
      cartItemsDiv.appendChild(row);
      total+=(c.price||0)*(c.qty||0); qtySum+=c.qty||0;
    });
    var sumDiv=document.createElement('div'); sumDiv.style.marginTop='8px';
    sumDiv.innerHTML='<strong>Позиции: '+cart.length+', Кол-во: '+qtySum+', Сумма: '+total.toFixed(2)+' ₽</strong>';
    cartItemsDiv.appendChild(sumDiv);
    cartSummaryMini.textContent=cart.length+' / '+qtySum;
  }


  // ===== export functions =====
  function downloadProductsExcel(){
    if(typeof XLSX==='undefined') return alert('XLSX не найден');
    var ws=XLSX.utils.json_to_sheet(products.map(p=>({
      name:p.name, price:p.price, stock:p.stock, categories:p.categories,
      image_file:p.imageFile, active:p.active?1:0
    })));
    var wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'products');
    var wbout=XLSX.write(wb,{bookType:'xlsx',type:'binary'});
    var buf=new ArrayBuffer(wbout.length); var view=new Uint8Array(buf);
    for(var i=0;i<wbout.length;i++) view[i]=wbout.charCodeAt(i)&0xFF;
    var blob=new Blob([buf],{type:'application/octet-stream'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='products_export.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  }


  function downloadOrdersExcel(){
    if(typeof XLSX==='undefined') return alert('XLSX не найден');
    var rows=[];
    orders.forEach(o=>{
      (o.positions||[]).forEach(p=>{
        rows.push({order_id:o.id, created_at:o.created_at, product_name:p.name, qty:p.qty, price:p.price, line_total:(p.qty*p.price), payment:o.payment, comment:o.comment||''});
      });
    });
    var ws=XLSX.utils.json_to_sheet(rows);
    var wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'orders');
    var wbout=XLSX.write(wb,{bookType:'xlsx',type:'binary'});
    var buf=new ArrayBuffer(wbout.length); var view=new Uint8Array(buf);
    for(var i=0;i<wbout.length;i++) view[i]=wbout.charCodeAt(i)&0xFF;
    var blob=new Blob([buf],{type:'application/octet-stream'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='orders_export.xlsx'; document.body.appendChild(a); a.click(); a.remove();
  }


  // ===== init event bindings =====
  filterSelect.addEventListener('change', ()=>{ categoryFilter=filterSelect.value; renderProducts(); });
  document.getElementById('viewList').addEventListener('click', ()=>{ viewMode='list'; renderProducts(); });
  document.getElementById('viewTiles').addEventListener('click', ()=>{ viewMode='tiles'; renderProducts(); });


  excelInput.addEventListener('change', e=>handleExcelFile(e.target.files[0]));
  zipInput.addEventListener('change', e=>handleZipFile(e.target.files[0]));
  if(excelInputProfile) excelInputProfile.addEventListener('change', e=>handleExcelFile(e.target.files[0]));
  if(zipInputProfile) zipInputProfile.addEventListener('change', e=>handleZipFile(e.target.files[0]));


  document.getElementById('downloadProductsBtn').addEventListener('click', downloadProductsExcel);
  document.getElementById('downloadOrdersBtn').addEventListener('click', downloadOrdersExcel);


  document.getElementById('openProfileBtn').addEventListener('click', ()=>{
    var el=document.getElementById('profileSection'); if(!el) return;
    el.style.display=(el.style.display==='none'||el.style.display==='')?'block':'none';
    var s=document.getElementById('statsSection'); if(s) s.style.display='none';
  });
  document.getElementById('openStatsBtn').addEventListener('click', ()=>{
    var el=document.getElementById('statsSection'); if(!el) return;
    el.style.display=(el.style.display==='none'||el.style.display==='')?'block':'none';
    var p=document.getElementById('profileSection'); if(p) p.style.display='none';
  });


  document.getElementById('cleanStorageBtn')?.addEventListener('click', ()=>{
    if(!confirm('Удалить все данные (products + orders) в localStorage?')) return;
    localStorage.removeItem('products'); localStorage.removeItem('orders');
    products=[]; orders=[]; saveProducts(); saveOrders();
    renderProducts(); renderOrders(); renderStats();
  });


  document.getElementById('finalizeOrderBtn').addEventListener('click', finalizeOrder);
  document.getElementById('clearCartBtn').addEventListener('click', ()=>{ if(confirm('Очистить корзину?')){ cart.length=0; renderCart(); } });


  // ===== initial render =====
  updateCategoryFilter();
  renderProducts();
  renderOrders();
  renderCart();
  renderStats();


  // expose for debug
  window.__app={products, orders, cart, renderProducts, renderOrders, renderCart, renderStats};


}); // DOMContentLoaded end
