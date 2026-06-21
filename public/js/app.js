// App router and initialization

const App = {
  currentPage: null,

  pages: {
    feeds: FeedsPage,
    bookmarks: BookmarksPage,
    report: ReportPage,
  },

  async init() {
    const hash = location.hash.slice(1) || 'feeds';
    await this.navigate(hash);
    window.addEventListener('hashchange', () => {
      const route = location.hash.slice(1) || 'feeds';
      this.navigate(route);
    });
  },

  async navigate(route) {
    const page = this.pages[route];
    if (!page) return this.navigate('feeds');

    // Exit screenshot mode on page change
    document.body.classList.remove('screenshot-mode');
    if (ReportPage.isScreenshotMode) {
      ReportPage.isScreenshotMode = false;
    }

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.route === route);
    });

    this.currentPage = route;
    const container = document.getElementById('app');
    await page.render(container);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
