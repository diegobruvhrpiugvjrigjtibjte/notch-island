const demo = document.querySelector('#island-demo');
const demoText = document.querySelector('#demo-text');
const phrases = ['Passa qui sopra', 'Claude sta lavorando', 'Ti ascolto…', 'Musica in riproduzione'];
let phrase = 0;
setInterval(() => { if (!demo.matches(':hover') && !demo.classList.contains('open')) { phrase = (phrase + 1) % phrases.length; demoText.textContent = phrases[phrase]; } }, 2600);
demo.addEventListener('click', () => demo.classList.toggle('open'));
demo.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); demo.click(); } });
document.addEventListener('pointermove', (e) => {
  const r = demo.getBoundingClientRect();
  const x = Math.max(-2.4, Math.min(2.4, (e.clientX - (r.left + r.width / 2)) / 90));
  const y = Math.max(-1.8, Math.min(1.8, (e.clientY - (r.top + 28)) / 90));
  document.querySelectorAll('.eye').forEach(eye => eye.style.transform = `translate(${x}px,${y}px)`);
});
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
document.querySelectorAll('.magnetic').forEach(el => {
  el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${(e.clientX-r.left-r.width/2)*.06}px,${(e.clientY-r.top-r.height/2)*.1}px)`; });
  el.addEventListener('pointerleave', () => el.style.transform = '');
});
