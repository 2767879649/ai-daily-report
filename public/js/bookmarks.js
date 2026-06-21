// Bookmarks page

const BookmarksPage = {
  bookmarks: [],
  activeTags: [],
  searchQuery: '',
  editingId: null,

  async render(container) {
    container.innerHTML = '<div class="loading"><span class="spinner"></span>加载中...</div>';

    try {
      this.bookmarks = await API.getBookmarks();
      const filtered = this.filterBookmarks();

      container.innerHTML = `
        ${this.renderToolbar()}
        <div class="bookmark-list" id="bookmark-list">
          ${filtered.length === 0 ? this.renderEmpty() : filtered.map(b => this.renderBookmark(b)).join('')}
        </div>
      `;

      this.bindEvents();
    } catch (err) {
      console.error('Bookmarks render error:', err);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">LOAD FAILED</div>
          <div class="empty-state-desc">${escapeHTML(err.message)}. Check if the server is running.</div>
        </div>
      `;
    }
  },

  renderToolbar() {
    const tagBtns = TAG_KEYS.map(t => {
      const active = this.activeTags.includes(t) ? ' active' : '';
      return `<button class="tag-filter-btn${active}" data-tag="${t}">${TAG_LABELS[t]}</button>`;
    }).join('');

    return `
      <div class="toolbar">
        <div class="search-bar">
          <input type="text" id="search-input" placeholder="搜索..." value="${escapeHTML(this.searchQuery)}">
          ${this.searchQuery ? '<button id="search-clear">&times;</button>' : ''}
        </div>
        <div class="toolbar-divider"></div>
        <div class="tag-filter-bar" id="tag-filter-bar">
          <button class="tag-filter-btn${this.activeTags.length === 0 ? ' active' : ''}" data-tag="">全部</button>
          ${tagBtns}
        </div>
        <button class="btn btn-sm" id="btn-export">EXPORT MD</button>
        <span class="bookmark-count">${this.bookmarks.length} 条</span>
      </div>
    `;
  },

  renderBookmark(b) {
    if (this.editingId === b.id) {
      return this.renderEditForm(b);
    }
    const noteHtml = b.note ? `<div class="bookmark-note">${escapeHTML(b.note)}</div>` : '';
    return `
      <div class="bookmark-card" data-id="${b.id}">
        <div class="bookmark-header">
          <div class="bookmark-title">
            ${b.link ? `<a href="${escapeHTML(b.link)}" target="_blank" rel="noopener">${escapeHTML(b.title)}</a>` : escapeHTML(b.title)}
            ${b.sourceName ? `<span class="bookmark-source-name">&mdash; ${escapeHTML(b.sourceName)}</span>` : ''}
          </div>
        </div>
        <div class="bookmark-tags">${renderTags(b.tags)}</div>
        ${noteHtml}
        <div class="bookmark-meta">
          <span>收藏于 ${formatDate(b.bookmarkedAt)}</span>
          <div class="bookmark-actions">
            <button class="btn btn-sm btn-outline edit-btn" data-id="${b.id}">EDIT</button>
            <button class="btn btn-sm btn-outline delete-btn" data-id="${b.id}">DELETE</button>
          </div>
        </div>
      </div>
    `;
  },

  renderEditForm(b) {
    return `
      <div class="bookmark-card editing" data-id="${b.id}">
        <div class="bookmark-title edit-title">${escapeHTML(b.title)}</div>
        <div class="edit-tags">${renderTagCheckboxes(b.tags)}</div>
        <textarea class="modal-note" id="edit-note-${b.id}" placeholder="备注（可选）" rows="2" maxlength="500">${escapeHTML(b.note || '')}</textarea>
        <div class="modal-actions edit-form-actions">
          <button class="btn btn-sm btn-outline cancel-edit-btn" data-id="${b.id}">CANCEL</button>
          <button class="btn btn-sm btn-primary save-edit-btn" data-id="${b.id}">SAVE</button>
        </div>
      </div>
    `;
  },

  renderEmpty() {
    const hasFilter = this.activeTags.length > 0 || this.searchQuery;
    return `
      <div class="empty-state">
        <div class="empty-state-title">${hasFilter ? 'NO MATCHES' : 'NO BOOKMARKS'}</div>
        <div class="empty-state-desc">
          ${hasFilter ? 'Try different filters or search terms.' : 'Bookmark articles from the feed page.'}
        </div>
      </div>
    `;
  },

  filterBookmarks() {
    let result = [...this.bookmarks];

    if (this.activeTags.length > 0) {
      result = result.filter(b => this.activeTags.some(t => b.tags.includes(t)));
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      result = result.filter(b =>
        b.title.toLowerCase().includes(q) ||
        (b.note && b.note.toLowerCase().includes(q)) ||
        (b.sourceName && b.sourceName.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => new Date(b.bookmarkedAt) - new Date(a.bookmarkedAt));
    return result;
  },

  exportMarkdown() {
    const items = this.filterBookmarks();
    if (items.length === 0) {
      showToast('NO BOOKMARKS TO EXPORT');
      return;
    }

    const now = new Date();
    const ts = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Group by tag
    const groups = {};
    for (const b of items) {
      for (const tag of (b.tags.length ? b.tags : ['未分类'])) {
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(b);
      }
    }

    // Remove duplicates within each group (same bookmark may have multiple tags)
    for (const tag of Object.keys(groups)) {
      const seen = new Set();
      groups[tag] = groups[tag].filter(b => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
    }

    // Sort tags: known tags first, then unknown, "未分类" last
    const tagOrder = [...TAG_KEYS, '未分类'];
    const sortedTags = Object.keys(groups).sort((a, b) => {
      const ai = tagOrder.indexOf(a), bi = tagOrder.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });

    let md = `# AI 灵感日报 — 灵感库导出\n\n`;
    md += `> 导出时间：${ts}\n`;
    md += `> 共 ${items.length} 条收藏\n\n---\n\n`;

    for (const tag of sortedTags) {
      const label = TAG_LABELS[tag] || tag;
      md += `## ${label}\n\n`;
      for (const b of groups[tag]) {
        const date = formatDate(b.bookmarkedAt);
        const source = b.sourceName ? ` — *${b.sourceName}*` : '';
        md += `- **[${b.title}](${b.link || ''})**${source} · ${date}\n`;
        if (b.note) {
          const noteLines = b.note.split('\n');
          md += `  > ${noteLines.join('\n  > ')}\n`;
        }
        md += '\n';
      }
    }

    return { content: md, count: items.length };
  },

  bindEvents() {
    document.querySelectorAll('.tag-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (tag === '') {
          this.activeTags = [];
        } else {
          // Toggle multi-select
          const idx = this.activeTags.indexOf(tag);
          if (idx >= 0) {
            this.activeTags.splice(idx, 1);
          } else {
            this.activeTags.push(tag);
          }
        }
        this.render(document.getElementById('app'));
      });
    });

    const searchInput = document.getElementById('search-input');
    const doSearch = debounce(() => {
      this.searchQuery = searchInput?.value || '';
      this.render(document.getElementById('app'));
    }, 300);
    searchInput?.addEventListener('input', doSearch);
    document.getElementById('search-clear')?.addEventListener('click', () => {
      this.searchQuery = '';
      this.render(document.getElementById('app'));
    });

    document.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editingId = btn.dataset.id;
        this.render(document.getElementById('app'));
      });
    });

    document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.editingId = null;
        this.render(document.getElementById('app'));
      });
    });

    document.querySelectorAll('.save-edit-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const card = document.querySelector(`.bookmark-card[data-id="${id}"]`);
        const tags = [...card.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
        const note = document.getElementById(`edit-note-${id}`)?.value.trim() || '';
        if (tags.length === 0) {
          showToast('SELECT AT LEAST ONE TAG');
          return;
        }
        try {
          await API.updateBookmark(id, { tags, note });
          this.editingId = null;
          showToast('UPDATED');
          await this.render(document.getElementById('app'));
        } catch (err) {
          showToast('UPDATE FAILED');
        }
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('DELETE THIS BOOKMARK?')) return;
        try {
          await API.deleteBookmark(btn.dataset.id);
          showToast('DELETED');
          await this.render(document.getElementById('app'));
        } catch (err) {
          showToast('DELETE FAILED');
        }
      });
    });

    document.getElementById('btn-export')?.addEventListener('click', () => {
      const result = this.exportMarkdown();
      if (!result) return;
      const blob = new Blob([result.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ai-inspiration-${todayStr()}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`EXPORTED ${result.count} ITEMS`);
    });
  },
};
