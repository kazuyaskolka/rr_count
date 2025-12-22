// ===== app.js =====
document.addEventListener('DOMContentLoaded', function(){


  // ===== Data load & state =====
  var products = JSON.parse(localStorage.getItem('products') || '[]');
  var orders = JSON.parse(localStorage.getItem('orders') || '[]');
  var cart = [];
  var quantities = {};
  var payments = {};
  var categoryFilter = '';
  var viewMode = 'list';


  // ===== DOM refs =====
  var productsDiv = document.getElementById('products');
  var ordersDiv = document.getElementById('orders');
  var filterSelect = document.getElementById('categoryFilter');
  var excelInput = document.getElementById('excelInput');
  var chartSumEl = document.getElementById('chartCategorySum');
  var chartCountEl = document.getElementById('chartCategoryCount');
  var cartItemsDiv = document.getElementById('cartItems');
  var cartPaymentSelect = document.getElementById('cartPayment');
  var orderCommentInput = document.getElementById('orderComment');
  var cartSummaryMini = document.getElementById('cartSummaryMini');


  // ===== Helpers =====
  function saveProducts(){ localStorage.setItem('products', JSON.stringify(products)); }
  function saveOrders(){ localStorage.setItem('orders', JSON.stringify(orders)); renderOrders(); renderStats(); }


  function generateOrderNumber(){
    var d = new Date();
    var y = d.getFullYear().toString().slice(2);
    var m = ('0'+(d.getMonth()+1)).slice(-2);
    var day = ('0'+d.getDate()).slice(-2);
    return 'CHK-'+y+m+day+'-'+Date.now().toString().slice(-5);
  }


  function getAvailableStock(prodId){
    var prod = products.find(p=>p && p.id === prodId);
    if(!prod) return 0;
    var inCart = cart.reduce((acc,c)=> acc + ((c.productId === prodId)? c.qty : 0),0);
    var base = Number(prod.stock||0);
    return Math.max(0, base - inCart);
  }


  function tryAddToCart(prodId, qty, payment, name, price){
    qty = Number(qty||0);
    if(qty <= 0) return {ok:false, message:'Неверное количество'};
    var avail = getAvailableStock(prodId);
    if(qty > avail) return {ok:false, message:'Доступно только '+avail+' шт.'};


    var existing = cart.find(c=>c.productId===prodId && c.payment===payment);
    if(existing){
      var willTotal = existing.qty + qty;
      var inCartTotal = cart.reduce((acc,c)=> acc + ((c.productId===prodId)? c.qty:0),0);
      var baseStock = (products.find(p=>p.id===prodId)||{}).stock||0;
      if(willTotal + (inCartTotal - existing.qty) > baseStock){
        return {ok:false, message:'Нельзя добавить — не хватает на складе'};
      }
      existing.qty += qty;
    } else {
      cart.push({productId:prodId,name:name,price:Number(price||0),qty:qty,payment:payment});
    }
    return {ok:true};
  }


  function normalizeDriveUrl(url){
    // конвертируем ссылку Google Drive в прямую загрузку
    var id = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if(id) return 'https://drive.google.com/uc?export=view&id=' + id[1];
    return url;
  }


  // ===== Render =====
  function renderProducts(){
    productsDiv.innerHTML = '';
    if(viewMode==='tiles') productsDiv.classList.add('tiles'); else productsDiv.classList.remove('tiles');
    var filtered = products.filter(p=>p && p.active!==false && (categoryFilter==='' || (p.categories||'')===categoryFilter));
    if(filtered.length===0){ productsDiv.innerHTML='<div class="panel">Нет товаров</div>'; return; }


    filtered.forEach(function(p){
      var card = document.createElement('div');
      card.className='product';


      var img = document.createElement('img');
      img.alt=p.name||'';
      if(p.imageUrl && p.imageUrl.trim()!=='') img.src=normalizeDriveUrl(p.imageUrl);
      else img.style.display='none';


      var meta = document.createElement('div');
      meta.className='meta';


      var nameEl = document.createElement('div'); nameEl.className='name'; nameEl.textContent=p.name||'Без имени';
      var priceEl = document.createElement('div'); priceEl.className='price'; priceEl.textContent=(p.price||0)+' ₽';
      var catEl = document.createElement('div'); catEl.className='muted'; catEl.textContent='Категория: '+(p.categories||'—');


      var avail = getAvailableStock(p.id);
      var stockEl = document.createElement('div'); stockEl.className='muted';
      stockEl.textContent='Остаток: '+avail;


      meta.appendChild(nameEl); meta.appendChild(priceEl); meta.appendChild(catEl); meta.appendChild(stockEl);


      var controls = document.createElement('div'); controls.style.marginTop='8px';
      var qtyInput = document.createElement('input'); qtyInput.type='number'; qtyInput.min=1;
      qtyInput.value = quantities[p.id]||1; qtyInput.style.width='70px';
      qtyInput.addEventListener('input', function(){ quantities[p.id]=Number(this.value)||1; });


      var paySelect = document.createElement('select');
      ['нал','безнал'].forEach(function(v){
        var o = document.createElement('option'); o.value=v; o.text=v==='нал'?'Нал':'Безнал'; paySelect.appendChild(o);
      });
      paySelect.value = payments[p.id]||'нал';
      paySelect.addEventListener('change', function(){ payments[p.id]=this.value; });


      var addBtn = document.createElement('button'); addBtn.className='button'; addBtn.textContent='Добавить в корзину';
      addBtn.addEventListener('click', function(){
        var qty = Number(quantities[p.id]||qtyInput.value||1);
        var payment = payments[p.id]||paySelect.value||'нал';
        var res = tryAddToCart(p.id,qty,payment,p.name,p.price);
        if(!res.ok){ alert(res.message||'Не удалось добавить'); return; }
        renderCart(); renderProducts();
      });


      controls.appendChild(document.createTextNode('Кол-во: ')); controls.appendChild(qtyInput);
      controls.appendChild(document.createTextNode(' Оплата: ')); controls.appendChild(paySelect);
      controls.appendChild(document.createElement('br')); controls.appendChild(addBtn);


      meta.appendChild(controls);


      // layout
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
    if(!Array.isArray(orders) || orders.length===0){ ordersDiv.innerHTML='<div class="panel">Нет заказов</div>'; return; }
    orders.forEach(function(o){
      if(!o||typeof o!=='object') return;
      var wrap=document.createElement('div'); wrap.className='panel';
      var header=document.createElement('div');
      header.innerHTML='<strong>Чек: '+(o.id||'')+'</strong> — '+(o.created_at?(new Date(o.created_at)).toLocaleString():'');
      wrap.appendChild(header);
      var list=document.createElement('div');
      (o.positions||[]).forEach(function(pos){
        if(!pos) return;
        var pdiv=document.createElement('div');
        var name = pos.name || ('Товар '+(pos.productId||'')); var qty = Number(pos.qty||0);
        var price = Number(pos.price||0); var payment = pos.payment||o.payment||'нал';
        pdiv.textContent=name+' x'+qty+' — '+(price*qty)+' ('+payment+')';
        list.appendChild(pdiv);
      });
      wrap.appendChild(list);
      var footer=document.createElement('div'); footer.style.marginTop='6px';
      var total = (typeof o.total==='number')? o.total : (o.positions||[]).reduce((acc,p)=>acc+(Number(p.price)||0)*(Number(p.qty)||0),0);
      var pcnt = (typeof o.positions_count==='number')? o.positions_count : (o.positions||[]).reduce((acc,p)=>acc+(Number(p.qty)||0),0);
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
    cart.forEach(function(c,idx){
      var row=document.createElement('div'); row.className='cart-row';
      var left=document.createElement('div'); left.textContent=c.name+' ('+(c.price||0)+'₽)';
      var right=document.createElement('div'); right.style.display='flex'; right.style.alignItems='center';
      var qtySpan=document.createElement('span'); qtySpan.textContent=' x'+c.qty; qtySpan.style.marginRight='8px';
      var controls=document.createElement('div'); controls.className='qty-controls';


      var minus=document.createElement('button'); minus.textContent='−';
      minus.addEventListener('click', function(){
        if(c.qty>1){ c.qty--; renderCart(); renderProducts(); }
        else{ if(confirm('Удалить позицию из корзины?')){ cart.splice(idx,1); renderCart(); renderProducts(); } }
      });
      var plus=document.createElement('button'); plus.textContent='+';
      plus.addEventListener('click', function(){
        if(getAvailableStock(c.productId)<=0){ alert('Больше нет на складе'); return; }
        c.qty++; renderCart(); renderProducts();
      });
      var del=document.createElement('button'); del.textContent='✕'; del.style.marginLeft='8px';
      del.addEventListener('click', function(){ if(confirm('Удалить позицию из корзины?')){ cart.splice(idx,1); renderCart(); renderProducts(); } });


      controls.appendChild(minus); controls.appendChild(plus); controls.appendChild(del);
      right.appendChild(qtySpan); right.appendChild(controls);
      row.appendChild(left); row.appendChild(right);
      cartItemsDiv.appendChild(row);
      total+=(Number(c.price)||0)*(Number(c.qty)||0);
      qtySum+=Number(c.qty)||0;
    });
    var sumDiv=document.createElement('div'); sumDiv.style.marginTop='8px';
    sumDiv.innerHTML='<strong>Позиции: '+cart.length+', Кол-во: '+qtySum+', Сумма: '+total.toFixed(2)+' ₽</strong>';
    cartItemsDiv.appendChild(sumDiv);
    cartSummaryMini.textContent=cart.length+' / '+qtySum;
  }


  function finalizeOrder(){
    if(cart.length===0){ alert('Корзина пуста'); return; }
    for(var i=0;i<cart.length;i++){
      var c=cart[i]; var avail=getAvailableStock(c.productId);
      var prod=products.find(p=>p.id===c.productId); var baseStock=Number(prod && prod.stock||0);
      var inCartTotal=cart.reduce((acc,it)=>acc+((it.productId===c.productId)? it.qty:0),0);
      if(c.qty>(baseStock-(inCartTotal-c.qty))){ alert('Недостаточно на складе для '+(c.name||'')+'. Доступно: '+(baseStock-(inCartTotal-c.qty))); return; }
    }
    var positions=cart.map(c=>({productId:c.productId,name:c.name,qty:c.qty,price:c.price,payment:c.payment}));
    var paymentOverall=(cartPaymentSelect&&cartPaymentSelect.value)?cartPaymentSelect.value:(positions[0]&&positions[0].payment)||'нал';
    var orderObj={id:generateOrderNumber(),created_at:new Date().toISOString(),positions:positions,
      total:positions.reduce((acc,p)=>acc+(Number(p.price)||0)*(Number(p.qty)||0),0),
      positions_count:positions.reduce((acc,p)=>acc+Number(p.qty||0),0),
      payment:paymentOverall,
      comment:orderCommentInput?(orderCommentInput.value||''):''
    };
    orderObj.positions.forEach(function(pos){
      var prod=products.find(p=>p.id===pos.productId); if(prod && typeof prod.stock==='number') prod.stock=Math.max(0,Number(prod.stock)-Number(pos.qty||0));
    });
    orders.push(orderObj); saveOrders(); saveProducts();
    cart.length=0; quantities={}; payments={}; if(orderCommentInput) orderCommentInput.value='';
    renderCart(); renderProducts();
    alert('Заказ записан: '+orderObj.id);
  }


  // ===== Import Excel =====
  excelInput.addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader=new FileReader();
    reader.onload=function(evt){
      try{
        var data = new Uint8Array(evt.target.result);
        var wb = XLSX.read(data,{type:'array'});
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(sheet,{defval:''});
        rows.forEach(function(r,i){
          if(!r.name || r.price===undefined) return;
          var existing=products.find(p=>p.name===r.name);
          if(existing){
            existing.price=Number(r.price||0);
            existing.stock=Number(r.stock||0);
            existing.categories=r.categories||'';
            existing.imageUrl = r.imageUrl||'';
            existing.active = (r.active===1 || r.active===true || String(r.active)==='1');
          } else {
            var id=Date.now()+i+Math.floor(Math.random()*1000);
            products.push({id:id,name:r.name,price:Number(r.price||0),stock:Number(r.stock||0),categories:r.categories||'',imageUrl:r.imageUrl||'',active:(r.active===1||r.active===true||String(r.active)==='1')});
          }
        });
        saveProducts(); updateCategoryFilter(); renderProducts();
        alert('Импорт завершён');
      } catch(e){ console.error(e); alert('Ошибка чтения Excel: '+e.message); }
    };
    reader.readAsArrayBuffer(file);
  });


  // ===== Category filter =====
  function updateCategoryFilter(){
    var current = filterSelect.value||'';
    filterSelect.innerHTML='<option value="">Все</option>';
    var cats=[];
    products.forEach(p=>{ if(p && p.categories && cats.indexOf(p.categories)===-1) cats.push(p.categories); });
    cats.forEach(c=>{ var opt=document.createElement('option'); opt.value=c; opt.textContent=c; filterSelect.appendChild(opt); });
    filterSelect.value=current;
  }


  // ===== Stats (Chart.js) =====
  var _chartSum=null,_chartCount=null;
  function renderStats(){
    var sumByCat={},countByCat={};
    orders.forEach(o=>{ (o.positions||[]).forEach(pos=>{
      var prod=products.find(p=>p.id===pos.productId);
      var cat=(prod&&prod.categories)?prod.categories:'Без категории';
      sumByCat[cat]=(sumByCat[cat]||0)+(Number(pos.price)||0)*(Number(pos.qty)||0);
      countByCat[cat]=(countByCat[cat]||0)+(Number(pos.qty)||0);
    }); });
    var cats=Object.keys(sumByCat),sums=cats.map(c=>sumByCat[c]),counts=cats.map(c=>countByCat[c]);
    if(_chartSum){ try{_chartSum.destroy();}catch(e){} _chartSum=null; }
    if(_chartCount){ try{_chartCount.destroy();}catch(e){} _chartCount=null; }
    if(chartSumEl && cats.length>0){ _chartSum = new Chart(chartSumEl.getContext('2d'), {type:'bar',data:{labels:cats,datasets:[{label:'Сумма продаж',data:sums}]}, options:{responsive:true,maintainAspectRatio:true,aspectRatio:2,scales:{y:{beginAtZero:true}},plugins:{legend:{display:false}}}});}
    else if(chartSumEl){chartSumEl.getContext('2d').clearRect(0,0,chartSumEl.width,chartSumEl.height);}
    if(chartCountEl && cats.length>0){ _chartCount = new Chart(chartCountEl.getContext('2d'), {type:'bar',data:{labels:cats,datasets:[{label:'Кол-во продаж',data:counts}]}, options:{responsive:true,maintainAspectRatio:true,aspectRatio:2,scales:{y:{beginAtZero:true}},plugins:{legend:{display:false}}}});}
    else if(chartCountEl){chartCountEl.getContext('2d').clearRect(0,0,chartCountEl.width,chartCountEl.height);}
  }


  // ===== Init bindings =====
  filterSelect.addEventListener('change', function(){ categoryFilter=this.value; renderProducts(); });
  document.getElementById('viewList').addEventListener('click', function(){ view
