import { ApiClient } from './api.js';

const config = window.__LUOJIA_CONFIG__ || Object.freeze({
  mode: 'demo',
  apiBase: '/api/v1',
});

const api = config.mode === 'api' ? new ApiClient(config.apiBase) : null;
const art = document.querySelector('#authArt');
const moodLabel = document.querySelector('#moodLabel');
const toast = document.querySelector('#toast');
const tabs = [...document.querySelectorAll('.view-tab')];
const panels = {
  login: document.querySelector('#panelLogin'),
  register: document.querySelector('#panelRegister'),
};
const messages = {
  idle: '📮 珞珈邮局的小信使们陪你登录',
  peek: '👀 偷看中…你打字好认真',
  shy: '🙈 哎呀呀，密码不许看^_^',
};

let mode = 'idle';
let focusedField = null;
let toastTimer;
let busy = false;
const mouse = { x: innerWidth / 2, y: innerHeight / 2 };
const eyes = [...document.querySelectorAll('.eye')].map(eye => ({
  eye,
  pupil: eye.querySelector('.pupil'),
  blinkUntil: 0,
}));

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function setMode(nextMode) {
  if (mode === nextMode) return;
  mode = nextMode;
  art.classList.toggle('peek', mode === 'peek');
  art.classList.toggle('shy', mode === 'shy');
  moodLabel.innerHTML = `<span class="dot"></span>${messages[mode] || messages.idle}`;
}

function refreshMascots() {
  const passwordShown = [...document.querySelectorAll('[data-toggle]')]
    .some(button => button.closest('.fld').querySelector('input').type === 'text');
  if (focusedField === 'username') setMode('peek');
  else if (passwordShown) setMode('shy');
  else setMode('idle');
}

addEventListener('mousemove', event => {
  mouse.x = event.clientX;
  mouse.y = event.clientY;
});

function drawEyes() {
  const now = Date.now();
  for (const item of eyes) {
    const bounds = item.eye.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const distanceX = mouse.x - centerX;
    const distanceY = mouse.y - centerY;
    const distance = Math.hypot(distanceX, distanceY) || 1;
    const ratio = Math.min(5, distance) / distance;
    const x = mode === 'shy' ? -2.75 : distanceX * ratio;
    const y = mode === 'shy' ? -4.5 : distanceY * ratio;
    const blink = now < item.blinkUntil ? 0.12 : 1;
    item.pupil.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scaleY(${blink})`;
  }
  requestAnimationFrame(drawEyes);
}
requestAnimationFrame(drawEyes);

(function blinkLoop() {
  const item = eyes[Math.floor(Math.random() * eyes.length)];
  if (item) item.blinkUntil = Date.now() + 130;
  setTimeout(blinkLoop, 1400 + Math.random() * 3600);
}());

document.querySelectorAll('.fld input').forEach(input => {
  input.addEventListener('focus', () => {
    focusedField = input.name === 'username' ? 'username' : 'other';
    refreshMascots();
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!document.activeElement?.matches('.fld input')) {
        focusedField = null;
        refreshMascots();
      }
    }, 10);
  });
});

document.querySelectorAll('[data-toggle]').forEach(button => {
  button.addEventListener('click', () => {
    const input = button.closest('.fld').querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? '🙈' : '👁';
    button.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
    refreshMascots();
  });
});

document.querySelectorAll('input[name="username"]').forEach(input => {
  input.addEventListener('input', () => {
    const normalized = input.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (normalized !== input.value) {
      input.value = normalized;
      input.classList.add('invalid');
      clearTimeout(input.invalidTimer);
      input.invalidTimer = setTimeout(() => input.classList.remove('invalid'), 600);
      showToast('用户名仅支持小写字母、数字和下划线（_）');
    }
  });
});

const strengthBars = [...document.querySelectorAll('#panelRegister .strength i')];
document.querySelector('#re-pass').addEventListener('input', event => {
  const value = event.target.value;
  const score = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
    .filter(pattern => pattern.test(value)).length;
  strengthBars.forEach((bar, index) => {
    bar.className = index < score ? `on${index + 1}` : '';
  });
});

function switchForm(name) {
  const active = name === 'register' ? 'register' : 'login';
  tabs.forEach(tab => {
    const selected = tab.dataset.form === active;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  panels.login.hidden = active !== 'login';
  panels.register.hidden = active !== 'register';
  focusedField = null;
  document.querySelectorAll('[data-toggle]').forEach(button => {
    const input = button.closest('.fld').querySelector('input');
    input.type = 'password';
    button.textContent = '👁';
    button.setAttribute('aria-label', '显示密码');
  });
  refreshMascots();
  const params = new URLSearchParams(location.search);
  if (active === 'register') params.set('mode', 'register');
  else params.delete('mode');
  const query = params.size ? `?${params}` : '';
  history.replaceState(null, '', `${location.pathname}${query}${location.hash}`);
}

tabs.forEach(tab => tab.addEventListener('click', () => switchForm(tab.dataset.form)));
document.querySelectorAll('[data-goto]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    switchForm(link.dataset.goto);
  });
});

document.querySelector('#forgot-password').addEventListener('click', event => {
  event.preventDefault();
  showToast('暂不支持自助找回密码，请联系管理员。');
});

function setBusy(form, value) {
  busy = value;
  form.querySelectorAll('button, input').forEach(element => {
    element.disabled = value;
  });
}

function setError(form, message = '') {
  form.querySelector('.form-error').textContent = message;
}

function returnToSite() {
  const requested = new URLSearchParams(location.search).get('next');
  const hash = requested?.startsWith('#/') ? requested : '#/mine';
  // file:// may give auth.html and index.html separate sessionStorage origins.
  // Carry only the demo sign-in marker across the page navigation.
  location.assign(`index.html${config.mode === 'demo' ? '?demoLogin=1' : ''}${hash}`);
}

async function submitLogin(form) {
  const username = document.querySelector('#li-user').value;
  const password = document.querySelector('#li-pass').value;
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    setError(form, '用户名须为 3–32 位小写字母、数字或下划线。');
    return;
  }
  if (password.length < 8) {
    setError(form, '密码至少需要 8 位。');
    return;
  }
  if (config.mode === 'demo') {
    sessionStorage.setItem('luojia.demo.signedIn', 'true');
  } else {
    await api.login({ account: username, password });
  }
  showToast(`欢迎回来，${username} 📮`);
  setTimeout(returnToSite, 350);
}

async function submitRegister(form) {
  const username = document.querySelector('#re-user').value;
  const displayName = document.querySelector('#re-display').value.trim();
  const password = document.querySelector('#re-pass').value;
  const confirmation = document.querySelector('#re-pass2').value;
  if (!/^[a-z0-9_]{3,32}$/.test(username)) {
    setError(form, '用户名须为 3–32 位小写字母、数字或下划线。');
    return;
  }
  if (!displayName) {
    setError(form, '请填写显示名称。');
    return;
  }
  if (password.length < 8) {
    setError(form, '密码至少需要 8 位。');
    return;
  }
  if (password !== confirmation) {
    setError(form, '两次输入的密码不一致。');
    return;
  }
  if (config.mode === 'demo') {
    sessionStorage.setItem('luojia.demo.signedIn', 'true');
  } else {
    await api.register({ username, password, displayName });
  }
  showToast(`账号 ${username} 已开通 ✉️`);
  setTimeout(returnToSite, 350);
}

for (const [form, submit] of [
  [document.querySelector('#formLogin'), submitLogin],
  [document.querySelector('#formRegister'), submitRegister],
]) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    setError(form);
    setBusy(form, true);
    try {
      await submit(form);
    } catch (error) {
      setError(form, error.message || '操作没有完成，请稍后重试。');
    } finally {
      setBusy(form, false);
    }
  });
}

const accountButton = document.querySelector('.header .login');
accountButton.addEventListener('click', returnToSite);

if (new URLSearchParams(location.search).get('mode') === 'register') switchForm('register');

if (api) {
  api.session().then(user => {
    if (user) {
      accountButton.textContent = '我的';
      showToast(`当前已登录：${user.displayName}`);
    }
  }).catch(() => {});
}
