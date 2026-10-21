/* One finalized page at a time. No PDF runtime, third-party viewer, or eager book download. */
(() => {
  const root = document.querySelector('[data-native-reader]');
  if (!root) return;
  const pages = JSON.parse(document.querySelector('#reader-data').textContent).pages;
  const panel = root.querySelector('[data-reader-panel]');
  const slot = root.querySelector('[data-reader-slot]');
  const dialog = root.querySelector('dialog');
  const image = root.querySelector('[data-reader-image]');
  const leaf = root.querySelector('[data-reader-leaf]');
  const stage = root.querySelector('[data-reader-stage]');
  const links = root.querySelector('[data-reader-links]');
  const pageText = root.querySelector('[data-reader-text]');
  const previous = root.querySelector('[data-reader-previous]');
  const next = root.querySelector('[data-reader-next]');
  const select = root.querySelector('[data-reader-select]');
  const progress = root.querySelector('progress');
  const status = root.querySelector('[data-reader-status]');
  const failure = root.querySelector('[data-reader-error]');
  const expand = root.querySelector('[data-reader-expand]');
  const openers = [...document.querySelectorAll('[data-reader-open]')];
  let opened = false;
  let index = -1;
  let ticket = 0;
  let failed = false;
  let pointer = null;
  const touches = new Set();
  let warmed = null;

  const label = i => text('reader_page_status', { page: i + 1, count: pages.length });
  function reflectPage() {
    const url = new URL(window.location.href);
    if (index > 0) url.searchParams.set('page', String(index + 1));
    else url.searchParams.delete('page');
    url.hash = 'reader';
    window.history.replaceState(null, '', url);
  }
  function showPage(number, reflect = true, retry = false) {
    const target = Math.max(0, Math.min(pages.length - 1, number));
    if (target === index && !retry && !failed) return;
    index = target;
    const request = ++ticket;
    const page = pages[index];
    previous.disabled = index === 0;
    next.disabled = index === pages.length - 1;
    if ((document.activeElement === previous && previous.disabled) ||
        (document.activeElement === next && next.disabled)) stage.focus({ preventScroll: true });
    select.value = String(index + 1);
    progress.value = index + 1;
    progress.setAttribute('aria-valuetext', label(index));
    failure.hidden = true;
    if (links.contains(document.activeElement)) stage.focus({ preventScroll: true });
    links.replaceChildren();
    leaf.classList.add('is-loading');
    stage.setAttribute('aria-busy', 'true');
    status.textContent = text('reader_loading');
    if (reflect) reflectPage();
    const candidate = new Image();
    const source = new URL(page.src, window.location.href);
    if (retry) source.searchParams.set('retry', String(Date.now()));
    candidate.onload = async () => {
      try { await candidate.decode(); } catch { /* onload already confirms usable image bytes. */ }
      if (request !== ticket) return;
      image.src = source.href;
      image.width = page.width;
      image.height = page.height;
      image.alt = label(index);
      image.hidden = false;
      pageText.textContent = page.text;
      page.links.forEach(link => {
        const anchor = document.createElement('a');
        anchor.className = 'reader-hotspot';
        anchor.href = link.href;
        anchor.setAttribute('aria-label', link.label);
        const [left, top, right, bottom] = link.rect;
        Object.assign(anchor.style, { left: `${left * 100}%`, top: `${top * 100}%`,
          width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%` });
        if (link.external) { anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; }
        links.append(anchor);
      });
      failed = false;
      leaf.classList.remove('is-loading');
      stage.setAttribute('aria-busy', 'false');
      status.textContent = label(index);
      // At most one page ahead, only after the visible page is ready.
      if (pages[index + 1]) { warmed = new Image(); warmed.src = pages[index + 1].src; }
    };
    candidate.onerror = () => {
      if (request !== ticket) return;
      failed = true;
      image.hidden = true;
      pageText.textContent = '';
      leaf.classList.remove('is-loading');
      stage.setAttribute('aria-busy', 'false');
      failure.hidden = false;
      status.textContent = text('reader_load_error');
    };
    candidate.src = source.href;
  }
  previous.addEventListener('click', () => showPage(index - 1));
  next.addEventListener('click', () => showPage(index + 1));
  select.addEventListener('change', () => showPage(Number(select.value) - 1));
  root.querySelector('[data-reader-retry]').addEventListener('click', () => showPage(index, false, true));
  // Keyboard shortcuts apply only while focus is inside this reader.
  panel.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        event.target.closest('select,input,textarea,[contenteditable="true"]')) return;
    const destination = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: pages.length - 1 }[event.key];
    if (destination === undefined) return;
    event.preventDefault();
    showPage(destination);
  });
  stage.addEventListener('pointerdown', event => {
    if (!['touch', 'pen'].includes(event.pointerType)) return;
    touches.add(event.pointerId);
    pointer = touches.size === 1 && !event.target.closest('a,button,select')
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  });
  stage.addEventListener('pointercancel', event => { touches.delete(event.pointerId); pointer = null; });
  stage.addEventListener('pointerup', event => {
    touches.delete(event.pointerId);
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4) showPage(index + (dx < 0 ? 1 : -1));
  });
  expand.addEventListener('click', () => {
    if (dialog.open) { dialog.close(); return; }
    // Keep the document's height stable while the reader moves into the modal.
    slot.style.minHeight = `${panel.offsetHeight}px`;
    dialog.append(panel);
    dialog.showModal();
    document.body.classList.add('reader-dialog-open');
    expand.textContent = text('reader_close');
    expand.setAttribute('aria-expanded', 'true');
    expand.focus();
  });
  dialog.addEventListener('close', () => {
    slot.append(panel);
    slot.style.minHeight = '';
    document.body.classList.remove('reader-dialog-open');
    expand.textContent = text('reader_expand');
    expand.setAttribute('aria-expanded', 'false');
    expand.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll('[data-language]').forEach(link => {
    link.addEventListener('click', () => {
      const destination = new URL(link.href);
      if (index > 0) destination.searchParams.set('page', String(index + 1));
      else destination.searchParams.delete('page');
      link.href = destination.href;
    });
  });
  const fromURL = () => {
    const value = Number(new URL(window.location.href).searchParams.get('page'));
    return Number.isInteger(value) && value > 0 && value <= pages.length ? value - 1 : 0;
  };
  function openReader(scroll = false) {
    root.hidden = false;
    openers.forEach(opener => opener.setAttribute('aria-expanded', 'true'));
    if (!opened) {
      opened = true;
      showPage(fromURL(), false);
    }
    if (scroll) {
      stage.focus({ preventScroll: true });
      root.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }
  openers.forEach(opener => {
    opener.setAttribute('aria-expanded', 'false');
    opener.addEventListener('click', event => {
      event.preventDefault();
      const url = new URL(window.location.href);
      url.hash = 'reader';
      window.history.replaceState(null, '', url);
      openReader(true);
    });
  });
  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#reader') openReader(true);
  });
  window.addEventListener('popstate', () => {
    if (window.location.hash === '#reader' || new URL(window.location.href).searchParams.has('page')) openReader();
    if (opened) showPage(fromURL(), false);
  });
  root.querySelectorAll('[data-reader-enhanced]').forEach(element => { element.hidden = false; });
  if (typeof dialog.showModal !== 'function') expand.hidden = true;
  if (new URL(window.location.href).hash === '#reader' || new URL(window.location.href).searchParams.has('page')) openReader();
  else root.hidden = true;
})();
