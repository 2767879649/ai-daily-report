// Utility functions

function formatTime(iso) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatDate(iso) {
  return iso.slice(0, 10);
}

function formatChineseDate(dateStr) {
  const d = new Date(dateStr);
  const digits = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  function toChinese(num) {
    if (num <= 10) return digits[num];
    if (num < 20) return '十' + (num % 10 === 0 ? '' : digits[num % 10]);
    if (num < 30) return '二十' + (num % 10 === 0 ? '' : digits[num % 10]);
    if (num < 40) return '三十' + (num % 10 === 0 ? '' : digits[num % 10]);
    return String(num);
  }

  const yearStr = String(year).split('').map(d => digits[+d]).join('');
  return `${yearStr}年${toChinese(month)}月${toChinese(day)}日`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHTML(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Shared date picker options (last 7 days)
function renderDateOptions(currentDate) {
  const options = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const val = d.toISOString().slice(0, 10);
    const label = i === 0 ? `今天 (${val})` : val;
    const sel = val === currentDate ? ' selected' : '';
    options.push(`<option value="${val}"${sel}>${label}</option>`);
  }
  return options.join('');
}

// Tag helpers
const TAG_LABELS = { topic: '选题', tool: '工具', case: '案例', idea: '想法' };
const TAG_CLASSES = { topic: 'tag-topic', tool: 'tag-tool', case: 'tag-case', idea: 'tag-idea' };
const TAG_KEYS = Object.keys(TAG_LABELS);

function renderTags(tags) {
  return tags.map(t => {
    const label = TAG_LABELS[t] || t;
    const cls = TAG_CLASSES[t] || '';
    return `<span class="bookmark-tag ${cls}">${escapeHTML(label)}</span>`;
  }).join('');
}

function renderTagCheckboxes(checkedTags) {
  return TAG_KEYS.map(key => {
    const checked = checkedTags.includes(key) ? ' checked' : '';
    return `<label class="tag-chip">
      <input type="checkbox" value="${key}"${checked}> ${TAG_LABELS[key]}
    </label>`;
  }).join('');
}

// Show toast message
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
}
