// Each clip stays independent; only the visible clip is loaded and played.
const banner = document.querySelector('[data-banner]');
if (banner) {
  const videos = [...banner.querySelectorAll('video')];
  const toggle = banner.querySelector('[data-banner-toggle]');
  const selectors = [...banner.querySelectorAll('[data-banner-select]')];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const failed = new Set();
  let active = 0;
  let paused = motion.matches;
  let request = 0;

  function controls() {
    toggle.textContent = paused ? toggle.dataset.playLabel : toggle.dataset.pauseLabel;
    selectors.forEach((button, index) => button.setAttribute('aria-pressed', String(index === active)));
  }
  function stop() {
    request++;
    videos[active].pause();
  }
  async function play() {
    if (paused || document.hidden || failed.has(active)) return;
    const video = videos[active];
    if (!video.src) {
      video.src = video.dataset.src;
      video.load();
    }
    video.muted = true;
    const attempt = ++request;
    try {
      await video.play();
      // A delayed play result must not restart a hidden clip.
      if (attempt !== request && (video !== videos[active] || paused || document.hidden)) video.pause();
    } catch {
      if (attempt === request) { paused = true; controls(); }
    }
  }
  function select(index) {
    if (index === active) return;
    stop();
    videos[active].currentTime = 0;
    videos[active].hidden = true;
    active = index;
    videos[active].hidden = false;
    controls();
    play();
  }
  function next() {
    for (let step = 1; step <= videos.length; step++) {
      const index = (active + step) % videos.length;
      if (!failed.has(index)) {
        if (index === active) { videos[active].currentTime = 0; play(); }
        else select(index);
        return;
      }
    }
    paused = true;
    stop();
    controls();
  }
  videos.forEach((video, index) => {
    video.addEventListener('ended', () => { if (index === active && !paused) next(); });
    video.addEventListener('error', () => {
      failed.add(index);
      if (index === active) next();
    });
  });
  toggle.addEventListener('click', () => {
    paused = !paused;
    if (paused) stop();
    else {
      if (failed.has(active)) { failed.clear(); videos[active].removeAttribute('src'); }
      play();
    }
    controls();
  });
  selectors.forEach((button, index) => button.addEventListener('click', () => select(index)));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else play(); });
  motion.addEventListener('change', event => {
    if (event.matches) { paused = true; stop(); controls(); }
  });
  banner.querySelector('[data-banner-controls]').hidden = false;
  controls();
  play();
}
