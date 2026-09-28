// Mditoor website: header state, the interactive app mock, OS detection,
// and live release info from GitHub.
(function () {
  var REPO = 'ezzdin-atef/mditoor';
  var RELEASES_URL = 'https://github.com/' + REPO + '/releases';

  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 4); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var code = btn.closest('.code-block').querySelector('code');
      if (!code || !navigator.clipboard) return;
      navigator.clipboard.writeText(code.textContent).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1500);
      });
    });
  });

  // ---- Interactive app mock (landing page) ----
  var mock = document.querySelector('[data-mock]');
  if (mock) {
    var tabs = Array.prototype.slice.call(mock.querySelectorAll('[data-tab]'));
    var selectTab = function (tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).classList.toggle('active', on);
      });
    };
    tabs.forEach(function (tab, i) {
      tab.tabIndex = i === 0 ? 0 : -1;
      tab.addEventListener('click', function () { selectTab(tab); });
      tab.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        var next = tabs[(i + d + tabs.length) % tabs.length];
        selectTab(next);
        next.focus();
      });
    });

    var WORKSPACES = [
      { icon: '📝', name: 'Personal blog', path: '~/code/my-site/content/posts', posts: 6 },
      { icon: '📚', name: 'Docs site', path: '~/work/docs/blog', posts: 14 },
      { icon: '🏢', name: 'Company blog', path: '~/work/www/src/content/blog', posts: 23 }
    ];
    var wsButtons = mock.querySelectorAll('[data-ws]');
    wsButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ws = WORKSPACES[Number(btn.getAttribute('data-ws'))];
        wsButtons.forEach(function (b) { b.classList.toggle('selected', b === btn); });
        mock.querySelector('[data-mock-icon]').textContent = ws.icon;
        mock.querySelector('[data-mock-name]').textContent = ws.name;
        mock.querySelector('[data-mock-path]').textContent = ws.path;
        mock.querySelector('[data-mock-count]').textContent = String(ws.posts);
        mock.querySelector('[data-mock-title]').textContent = 'Mditoor — ' + ws.name;
        var body = mock.querySelector('.page-body');
        body.style.animation = 'none';
        void body.offsetWidth;
        body.style.animation = 'slide-up 0.24s cubic-bezier(0.2, 0.8, 0.3, 1) both';
      });
    });
  }

  // ---- Release info (both pages) ----
  function formatSize(bytes) { return (bytes / (1024 * 1024)).toFixed(1) + ' MB'; }
  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return iso.slice(0, 10); }
  }
  function setField(name, value) {
    document.querySelectorAll('[data-field="' + name + '"]').forEach(function (el) { el.textContent = value; });
  }
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  var releaseBadge = document.querySelector('[data-release-badge]');
  var platforms = document.querySelector('.platforms');
  if (!releaseBadge && !platforms) return;

  if (platforms) {
    var p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '').toLowerCase();
    var os = p.indexOf('win') !== -1 ? 'windows'
      : (p.indexOf('mac') !== -1 || /iphone|ipad/.test(p)) ? 'mac'
      : (p.indexOf('linux') !== -1 || p.indexOf('x11') !== -1) ? 'linux' : null;
    var card = os && platforms.querySelector('[data-os="' + os + '"]');
    if (card) {
      card.classList.add('detected');
      if (os !== 'windows') platforms.insertBefore(card, platforms.firstChild);
    }
  }

  function fallback() {
    if (!platforms) return;
    setField('version', 'Latest');
    setField('file', 'See GitHub Releases');
    setField('size', '~4 MB');
    setField('date', '-');
    var list = document.querySelector('[data-releases]');
    if (list) {
      list.innerHTML = '';
      var row = el('div', 'release-row empty', 'Could not load the release list.');
      var a = el('a', 'link', 'View on GitHub');
      a.href = RELEASES_URL;
      row.appendChild(a);
      list.appendChild(row);
    }
  }

  fetch('https://api.github.com/repos/' + REPO + '/releases?per_page=10', {
    headers: { Accept: 'application/vnd.github+json' }
  })
    .then(function (res) { if (!res.ok) throw new Error(res.status); return res.json(); })
    .then(function (releases) {
      var published = releases.filter(function (r) { return !r.draft; });
      var latest = published.find(function (r) { return !r.prerelease; }) || published[0];
      if (!latest) throw new Error('no releases');

      if (releaseBadge) {
        releaseBadge.textContent = latest.tag_name + ' is out · Free & open source';
      }
      if (!platforms) return;

      var assets = latest.assets || [];
      var exe = assets.find(function (a) { return /windows.*\.exe$/i.test(a.name); }) ||
        assets.find(function (a) { return /\.exe$/i.test(a.name); });

      setField('version', latest.tag_name);
      setField('date', formatDate(latest.published_at));
      if (exe) {
        setField('file', exe.name);
        setField('file-inline', exe.name);
        setField('size', formatSize(exe.size));
        var btn = document.querySelector('[data-download]');
        btn.href = exe.browser_download_url;
        btn.querySelector('[data-download-label]').textContent = 'Download ' + latest.tag_name + ' for Windows';
      } else {
        setField('file', 'See release page');
        setField('size', '-');
      }

      var summary = document.querySelector('[data-release-summary]');
      if (summary) summary.textContent = 'Latest version: ' + latest.tag_name + ', released ' + formatDate(latest.published_at) + '.';

      var list = document.querySelector('[data-releases]');
      list.innerHTML = '';
      published.forEach(function (r) {
        var row = el('div', 'release-row');
        row.appendChild(el('span', 'tag', r.tag_name));
        if (r === latest) row.appendChild(el('span', 'badge badge-green', 'Latest'));
        if (r.prerelease) row.appendChild(el('span', 'badge badge-orange', 'Pre-release'));
        row.appendChild(el('span', 'date', formatDate(r.published_at)));
        var a = el('a', 'link', 'Notes & files');
        a.href = r.html_url;
        row.appendChild(a);
        list.appendChild(row);
      });
    })
    .catch(fallback);
})();
