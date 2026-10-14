const toast = document.querySelector('.toast');
const menuToggle = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');
let toastTimer;

function showPlaceholder(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = `${message}功能将在后续页面中接入`;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => showPlaceholder(button.dataset.action));
});

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    navigation.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    if (button.textContent.trim() !== '首页') showPlaceholder(button.textContent.trim());
  });
});

document.querySelector('.login-button').addEventListener('click', () => showPlaceholder('登录'));
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
