/* ══════════════════════════════════════════
   LaborAr SPA — app.js
   ══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', function () {

  /* ── CURSOR ── */
  const cursor     = document.getElementById('cursor');
  const cursorRing = document.getElementById('cursorRing');
  let cx = 0, cy = 0, rx = 0, ry = 0;

  document.addEventListener('mousemove', e => {
    cx = e.clientX; cy = e.clientY;
    if (cursor) cursor.style.transform = `translate(${cx - 5}px, ${cy - 5}px)`;
  });

  (function animRing() {
    rx += (cx - rx) * 0.12;
    ry += (cy - ry) * 0.12;
    if (cursorRing) cursorRing.style.transform = `translate(${rx - 18}px, ${ry - 18}px)`;
    requestAnimationFrame(animRing);
  })();

  /* ══════════════════════════════════════════
     SIDEBAR MÓVIL
     ══════════════════════════════════════════ */
  window.toggleSidebar = function() {
    const sidebar  = document.getElementById('app-sidebar');
    const overlay  = document.getElementById('sidebar-overlay');
    const toggles  = document.querySelectorAll('.menu-toggle');
    const isOpen   = sidebar.classList.contains('open');
    if (isOpen) {
      sidebar.classList.remove('open');
      overlay.classList.remove('visible');
      toggles.forEach(t => t.classList.remove('open'));
    } else {
      sidebar.classList.add('open');
      overlay.classList.add('visible');
      toggles.forEach(t => t.classList.add('open'));
    }
  };

  window.closeSidebar = function() {
    const sidebar = document.getElementById('app-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.querySelectorAll('.menu-toggle').forEach(t => t.classList.remove('open'));
  };

  // Cerrar sidebar al navegar en móvil
  document.querySelectorAll('.sb-item[data-nav]').forEach(item => {
    item.addEventListener('click', closeSidebar);
  });

  // Cerrar con tecla Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });
  const APP_PAGES  = ['dashboard','empleados','flujos','asistente','analytics','alertas','reportes','integraciones','ajustes'];
  const AUTH_PAGES = ['login','register','forgot-password','reset-password'];
  const ALL_PAGES  = [...APP_PAGES, 'landing','agente','contacto','terminos','privacidad',...AUTH_PAGES];

  /* ══════════════════════════════════════════
     AUTH — Estado y configuración
     ══════════════════════════════════════════ */
  const AUTH_URL  = 'http://localhost:3002';
  let accessToken = null;
  let currentUser = null;

  function saveToken(t) { accessToken = t; try { sessionStorage.setItem('laborar_access', t); } catch(e){} }
  function loadToken()  { return accessToken || sessionStorage.getItem('laborar_access') || null; }
  function clearToken() { accessToken = null; sessionStorage.removeItem('laborar_access'); }

  async function authFetch(path, opts) {
    opts = opts || {};
    const token = loadToken();
    opts.headers = Object.assign({}, opts.headers || {}, { 'Content-Type': 'application/json' });
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    opts.credentials = 'include';
    var res = await fetch(AUTH_URL + path, opts);
    if (res.status === 401 && token) {
      var rr = await fetch(AUTH_URL + '/auth/refresh', { method:'POST', credentials:'include' });
      if (rr.ok) {
        var rd = await rr.json();
        saveToken(rd.access_token);
        opts.headers['Authorization'] = 'Bearer ' + rd.access_token;
        res = await fetch(AUTH_URL + path, opts);
      }
    }
    return res;
  }

  function updateUserUI(user) {
    currentUser = user;
    if (!user) return;
    var sbName = document.querySelector('.sb-user-info .name');
    var sbRole = document.querySelector('.sb-user-info .role');
    var sbAv   = document.querySelector('.sb-avatar');
    if (sbName) sbName.textContent = user.name || user.email;
    if (sbRole) sbRole.textContent = user.role || 'Usuario';
    if (sbAv)   sbAv.textContent   = (user.name || user.email).slice(0,2).toUpperCase();
  }

  async function checkAuth() {
    var token = loadToken();
    if (!token) {
      try {
        var rr = await fetch(AUTH_URL + '/auth/refresh', { method:'POST', credentials:'include' });
        if (rr.ok) {
          var rd = await rr.json();
          saveToken(rd.access_token);
          var me = await authFetch('/auth/me');
          if (me.ok) { var d = await me.json(); updateUserUI(d.user); return d.user; }
        }
      } catch(e) {}
      return null;
    }
    try {
      var me = await authFetch('/auth/me');
      if (me.ok) { var d = await me.json(); updateUserUI(d.user); return d.user; }
      clearToken();
    } catch(e) {}
    return null;
  }

  function handleGoogleCallback() {
    var params = new URLSearchParams(window.location.hash.replace(/^#[^?]*\?/, ''));
    var token  = params.get('token');
    if (token) {
      saveToken(token);
      authFetch('/auth/me').then(function(r){ return r.json(); }).then(function(d){
        if (d.user) { updateUserUI(d.user); navigate('dashboard'); }
      });
    }
    if (params.get('error') === 'google') navigate('login');
  }

  function handleResetCallback() {
    var hash = window.location.hash;
    if (hash.indexOf('reset-password') !== -1) {
      var params = new URLSearchParams(hash.replace(/#reset-password\??/, ''));
      window.resetToken  = params.get('token');
      window.resetUserId = params.get('id');
    }
  }

  window.loginSubmit = async function() {
    var email    = (document.getElementById('login-email')||{}).value||'';
    var password = (document.getElementById('login-pass')||{}).value||'';
    var remember = (document.getElementById('login-remember')||{}).checked||false;
    var errEl    = document.getElementById('login-error');
    var btn      = document.getElementById('login-btn');
    var spin     = document.getElementById('login-spinner');
    email = email.trim();
    if (!email || !password) { showAuthErr(errEl,'Completá email y contraseña'); return; }
    errEl.style.display='none'; btn.disabled=true; spin.style.display='block';
    try {
      var res  = await fetch(AUTH_URL+'/auth/login', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password,remember}) });
      var data = await res.json();
      if (!res.ok) { showAuthErr(errEl, data.error||'Error al iniciar sesión'); return; }
      saveToken(data.access_token);
      updateUserUI(data.user);
      navigate('dashboard');
    } catch(e) { showAuthErr(errEl,'No se pudo conectar al servidor de auth. ¿Está corriendo auth.js en el puerto 3002?'); }
    finally { btn.disabled=false; spin.style.display='none'; }
  };

  window.registerSubmit = async function() {
    var name     = ((document.getElementById('reg-name')||{}).value||'').trim();
    var email    = ((document.getElementById('reg-email')||{}).value||'').trim();
    var password = (document.getElementById('reg-pass')||{}).value||'';
    var company  = ((document.getElementById('reg-company')||{}).value||'').trim();
    var errEl    = document.getElementById('register-error');
    var btn      = document.getElementById('reg-btn');
    var spin     = document.getElementById('reg-spinner');
    if (!name||!email||!password) { showAuthErr(errEl,'Completá nombre, email y contraseña'); return; }
    if (password.length<8) { showAuthErr(errEl,'La contraseña debe tener al menos 8 caracteres'); return; }
    errEl.style.display='none'; btn.disabled=true; spin.style.display='block';
    try {
      var res  = await fetch(AUTH_URL+'/auth/register', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,email,password,company}) });
      var data = await res.json();
      if (!res.ok) { showAuthErr(errEl, data.error||'Error al crear cuenta'); return; }
      saveToken(data.access_token);
      updateUserUI(data.user);
      navigate('dashboard');
    } catch(e) { showAuthErr(errEl,'No se pudo conectar al servidor de auth'); }
    finally { btn.disabled=false; spin.style.display='none'; }
  };

  window.forgotSubmit = async function() {
    var email = ((document.getElementById('forgot-email')||{}).value||'').trim();
    var errEl = document.getElementById('forgot-error');
    var okEl  = document.getElementById('forgot-ok');
    var btn   = document.getElementById('forgot-btn');
    var spin  = document.getElementById('forgot-spinner');
    if (!email) { showAuthErr(errEl,'Ingresá tu email'); return; }
    errEl.style.display='none'; okEl.style.display='none'; btn.disabled=true; spin.style.display='block';
    try {
      await fetch(AUTH_URL+'/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email}) });
      okEl.textContent='✅ Si ese email existe, te enviamos el link. Revisá tu bandeja (y spam).';
      okEl.style.display='block';
    } catch(e) { showAuthErr(errEl,'No se pudo conectar al servidor'); }
    finally { btn.disabled=false; spin.style.display='none'; }
  };

  window.resetSubmit = async function() {
    var pass  = (document.getElementById('reset-pass')||{}).value||'';
    var pass2 = (document.getElementById('reset-pass2')||{}).value||'';
    var errEl = document.getElementById('reset-error');
    var okEl  = document.getElementById('reset-ok');
    var btn   = document.getElementById('reset-btn');
    var spin  = document.getElementById('reset-spinner');
    if (!pass||!pass2)  { showAuthErr(errEl,'Completá ambos campos'); return; }
    if (pass!==pass2)   { showAuthErr(errEl,'Las contraseñas no coinciden'); return; }
    if (pass.length<8)  { showAuthErr(errEl,'Mínimo 8 caracteres'); return; }
    if (!window.resetToken||!window.resetUserId) { showAuthErr(errEl,'Link inválido. Solicitá uno nuevo.'); return; }
    errEl.style.display='none'; okEl.style.display='none'; btn.disabled=true; spin.style.display='block';
    try {
      var res  = await fetch(AUTH_URL+'/auth/reset-password', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({user_id:window.resetUserId,token:window.resetToken,password:pass}) });
      var data = await res.json();
      if (!res.ok) { showAuthErr(errEl,data.error||'Error al restablecer'); return; }
      okEl.textContent='✅ Contraseña actualizada. Redirigiendo al login...';
      okEl.style.display='block';
      setTimeout(function(){ navigate('login'); }, 2000);
    } catch(e) { showAuthErr(errEl,'No se pudo conectar al servidor'); }
    finally { btn.disabled=false; spin.style.display='none'; }
  };

  window.logoutUser = async function() {
    try { await fetch(AUTH_URL+'/auth/logout', {method:'POST',credentials:'include'}); } catch(e) {}
    clearToken(); currentUser=null; navigate('login');
  };

  window.loginWithGoogle = function() { window.location.href = AUTH_URL+'/auth/google'; };

  window.checkPassStrength = function(val) {
    ['','2'].forEach(function(sfx) {
      var fill = document.getElementById('ps-fill'+sfx);
      var lbl  = document.getElementById('ps-label'+sfx);
      if (!fill||!lbl) return;
      var score=0;
      if (val.length>=8) score++;
      if (/[A-Z]/.test(val)) score++;
      if (/[0-9]/.test(val)) score++;
      if (/[^A-Za-z0-9]/.test(val)) score++;
      var colors=['#ef4444','#f59e0b','#3b82f6','#00e5a0'];
      var labels=['Débil','Regular','Buena','Fuerte'];
      fill.style.width=(score*25)+'%';
      fill.style.background=colors[score-1]||'transparent';
      lbl.textContent=score>0?labels[score-1]:'';
    });
  };

  window.togglePass = function(inputId,btn) {
    var inp=document.getElementById(inputId);
    if (!inp) return;
    inp.type=inp.type==='password'?'text':'password';
    btn.textContent=inp.type==='password'?'👁':'🙈';
  };

  function showAuthErr(el,msg) { if(!el)return; el.textContent='⚠️ '+msg; el.style.display='block'; }

  // Logout desde sidebar (click en avatar)
  var sbUser = document.querySelector('.sb-user');
  if (sbUser) { sbUser.style.cursor='pointer'; sbUser.title='Cerrar sesión'; sbUser.addEventListener('click',function(){ if(confirm('¿Querés cerrar sesión?')) logoutUser(); }); }

  // Inicializar auth
  checkAuth();
  if (window.location.hash.indexOf('auth-callback')!==-1) handleGoogleCallback();
  if (window.location.hash.indexOf('reset-password')!==-1) handleResetCallback();

  /* ══════════════════════════════════════════
     ROUTER
     ══════════════════════════════════════════ */

  window.navigate = function(page) {
    ALL_PAGES.forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.classList.remove('active');
    });

    const sidebar = document.getElementById('app-sidebar');
    if (APP_PAGES.includes(page)) {
      sidebar.style.display = 'flex';
      document.querySelectorAll('.sb-item[data-nav]').forEach(item => {
        item.classList.toggle('active', item.dataset.nav === page);
      });
    } else {
      sidebar.style.display = 'none';
    }

    const target = document.getElementById('page-' + page);
    if (target) {
      target.classList.add('active');
      window.scrollTo(0, 0);
    }

    history.pushState(null, '', '#' + page);
    onNavigate(page);
  };

  function onNavigate(page) {
    if (page === 'dashboard') {
      const d    = new Date();
      const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      const str  = d.toLocaleDateString('es-AR', opts);
      const week = Math.ceil(((d - new Date(d.getFullYear(), 0, 1)) / 86400000 + new Date(d.getFullYear(), 0, 1).getDay() + 1) / 7);
      const el   = document.getElementById('dash-date');
      if (el) el.textContent = str.charAt(0).toUpperCase() + str.slice(1) + ' · Semana ' + week;
    }
    if (page === 'analytics') buildHeatmap();
  }

  // Init
  const hash = window.location.hash.replace('#', '');
  navigate(ALL_PAGES.includes(hash) ? hash : 'landing');

  window.addEventListener('popstate', () => {
    const h = window.location.hash.replace('#', '');
    if (ALL_PAGES.includes(h)) navigate(h);
  });

  document.querySelectorAll('.sb-item[data-nav]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.nav));
  });

  /* ── Scroll to section (landing) ── */
  window.scrollToSection = function(id) {
    navigate('landing');
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 120);
  };

  /* ══════════════════════════════════════════
     AGENTE IA
     ══════════════════════════════════════════ */
  let apiKey       = sessionStorage.getItem('laborar_groq_key') || '';
  let agentHistory = [];
  let agentLoading = false;
  let leadData     = {};
  let selectedSlot = null;

  if (apiKey) activateAI();

  window.saveApiKey = function() {
    const k = document.getElementById('apiKeyInput')?.value.trim();
    if (!k || !k.startsWith('gsk_')) { alert('La API Key debe comenzar con "gsk_..."'); return; }
    apiKey = k;
    sessionStorage.setItem('laborar_groq_key', k);
    activateAI();
  };

  function activateAI() {
    const banner = document.getElementById('apiBanner');
    const ok     = document.getElementById('apiOk');
    if (banner) banner.style.display = 'none';
    if (ok)     ok.style.display     = 'flex';
    const mode   = document.getElementById('aiMode');
    const hint   = document.getElementById('agente-mode-hint');
    const status = document.getElementById('aiStatus');
    if (mode)   mode.textContent   = 'LLaMA 3';
    if (hint)   hint.textContent   = 'LLaMA 3.3 vía Groq';
    if (status) status.textContent = 'LLaMA 3.3 · Groq API activa';
  }

  window.saveLead = function() {
    const name  = document.getElementById('leadName')?.value.trim();
    const email = document.getElementById('leadEmail')?.value.trim();
    if (!name && !email) { alert('Completá al menos tu nombre o email'); return; }
    leadData = { name, email, company: document.getElementById('leadCompany')?.value.trim() };
    const form  = document.getElementById('leadFormSection');
    const saved = document.getElementById('leadSavedMsg');
    if (form)  form.style.display  = 'none';
    if (saved) saved.style.display = 'block';
    if (name) { agentHideWelcome(); agentAddBot(`¡Hola **${name}**! 👋 Ya guardé tus datos. ¿En qué te puedo ayudar con LaborAr?`); }
  };

  window.selectSlot = function(el) {
    document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedSlot = el.innerText.replace('\n', ' ');
  };

  window.confirmDemo = function() {
    if (!selectedSlot) { alert('Seleccioná un horario primero'); return; }
    agentHideWelcome();
    agentAddUser('Quiero agendar una demo para el ' + selectedSlot);
    setTimeout(() => agentAddBot(
      '¡Perfecto! 🎉 Agendé tu demo para el **' + selectedSlot + '**.\n\nVas a recibir un email de confirmación con el link de videollamada. La sesión dura 30 minutos.\n\n¿Tenés alguna pregunta antes de la demo?'
    ), 800);
  };

  function agentHideWelcome() {
    const w = document.getElementById('agente-welcome');
    if (w) w.remove();
  }

  function getTime() {
    return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }

  function fmt(t) {
    return t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function esc(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function agentAddUser(text) {
    agentHideWelcome();
    const msgs = document.getElementById('agente-messages');
    if (!msgs) return;
    const initials = leadData.name ? leadData.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() : 'YO';
    const d = document.createElement('div');
    d.className = 'amsg-row user';
    d.innerHTML = '<div class="amsg-av user">' + initials + '</div><div class="amsg-content"><div class="amsg-bubble">' + esc(text) + '</div><div class="amsg-time">' + getTime() + '</div></div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function agentAddBot(text, extra) {
    extra = extra || '';
    const msgs = document.getElementById('agente-messages');
    if (!msgs) return;
    const d = document.createElement('div');
    d.className = 'amsg-row bot';
    d.innerHTML = '<div class="amsg-av bot">🤖</div><div class="amsg-content"><div class="amsg-bubble">' + fmt(text) + '</div>' + extra + '<div class="amsg-time">Aria · ' + getTime() + '</div></div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function agentShowTyping() {
    const msgs = document.getElementById('agente-messages');
    if (!msgs) return;
    const d = document.createElement('div');
    d.className = 'typing-row'; d.id = 'agente-typing';
    d.innerHTML = '<div class="amsg-av bot">🤖</div><div class="typing-bub"><div class="td"></div><div class="td"></div><div class="td"></div></div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function agentHideTyping() {
    const t = document.getElementById('agente-typing');
    if (t) t.remove();
  }

  window.agenteSend = async function(prefill) {
    const input = document.getElementById('agente-input');
    const text  = (prefill !== undefined) ? String(prefill) : (input ? input.value.trim() : '');
    if (!text || agentLoading) return;
    if (input) { input.value = ''; input.style.height = 'auto'; }

    agentAddUser(text);
    agentHistory.push({ role: 'user', content: text });

    if (!apiKey) {
      agentShowTyping();
      setTimeout(function() {
        agentHideTyping();
        var r = demoReply(text);
        agentAddBot(r.text, r.extra);
        agentHistory.push({ role: 'assistant', content: r.text });
      }, 900 + Math.random() * 500);
      return;
    }

    agentLoading = true;
    var btn = document.getElementById('agente-sendBtn');
    if (btn) btn.disabled = true;
    agentShowTyping();

    try {
      var res  = await fetch('http://localhost:3001/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: agentHistory, apiKey: apiKey })
      });
      var data = await res.json();
      agentHideTyping();
      if (data.error) {
        agentAddBot('❌ Error: ' + (data.error.message || JSON.stringify(data.error)));
      } else {
        var reply = data.choices[0].message.content;
        agentHistory.push({ role: 'assistant', content: reply });
        var needsHuman = /humano|persona|agente|soporte|hablar con/i.test(text);
        var extra = needsHuman
          ? '<div class="human-transfer"><span class="ht-icon">👤</span><div class="ht-text">¿Preferís hablar con alguien del equipo?</div><button class="ht-btn" onclick="navigate(\'contacto\')">Ir a contacto →</button></div>'
          : '';
        agentAddBot(reply, extra);
      }
    } catch(e) {
      agentHideTyping();
      agentAddBot('❌ No pude conectarme al servidor.\n\n**Para activarlo:**\n1. Abrí terminal\n2. Escribí: node servidor.js\n3. Presioná Enter');
    }

    agentLoading = false;
    if (btn) btn.disabled = false;
  };

  window.agentTransferHuman = function() {
    agentHideWelcome();
    agentAddBot(
      '👤 Te derivo al equipo de ventas.\n\n📧 **ventas@laborar.com**\nRespuesta en menos de 2 horas hábiles.',
      '<div class="human-transfer"><span class="ht-icon">📧</span><div class="ht-text">El equipo te contactará pronto.</div><button class="ht-btn" onclick="navigate(\'contacto\')">Ir a contacto →</button></div>'
    );
  };

  window.clearChat = function() {
    agentHistory = [];
    var msgs = document.getElementById('agente-messages');
    if (!msgs) return;
    msgs.innerHTML = '<div class="agent-welcome" id="agente-welcome"><div class="aw-icon">🤖</div><div class="aw-title">Hola, soy <span style="color:var(--accent)">Aria</span></div><div class="aw-sub">Soy el agente de LaborAr. Puedo responder preguntas, mostrarte precios, ayudarte a agendar una demo o conectarte con el equipo.</div><div class="aw-suggestions"><button class="aw-sug" onclick="agenteSend(\'¿Qué hace exactamente LaborAr?\')"><span class="aw-sug-icon">🚀</span><strong>¿Qué es LaborAr?</strong><span class="aw-sug-text">Conocé la plataforma</span></button><button class="aw-sug" onclick="agenteSend(\'¿Cuánto cuesta LaborAr?\')"><span class="aw-sug-icon">💰</span><strong>Ver precios</strong><span class="aw-sug-text">Planes y costos</span></button><button class="aw-sug" onclick="agenteSend(\'Quiero agendar una demo de LaborAr\')"><span class="aw-sug-icon">📅</span><strong>Agendar demo</strong><span class="aw-sug-text">30 min, sin costo</span></button><button class="aw-sug" onclick="agenteSend(\'¿Puedo hacer una prueba gratuita?\')"><span class="aw-sug-icon">🎁</span><strong>Prueba gratis</strong><span class="aw-sug-text">14 días sin tarjeta</span></button></div></div>';
  };

  function demoReply(text) {
    var t = text.toLowerCase();
    if (/(precio|cuesta|plan|cuanto|vale)/.test(t))
      return { text: 'Tenemos 3 planes 💰\n\n**Starter — $299/mes:** Hasta 100 empleados. Portal, flujos y analytics básico.\n\n**Growth — $799/mes:** Hasta 500 empleados. Todo lo anterior + Asistente IA, integraciones y app móvil.\n\n**Enterprise — A medida:** Sin límite, on-premise, SSO y Customer Success dedicado.\n\nTodos incluyen **14 días gratis** sin tarjeta. ¿Querés más detalle?', extra: '' };
    if (/(demo|mostrar|ver la plataforma)/.test(t))
      return { text: '¡Con gusto! 📅 Las demos son **gratuitas, duran 30 minutos** y las adaptamos a tu empresa.\n\nPodés elegir un horario en el panel de la izquierda. ¿De cuántos empleados es tu empresa?', extra: '' };
    if (/(gratis|prueba|trial|free)/.test(t))
      return { text: '¡Sí! 🎁 **14 días de prueba completamente gratis**, sin tarjeta y sin compromisos.\n\nAccedés al plan Growth completo para evaluar todas las funcionalidades incluyendo el Asistente IA.\n\n¿Querés que te genere el acceso ahora mismo?', extra: '' };
    if (/(integra|workday|sap|bamboo|hrm|sistema)/.test(t))
      return { text: 'Tenemos conectores nativos con los principales sistemas 🔌\n\n• **Workday, BambooHR, Google Workspace** → listo en 2 días\n• **SAP SuccessFactors, Microsoft 365** → 1-3 días\n• **Cualquier sistema REST** → con nuestra API\n\n¿Qué sistema de RRHH usás actualmente?', extra: '' };
    if (/(segur|dato|privac|gdpr|ley)/.test(t))
      return { text: 'La seguridad es nuestra prioridad 🔒\n\n• **AWS São Paulo** · ISO 27001\n• **TLS 1.3** en tránsito · **AES-256** en reposo\n• Cumplimos GDPR, Ley 25.326 y LGPD\n• **Nunca vendemos** datos a terceros', extra: '' };
    if (/(humano|persona|hablar|vendedor|comercial|equipo)/.test(t))
      return { text: '¡Por supuesto! 👤 Podés escribirnos a **ventas@laborar.com**\n\nNuestro equipo responde en menos de 2 horas hábiles (Lun-Vie 9-18hs GMT-3).', extra: '<div class="human-transfer"><span class="ht-icon">👤</span><div class="ht-text">Te conectamos con el equipo de ventas.</div><button class="ht-btn" onclick="navigate(\'contacto\')">Ir a contacto →</button></div>' };
    if (/(retenci|renuncia|turnover|abandono)/.test(t))
      return { text: 'LaborAr incluye un **modelo predictivo de riesgo de renuncia** 📊\n\nDetecta señales como días sin actividad, progreso bajo en semana 1, y patrones en las consultas al asistente.\n\nEl 94% de nuestros clientes reporta mejora en retención a 90 días.', extra: '' };
    if (/(que es|que hace|laborar|para que)/.test(t))
      return { text: 'LaborAr **automatiza el onboarding de empleados** 🚀\n\n• **Portal personalizado** por rol y área\n• **Flujos automáticos** de tareas y documentos\n• **Asistente IA 24/7** para dudas del empleado\n• **Integraciones** con Workday, SAP, Google\n• **Analytics** con alertas de riesgo de renuncia\n\nReducimos el onboarding de semanas a **8 días promedio**. ¿Querés ver una demo?', extra: '' };
    return { text: '¡Gracias por tu consulta! 👋 Puedo ayudarte con:\n\n• ¿Qué hace LaborAr?\n• Precios y planes\n• Prueba gratuita de 14 días\n• Agendar una demo\n• Integraciones y seguridad\n\n¿Sobre qué te gustaría saber más?', extra: '' };
  }

  /* ══════════════════════════════════════════
     ASISTENTE INTERNO
     ══════════════════════════════════════════ */
  window.asistenteSend = function(prefill) {
    const input = document.getElementById('asistente-input');
    const text  = (prefill !== undefined) ? String(prefill) : (input ? input.value.trim() : '');
    if (!text) return;
    if (input) { input.value = ''; input.style.height = 'auto'; }
    const msgs = document.getElementById('asistente-messages');
    if (!msgs) return;
    const u = document.createElement('div');
    u.className = 'msg user-msg';
    u.innerHTML = '<div class="msg-av user-av">HR</div><div><div class="msg-bubble">' + esc(text) + '</div><div class="msg-time">' + getTime() + '</div></div>';
    msgs.appendChild(u);
    msgs.scrollTop = msgs.scrollHeight;
    setTimeout(function() {
      var replies = ['Entendido. Voy a buscar esa información para el empleado.','Le paso esa respuesta a Ana García. ¿Querés que agregue algún detalle?','Perfecto, ya registré tu mensaje en el hilo.','¿Querés que también le envíe una notificación push al empleado?'];
      var b = document.createElement('div');
      b.className = 'msg bot-msg';
      b.innerHTML = '<div class="msg-av bot-av">🤖</div><div><div class="msg-bubble">' + replies[Math.floor(Math.random()*replies.length)] + '</div><div class="msg-time">Aria · ' + getTime() + '</div></div>';
      msgs.appendChild(b);
      msgs.scrollTop = msgs.scrollHeight;
    }, 900);
  };

  /* ══════════════════════════════════════════
     ANALYTICS — HEATMAP
     ══════════════════════════════════════════ */
  function buildHeatmap() {
    const c = document.getElementById('heatmap');
    if (!c) return;
    c.innerHTML = '';
    const levels = ['rgba(0,229,160,0.05)','rgba(0,229,160,0.15)','rgba(0,229,160,0.30)','rgba(0,229,160,0.55)','rgba(0,229,160,0.85)'];
    for (let i = 0; i < 28; i++) {
      const cell = document.createElement('div');
      cell.className = 'hm-cell';
      cell.style.background = levels[Math.floor(Math.random() * 5)];
      cell.title = Math.floor(Math.random() * 20) + ' accesos';
      c.appendChild(cell);
    }
  }

  /* ── Period tabs ── */
  document.querySelectorAll('.period-tabs').forEach(function(group) {
    group.querySelectorAll('.ptab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        group.querySelectorAll('.ptab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  });

  /* ══════════════════════════════════════════
     AJUSTES
     ══════════════════════════════════════════ */
  const settingsMap = { org:'st-org', cuenta:'st-cuenta', equipo:'st-equipo', notif:'st-notif', ia:'st-ia', api:'st-api', billing:'st-billing' };

  window.settingsTab = function(el, key) {
    document.querySelectorAll('.snav-item').forEach(function(i) { i.classList.remove('active'); });
    el.classList.add('active');
    Object.values(settingsMap).forEach(function(id) {
      var e = document.getElementById(id);
      if (e) e.style.display = 'none';
    });
    var target = document.getElementById(settingsMap[key]);
    if (target) target.style.display = 'block';
  };

  document.querySelectorAll('.toggle').forEach(function(t) {
    t.addEventListener('click', function() { t.classList.toggle('on'); });
  });

  /* ── FAQ ── */
  window.toggleFaq = function(el) {
    var item   = el.closest('.faq-item');
    var isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(function(i) { i.classList.remove('open'); });
    if (!isOpen) item.classList.add('open');
  };

}); // end DOMContentLoaded
