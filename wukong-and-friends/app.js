const messages = JSON.parse(document.querySelector('#ui-messages').textContent);
const text = (key, values = {}) => messages[key].replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
const search = document.querySelector('#search');
const parameters = new URLSearchParams(window.location.search);
let series = ['all', 'wukong', 'bear'].includes(parameters.get('series')) ? parameters.get('series') : 'all';
if (search) {
  const buttons = [...document.querySelectorAll('[data-filter]')];
  search.value = parameters.get('q') || '';
  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    document.querySelectorAll('[data-book]').forEach(card => {
      const show = (series === 'all' || card.dataset.series === series) && card.dataset.search.toLocaleLowerCase().includes(query);
      card.hidden = !show;
      if (show) visible++;
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === series)));
    document.querySelector('#empty').hidden = visible > 0;
    document.querySelector('#count').textContent = text(visible === 1 ? 'count_one' : 'count_other', { count: visible });
  }
  search.addEventListener('input', filter);
  buttons.forEach(button => button.addEventListener('click', () => { series = button.dataset.filter; filter(); }));
  filter();
}
document.querySelectorAll('[data-language]').forEach(link => {
  link.addEventListener('click', () => {
    const destination = new URL(link.href);
    destination.hash = window.location.hash;
    const query = search?.value.trim();
    if (query) destination.searchParams.set('q', query);
    if (search && series !== 'all') destination.searchParams.set('series', series);
    link.href = destination.href;
  });
});
const picker = document.querySelector('#verify-file');
if (picker) {
  picker.addEventListener('change', async () => {
    const result = document.querySelector('#result');
    const file = picker.files[0];
    if (!file) return;
    result.hidden = false;
    result.textContent = text('checking');
    try {
      const root = document.body.dataset.assetsRoot || '';
      const [manifestResponse, signatureResponse] = await Promise.all([
        fetch(root + 'provenance/manifest.json'), fetch(root + 'provenance/signature.json')
      ]);
      if (!manifestResponse.ok || !signatureResponse.ok) throw Error(text('records_unavailable'));
      const bytes = await manifestResponse.arrayBuffer();
      const signature = await signatureResponse.json();
      const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', decode(signature.public_key_base64), { name: 'Ed25519' }, false, ['verify']);
      const valid = await crypto.subtle.verify('Ed25519', key, decode(signature.signature_base64), bytes);
      if (!valid) throw Error(text('signature_mismatch'));
      const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const hex = [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
      const manifest = JSON.parse(new TextDecoder().decode(bytes));
      const match = manifest.files.find(entry => entry.sha256 === hex && entry.bytes === file.size);
      result.textContent = (match ? text('verified') + '\n' + match.path : text('no_match')) + '\nSHA-256: ' + hex;
    } catch (error) {
      result.textContent = text('verify_error', { error: error.message });
    }
  });
}

// Download buttons open a thank-you page first; it continues to the file on its own.
// The page also carries a meta refresh, so the download still happens without JavaScript.
const gate = document.querySelector('[data-download-redirect]');
if (gate) {
  const label = document.querySelector('#countdown');
  let remaining = Number(gate.dataset.seconds || 30);
  const tick = () => {
    if (label) label.textContent = text('redirect_countdown', { seconds: remaining });
    if (remaining <= 0) {
      window.location.replace(gate.dataset.downloadRedirect);
      return;
    }
    remaining -= 1;
    window.setTimeout(tick, 1000);
  };
  tick();
}
