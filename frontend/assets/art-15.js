(() => {
 const names = ['features','purpose','team'];
 function showPanel(){
  const requested=location.hash.slice(1); const target=names.includes(requested)?requested:'features';
  document.querySelectorAll('.panel').forEach(panel=>{const active=panel.id==='panel-'+target;panel.classList.toggle('active',active);panel.hidden=!active;});
  document.querySelectorAll('[data-target]').forEach(link=>{if(link.dataset.target===target)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  const labels={features:'功能介绍',purpose:'创作初衷',team:'团队介绍'};document.title='珞珈烟火邮局 · '+labels[target];
  window.scrollTo({top:0,behavior:'instant'});
 }
 window.addEventListener('hashchange',showPanel);showPanel();
})();
