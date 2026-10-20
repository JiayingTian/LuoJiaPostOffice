import { config } from './frontend/config.js';

const toast = document.querySelector('.toast');
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');
const accountButton = document.querySelector('.login-button');
let toastTimer;

const routes = {
  '读信': 'frontend/#/mailbox',
  '时光信笺': 'frontend/#/mailbox',
  '写信': 'frontend/#/write',
};

function showPlaceholder(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = `${message}功能将在后续页面中接入`;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const route = routes[button.dataset.action];
    if (route) {
      window.location.href = route;
      return;
    }
    showPlaceholder(button.dataset.action);
  });
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    navigation.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    const label = button.textContent.trim();
    if (label === '首页') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const route = routes[label];
    if (route) {
      window.location.href = route;
      return;
    }
    showPlaceholder(label);
  });
});

async function hasActiveSession() {
  if (config.mode === 'demo') {
    try {
      return sessionStorage.getItem('luojia.demo.signedIn') === 'true';
    } catch {
      return false;
    }
  }

  try {
    const response = await fetch(`${config.apiBase}/auth/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.code === 0 && Boolean(result.data?.id);
  } catch {
    return false;
  }
}

async function updateAccountButton() {
  const signedIn = await hasActiveSession();
  accountButton.textContent = signedIn ? '我的' : '登录';
  accountButton.dataset.signedIn = String(signedIn);
  accountButton.setAttribute('aria-label', signedIn ? '进入我的信件' : '登录');
}

accountButton.addEventListener('click', () => {
  window.location.href = accountButton.dataset.signedIn === 'true'
    ? 'frontend/#/mine'
    : 'frontend/?login=1#/mailbox';
});
document.querySelector('.icon-button').addEventListener('click', () => showPlaceholder('搜索'));

menuToggle.addEventListener('click', () => {
  const willOpen = !navigation.classList.contains('open');
  navigation.classList.toggle('open', willOpen);
  menuToggle.setAttribute('aria-expanded', String(willOpen));
});

document.addEventListener('click', (event) => {
  if (!navigation.contains(event.target) && !menuToggle.contains(event.target)) {
    navigation.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  }
});

window.addEventListener('pageshow', updateAccountButton);
