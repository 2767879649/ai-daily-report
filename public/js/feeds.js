// Feeds page

const FeedsPage = {
  currentDate: todayStr(),
  excludedSources: [],
  allSources: [],
  bookmarkedIds: new Set(),
  _abortController: null,
  _documentClickHandler: null,

  async render(container) {
    // Cancel any in-flight request
    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    container.innerHTML = '<div class="loading"><span class="spinner"></span>加载中...</div>';

    try {
      const [articles, feeds, bookmarks] = await Promise.all([
        API.getArticles(this.currentDate),
        API.getFeeds(),
        API.getBookmarks(),
      ]);

      this.allSources = feeds;
      this.bookmarkedIds = new Set(bookmarks.map(b => b.articleId));
      const filtered = this.filterArticles(articles);

      container.innerHTML = `
        ${this.renderToolbar()}
        <div class="article-list" id="article-list">
          ${filtered.length === 0 ? this.renderEmpty() : filtered.map(a => this.renderArticle(a)).join('')}
        </div>
        <div class="refresh-time" id="refresh-time"></div>
      `;

      this.bindEvents();
      this.updateRefreshTime(articles);
    } catch (err) {
      console.error('Feeds render error:', err);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">LOAD FAILED</div>
          <div class="empty-state-desc">${escapeHTML(err.message)}. Check if the server is running.</div>
        </div>
      `;
    }
  },

  renderToolbar() {
    const dateOptions = renderDateOptions(this.currentDate);

    const sourceOptions = this.allSources.map(s => {
      const checked = this.excludedSources.length === 0 || !this.excludedSources.includes(s.id) ? ' checked' : '';
      return `<label><input type="checkbox" value="${s.id}"${checked}> ${escapeHTML(s.name)}</label>`;
    }).join('');

    const filterLabel = this.excludedSources.length
      ? `来源 (${this.allSources.length - this.excludedSources.length}/${this.allSources.length})`
      : '来源';

    return `
      <div class="toolbar">
        <button class="btn btn-primary" id="btn-refresh">REFRESH</button>
        <div class="toolbar-divider"></div>
        <select class="date-picker" id="date-picker">${dateOptions}</select>
        <div class="source-filter" id="source-filter">
          <button class="btn source-filter-toggle" id="source-toggle">${filterLabel}</button>
          <div class="source-dropdown" id="source-dropdown">
            ${sourceOptions}
          </div>
        </div>
      </div>
    `;
  },

  renderArticle(a) {
    const isBookmarked = this.bookmarkedIds.has(a.id);
    const starClass = isBookmarked ? 'bookmarked' : '';
    const starSymbol = isBookmarked ? '★' : '☆';
    const starTitle = isBookmarked ? '已收藏' : '收藏';
    const langLabel = a.lang === 'zh' ? '中文' : 'EN';

    return `
      <div class="article-card" data-id="${a.id}">
        <div class="article-main">
          <div class="article-meta">
            <span class="article-source">${escapeHTML(a.sourceName)}</span>
            <span class="article-time">${formatTime(a.publishedAt)}</span>
            <span class="article-lang-tag">${langLabel}</span>
          </div>
          <div class="article-title">
            <a href="${escapeHTML(a.link)}" target="_blank" rel="noopener">${escapeHTML(a.title)}</a>
          </div>
          ${a.summary ? `<div class="article-summary">${escapeHTML(a.summary)}</div>` : ''}
        </div>
        <div class="article-actions">
          <button class="btn-icon btn-bookmark ${starClass}" data-id="${a.id}" data-title="${escapeHTML(a.title)}" data-link="${escapeHTML(a.link)}" data-source="${escapeHTML(a.sourceName)}" title="${starTitle}">${starSymbol}</button>
        </div>
      </div>
    `;
  },

  renderEmpty() {
    return `
      <div class="empty-state">
        <div class="empty-state-title">NO ARTICLES</div>
        <div class="empty-state-desc">Click REFRESH to fetch the latest, or switch dates.</div>
      </div>
    `;
  },

  filterArticles(articles) {
    let filtered = articles.filter(a => formatDate(a.publishedAt) === this.currentDate);
    if (this.excludedSources.length > 0) {
      filtered = filtered.filter(a => !this.excludedSources.includes(a.sourceId));
    }
    filtered.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    return filtered;
  },

  updateRefreshTime(articles) {
    const el = document.getElementById('refresh-time');
    if (!el) return;
    const times = articles.map(a => a.fetchedAt).filter(Boolean).sort();
    if (times.length > 0) {
      const t = new Date(times[times.length - 1]);
      el.textContent = `最近更新：${t.toLocaleString('zh-CN')}`;
    }
  },

  bindEvents() {
    // Clean up previous document-level handler
    if (this._documentClickHandler) {
      document.removeEventListener('click', this._documentClickHandler);
    }

    document.getElementById('btn-refresh')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-refresh');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> FETCHING...';
      try {
        const result = await API.refresh();
        showToast(`${result.newCount} NEW ARTICLES`);
        await this.render(document.getElementById('app'));
      } catch (err) {
        showToast('FETCH FAILED');
      } finally {
        btn.disabled = false;
        btn.textContent = 'REFRESH';
      }
    });

    document.getElementById('date-picker')?.addEventListener('change', (e) => {
      this.currentDate = e.target.value;
      this.render(document.getElementById('app'));
    });

    const sourceToggle = document.getElementById('source-toggle');
    const sourceDropdown = document.getElementById('source-dropdown');

    sourceToggle?.addEventListener('click', () => {
      sourceDropdown.classList.toggle('open');
    });

    this._documentClickHandler = (e) => {
      if (!document.getElementById('source-filter')?.contains(e.target)) {
        sourceDropdown?.classList.remove('open');
      }
    };
    document.addEventListener('click', this._documentClickHandler);

    sourceDropdown?.addEventListener('change', () => {
      const checks = sourceDropdown.querySelectorAll('input[type="checkbox"]');
      this.excludedSources = [];
      checks.forEach(c => {
        if (!c.checked) this.excludedSources.push(c.value);
      });
      if (this.excludedSources.length >= this.allSources.length) {
        this.excludedSources = [];
      }
      this.render(document.getElementById('app'));
    });

    document.querySelectorAll('.btn-bookmark').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (this.bookmarkedIds.has(id)) {
          showToast('ALREADY BOOKMARKED');
          return;
        }
        this.showBookmarkModal({
          articleId: id,
          title: btn.dataset.title,
          link: btn.dataset.link,
          sourceName: btn.dataset.source,
        }, btn);
      });
    });
  },

  showBookmarkModal(article, btn) {
    const modal = document.getElementById('tag-modal');
    document.getElementById('modal-article-title').textContent = article.title;

    // Populate tag checkboxes using shared helper
    const tagGroup = modal.querySelector('.tag-group');
    tagGroup.innerHTML = renderTagCheckboxes([]);

    document.getElementById('modal-note').value = '';

    // Focus trap: move focus into modal
    const firstCheckbox = modal.querySelector('input[type="checkbox"]');
    if (firstCheckbox) firstCheckbox.focus();

    modal.classList.remove('hidden');

    const cleanup = () => {
      modal.classList.add('hidden');
      document.getElementById('modal-cancel')?.removeEventListener('click', cleanup);
      document.getElementById('modal-confirm')?.removeEventListener('click', handler);
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('click', onOverlayClick);
      // Return focus to trigger button
      if (btn) btn.focus();
    };

    const handler = async () => {
      const tags = [...modal.querySelectorAll('input[type="checkbox"]:checked')].map(c => c.value);
      const note = document.getElementById('modal-note').value.trim();
      if (tags.length === 0) {
        showToast('SELECT AT LEAST ONE TAG');
        return;
      }
      try {
        await API.createBookmark({
          articleId: article.articleId,
          title: article.title,
          link: article.link,
          sourceName: article.sourceName,
          tags,
          note,
        });
        this.bookmarkedIds.add(article.articleId);
        if (btn) {
          btn.classList.add('bookmarked');
          btn.innerHTML = '★';
          btn.title = '已收藏';
        }
        showToast('BOOKMARKED');
        cleanup();
      } catch (err) {
        showToast('BOOKMARK FAILED');
      }
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    };

    const onOverlayClick = (e) => {
      if (e.target === modal) cleanup();
    };

    document.getElementById('modal-cancel').addEventListener('click', cleanup);
    document.getElementById('modal-confirm').addEventListener('click', handler);
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('click', onOverlayClick);
  },
};
