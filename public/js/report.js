// Newspaper-style daily report

const ReportPage = {
  isScreenshotMode: false,
  currentDate: todayStr(),

  async render(container) {
    container.innerHTML = '<div class="loading"><span class="spinner"></span>排版中...</div>';

    try {
      const [articles, bookmarks] = await Promise.all([
        API.getArticles(this.currentDate),
        API.getBookmarks(),
      ]);

      const todayArticles = articles
        .filter(a => formatDate(a.publishedAt) === this.currentDate)
        .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

      const todayBookmarks = bookmarks
        .filter(b => formatDate(b.bookmarkedAt) === this.currentDate);

      container.innerHTML = `
        <div class="toolbar report-toolbar">
          <select class="date-picker" id="report-date-picker">
            ${renderDateOptions(this.currentDate)}
          </select>
          <div class="toolbar-divider"></div>
          <button class="btn btn-sm" id="btn-screenshot">SCREENSHOT</button>
          <button class="btn btn-sm" id="btn-print">PRINT</button>
        </div>
        <div class="report-container" id="report-container">
          ${this.renderMasthead(todayArticles.length + todayBookmarks.length)}
          <div class="newspaper-columns${todayArticles.length > 8 ? ' triple' : ''}" id="newspaper-content">
            ${this.renderNewsSection(todayArticles)}
            ${this.renderBookmarkSection(todayBookmarks)}
            ${todayArticles.length === 0 && todayBookmarks.length === 0 ? this.renderEmpty() : ''}
          </div>
          <div class="report-footer">
            AI INSPIRATION DAILY &middot; ${new Set(todayArticles.map(a => a.sourceName)).size} SOURCES
          </div>
        </div>
      `;

      this.bindEvents();
    } catch (err) {
      console.error('Report render error:', err);
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">LOAD FAILED</div>
          <div class="empty-state-desc">${escapeHTML(err.message)}. Check if the server is running.</div>
        </div>
      `;
    }
  },

  renderMasthead(itemCount) {
    const chineseDate = formatChineseDate(this.currentDate);
    const epoch = new Date('2026-01-01');
    const today = new Date(this.currentDate);
    const issueNum = Math.floor((today - epoch) / (1000 * 60 * 60 * 24)) + 1;

    return `
      <div class="masthead">
        <div class="masthead-title">AI Inspiration Daily</div>
        <div class="masthead-date">${chineseDate}</div>
        <div class="masthead-issue">NO. ${String(issueNum).padStart(3, '0')} &middot; ${itemCount} STORIES</div>
        <div class="m-stripe"></div>
        <div class="masthead-divider">AI INSPIRATION DAILY &middot; POWERED BY RSS</div>
      </div>
    `;
  },

  renderNewsSection(articles) {
    if (articles.length === 0) return '';
    const items = articles.map((a, idx) => {
      const summaryClass = a.summary ? ' has-summary' : '';
      return `
      <div class="news-item${idx === 0 ? ' first-item' : ''}">
        <div class="news-item-meta">${escapeHTML(a.sourceName)} &middot; ${formatTime(a.publishedAt)}</div>
        <div class="news-item-title">
          <a href="${escapeHTML(a.link)}" target="_blank" rel="noopener">${escapeHTML(a.title)}</a>
        </div>
        ${a.summary ? `<div class="news-item-summary${summaryClass}">${escapeHTML(truncate(a.summary, 150))}</div>` : ''}
      </div>`;
    }).join('');

    return `
      <div class="newspaper-section">
        <div class="section-header">Today&rsquo;s Briefing</div>
        ${items}
      </div>
    `;
  },

  renderBookmarkSection(bookmarks) {
    if (bookmarks.length === 0) return '';
    const items = bookmarks.map(b => `
      <div class="report-bookmark">
        <div class="report-bookmark-title">${escapeHTML(b.title)}</div>
        <div class="report-bookmark-tags">${renderTags(b.tags)}</div>
        ${b.note ? `<div class="report-bookmark-note">${escapeHTML(b.note)}</div>` : ''}
      </div>
    `).join('');

    return `
      <div class="newspaper-section">
        <div class="section-header">Inspiration Log</div>
        ${items}
      </div>
    `;
  },

  renderEmpty() {
    return `
      <div class="newspaper-section" style="text-align:center;padding:var(--space-xxl) 0;">
        <p style="color:var(--color-muted);font-family:var(--font-display);font-size:var(--text-title-md);font-weight:700;text-transform:uppercase;">
          NO CONTENT TODAY
        </p>
        <p style="color:var(--color-muted);font-size:var(--text-body-sm);font-weight:300;">
          Refresh feeds or bookmark articles first.
        </p>
      </div>
    `;
  },

  bindEvents() {
    document.getElementById('report-date-picker')?.addEventListener('change', (e) => {
      this.currentDate = e.target.value;
      this.render(document.getElementById('app'));
    });

    document.getElementById('btn-screenshot')?.addEventListener('click', () => {
      this.isScreenshotMode = !this.isScreenshotMode;
      const btn = document.getElementById('btn-screenshot');
      if (this.isScreenshotMode) {
        document.body.classList.add('screenshot-mode');
        btn.textContent = 'EXIT SCREENSHOT';
        btn.classList.add('btn-primary');
        showToast('SCREENSHOT MODE: CHROME HIDDEN');
      } else {
        document.body.classList.remove('screenshot-mode');
        btn.textContent = 'SCREENSHOT';
        btn.classList.remove('btn-primary');
      }
    });

    document.getElementById('btn-print')?.addEventListener('click', () => {
      document.body.classList.add('screenshot-mode');
      // Wait for styles to apply before printing
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.print();
        });
      });
      // Restore after print dialog closes
      const onAfterPrint = () => {
        if (!this.isScreenshotMode) {
          document.body.classList.remove('screenshot-mode');
        }
        window.removeEventListener('afterprint', onAfterPrint);
      };
      window.addEventListener('afterprint', onAfterPrint);
    });
  },
};
