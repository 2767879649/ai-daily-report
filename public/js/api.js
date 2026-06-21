// API request wrapper

const API = {
  async request(url, options = {}) {
    const res = await fetch(url, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },

  async getFeeds() {
    return this.request('/api/feeds');
  },

  async refresh() {
    return this.request('/api/refresh', { method: 'POST' });
  },

  async getArticles(date) {
    const url = date ? `/api/articles?date=${date}` : '/api/articles';
    return this.request(url);
  },

  async getBookmarks() {
    return this.request('/api/bookmarks');
  },

  async createBookmark(data) {
    return this.request('/api/bookmarks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async updateBookmark(id, data) {
    return this.request(`/api/bookmarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async deleteBookmark(id) {
    return this.request(`/api/bookmarks/${id}`, { method: 'DELETE' });
  },
};
