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
  const APP_PAGES = ['dashboard','empleados','flujos','asistente','analytics','alertas','reportes','integraciones','ajustes'];
  const ALL_PAGES = [...APP_PAGES, 'landing','agente','contacto','terminos','privacidad'];

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