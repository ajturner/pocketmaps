/**
 * Single-line text editor that shows {placeholders} as chips.
 *
 * The template string stays the source of truth: typing "{name}" turns it into
 * a chip, chips delete as one unit, and `value` always reads back as plain text
 * with braces, e.g. "https://maps.example/?q={latitude},{longitude}".
 */
const PLACEHOLDER = /\{([^{}]+)\}/g;

export function createChipInput(el, { value = '', builtins = [], onChange = () => {} } = {}) {
  el.contentEditable = 'true';
  el.spellcheck = false;
  el.setAttribute('role', 'textbox');
  el.classList.add('chip-input');
  let saved = null;
  const builtinSet = new Set(builtins.map((b) => b.toLowerCase()));

  const chip = (key) => {
    const span = document.createElement('span');
    span.className = `chip-token${builtinSet.has(key.toLowerCase()) ? ' builtin' : ''}`;
    span.contentEditable = 'false';
    span.dataset.key = key;
    span.textContent = key;
    return span;
  };

  function render(text) {
    el.replaceChildren();
    let last = 0;
    for (const m of text.matchAll(PLACEHOLDER)) {
      if (m.index > last) el.append(document.createTextNode(text.slice(last, m.index)));
      el.append(chip(m[1].trim()));
      last = m.index + m[0].length;
    }
    if (last < text.length) el.append(document.createTextNode(text.slice(last)));
  }

  function serialize(node = el) {
    let out = '';
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) out += n.nodeValue;
      else if (n.dataset?.key) out += `{${n.dataset.key}}`;
      else if (n.nodeName !== 'BR') out += serialize(n);
    }
    return out.replace(/ /g, ' ').replace(/[\r\n]+/g, '');
  }

  const caretToEnd = () => {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    saved = r.cloneRange();
  };
  const remember = () => {
    const sel = getSelection();
    if (sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer)) saved = sel.getRangeAt(0).cloneRange();
  };
  const changed = () => onChange(serialize());

  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  el.addEventListener('input', () => {
    // A placeholder typed by hand becomes a chip once its closing brace lands.
    const typed = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && /\{[^{}]+\}/.test(n.nodeValue));
    const stray = [...el.childNodes].some((n) => n.nodeType === Node.ELEMENT_NODE && !n.dataset?.key);
    if (typed || stray) { render(serialize()); caretToEnd(); }
    remember();
    changed();
  });
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = (e.clipboardData?.getData('text/plain') || '').replace(/[\r\n]+/g, '');
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    r.insertNode(document.createTextNode(text));
    render(serialize());
    caretToEnd();
    changed();
  });
  for (const ev of ['keyup', 'mouseup', 'blur']) el.addEventListener(ev, remember);

  render(value);

  return {
    get value() { return serialize(); },
    set value(v) { render(v || ''); },
    /** Insert a placeholder chip at the caret (or at the end). */
    insert(key) {
      const node = chip(key);
      let r = saved && el.contains(saved.commonAncestorContainer) ? saved : null;
      if (!r) { r = document.createRange(); r.selectNodeContents(el); r.collapse(false); }
      r.deleteContents();
      r.insertNode(node);
      const after = document.createRange();
      after.setStartAfter(node);
      after.collapse(true);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(after);
      saved = after.cloneRange();
      el.focus();
      changed();
    },
  };
}
