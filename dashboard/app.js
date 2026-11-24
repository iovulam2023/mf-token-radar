// Token Radar dashboard (model radar-2). Reads window.RADAR, written beside dashboard/ by
// main.ts from the same board board.json carries, and renders the ranked board, search and
// category/chain filters, a per-protocol detail view with the model's arithmetic and the farm
// plan, a live-token view, and the methodology. No network: every byte shown is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'expected', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // The model in two lines: the page recomputes a row from its stored parts and checks the
  // numbers board.json carries, so the code and the data are visibly the same arithmetic.
  function impliedTokenOf(row) { return Math.max(1, Math.round(row.tvl_usd * row.peer_multiple * row.growth_multiplier)); }
  function expectedOf(row) { return Math.max(1, Math.round(row.implied_token_value_usd * row.likelihood)); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorised') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'token') { av = a.implied_token_value_usd; bv = b.implied_token_value_usd; }
      else if (key === 'likelihood') { av = a.likelihood; bv = b.likelihood; }
      else if (key === 'evf') { av = a.ev_per_farmer_usd; bv = b.ev_per_farmer_usd; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('span', null, 'DefiLlama protocol index, frozen'),
        el('span', null, 'Model ', el('b', { text: DATA.model_version }))
      )
    );
  }

  function lede() {
    var totalEv = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', null, DATA.board_size + ' pre-token protocols, ranked by ', el('em', { text: 'expected value' })),
        el('p', { text: 'Each row answers two questions: what would this protocol\'s token be worth if it launched at the value its token-bearing peers trade at, and how likely is a launch worth farming? Expected value is the product of the two. The watchlist of ' + DATA.watchlist_size + ' is the floor, never the ceiling: the early radar adds ' + DATA.early_size + ' launch candidates below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor. An implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Board rows' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Total expected value' }), el('b', { text: fmtUsd(totalEv) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live tokens set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorised'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(id, label, values, current, allLabel, onChange) {
      var s = el('select', { id: id, 'aria-label': label },
        el('option', { value: 'all', text: allLabel }),
        values.map(function (v) { return el('option', { value: v, text: v, selected: v === current ? 'selected' : null }); }));
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
      return el('div', { class: 'field' }, el('label', { for: id, text: label }), s);
    }
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      select('category', 'Category', categories, state.category, 'All categories', function (v) { state.category = v; }),
      select('chain', 'Chain', chains, state.chain, 'All chains', function (v) { state.chain = v; }),
      el('div', { class: 'field' }, el('span', { class: 'lab', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' ? 1 : -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }
  function bar(value, max, amber) {
    return el('div', { class: 'bar' + (amber ? ' amber' : ''), 'aria-hidden': 'true' },
      el('i', { style: 'width:' + Math.max(2, Math.round((value / (max || 1)) * 100)) + '%' }));
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category or chain to see the board again.' }),
        el('button', { class: 'button', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var maxEv = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_value_usd; }));
    var maxTok = Math.max.apply(null, DATA.rows.map(function (r) { return r.implied_token_value_usd; }));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        class: r.rank <= 3 ? 'top3' : '',
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'cellbar' }, bar(r.implied_token_value_usd, maxTok, true), el('span', { class: 'num', text: fmtUsd(r.implied_token_value_usd) })),
        el('td', { class: 'cellbar' }, bar(r.likelihood, 1, false), el('span', { class: 'num', text: Math.round(r.likelihood * 100) + '%' })),
        el('td', { class: 'cellbar' }, bar(r.implied_value_usd, maxEv, false), el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })),
        el('td', { class: 'num', text: r.ev_per_farmer_usd > 0 ? fmtUsd(r.ev_per_farmer_usd) : 'under $1' }),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token launch candidates, expected value first. Select a row for its model breakdown and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('expected', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('token', 'Implied token value'),
            sortHeader('likelihood', 'Launch likelihood'),
            sortHeader('expected', 'Expected value'),
            sortHeader('evf', 'EV / farmer'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: r.symbol || 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorised') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Live tokens: these protocols already trade, so their market cap is a market fact, not a model. They calibrate the peer curve and are never ranked as farms.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Symbol' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var cats = m.categories.slice(0, 10);
    var tbody = el('tbody');
    cats.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.peers) }),
        el('td', { class: 'num', text: (c.offset > 0 ? '+' : '') + c.offset.toFixed(2) }),
        el('td', { class: 'num', text: Math.round(c.propensity * 100) + '%' }),
        el('td', { class: 'num', text: String(c.pre_token) })
      ));
    });
    function weight(name, w, note) {
      return el('div', { class: 'weight' }, el('b', { text: name + ' ' + w }), el('span', { text: note }));
    }
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How the radar scores a protocol' }),
      el('p', { text: 'One function of the snapshot\'s own figures scores every row. No protocol name is special-cased and nothing is fetched: re-running the program on a new snapshot re-fits every number below.' }),
      el('h3', { text: 'Implied token value, from the protocols that already trade' }),
      el('div', { class: 'formula', text: 'multiple = clamp( 10^( A + B x (log10 TVL - log10 ' + fmtUsd(m.center_tvl_usd) + ') + category offset ), 0.01, 1.5 )' }),
      el('p', { text: 'The ' + m.peer_count + ' token-bearing protocols with a recorded market cap are the peers. Their market cap over TVL, fitted against TVL itself, gives A = a multiple of ' + m.ratio_at_center.toFixed(2) + ' at the peer centre and B = ' + m.slope.toFixed(2) + ': the bigger a protocol, the smaller the multiple its token trades at. Each category\'s offset is its peers\' mean residual, shrunk toward zero so a category with two peers barely moves the curve. Seven-day momentum then scales the value by 1 + ' + m.growth_weight + ' x clamped change.' }),
      el('div', { class: 'formula', text: 'implied token value = TVL x multiple x ( 1 + ' + m.growth_weight + ' x clamp(change 7d, -50, 100) / 100 )' }),
      el('h3', { text: 'Launch likelihood, five signals, weighted' }),
      el('div', { class: 'weights' },
        weight('Readiness', '30%', 'Age with no token: ramps over 6 months, full at 4 years, eases to a floor by 8'),
        weight('Scale', '25%', 'Log TVL from $5M to $5B: a launch needs value to distribute'),
        weight('Propensity', '20%', 'Share of the category that already records a token, shrunk to the snapshot average'),
        weight('Momentum', '15%', 'Seven-day TVL change centred at zero: growth pulls a launch closer'),
        weight('Spread', '10%', 'Chain count from 1 to 6: more chains, more wallets to reward')
      ),
      el('h3', { text: 'Expected value, the ranking' }),
      el('div', { class: 'formula', text: 'expected value = implied token value x likelihood' }),
      el('p', { text: 'board.json\'s implied_value_usd is this expected value; the unweighted token value and the likelihood travel with every row so a reader can re-rank by either. EV per farmer is indicative only: it assumes a launch sets aside ' + Math.round(m.community_share * 100) + '% of the implied token value for its community and one qualifying wallet per $2,000 of TVL (clamped to 2,500-250,000 wallets).' }),
      el('h3', { text: 'Who is on the board' }),
      el('p', { text: 'The watchlist (' + DATA.watchlist_size + ' protocols at or above the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor with no token on record) is covered in full. Below the floor the radar applies the watchlist\'s own candidate rules to the fields the snapshot carries: no token recorded, not a bridge, staking or other product category of a token that already trades, no wrapped or staked name, no exchange prefix, no version marker. That adds ' + DATA.early_size + ' early rows. Above the floor, a protocol the list leaves out stays out: the snapshot shows no parent field, so its absence is the only signal and the radar trusts it.' }),
      el('h3', { text: 'Category calibration (top 10 by board rows)' }),
      el('div', { class: 'table-wrap' }, el('table', null,
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Category' }), el('th', { scope: 'col', text: 'Peers' }),
          el('th', { scope: 'col', text: 'Offset (log10)' }), el('th', { scope: 'col', text: 'Token propensity' }),
          el('th', { scope: 'col', text: 'Board rows' }))),
        tbody
      ))
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function part(label, v) {
    return el('div', { class: 'part' },
      el('span', { text: label }),
      el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.round(v * 100) + '%' })),
      el('b', { class: 'num', text: v.toFixed(2) }));
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var checkTok = impliedTokenOf(row);
    var checkEv = expectedOf(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Uncategorised') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' - listed ' + (row.listed_at || 'date unrecorded') + ', ' + fmtAge(row.age_days) + ' with no token' })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Expected value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Peer multiple' }), el('b', { class: 'num', text: row.peer_multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Growth x' }), el('b', { class: 'num', text: row.growth_multiplier.toFixed(2) })),
        el('div', null, el('span', { text: 'Implied token value' }), el('b', { class: 'num', text: fmtUsd(row.implied_token_value_usd) })),
        el('div', null, el('span', { text: 'Likelihood' }), el('b', { class: 'num', text: Math.round(row.likelihood * 100) + '%' })),
        el('div', { class: 'hero' }, el('span', { text: 'Expected value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'EV / farmer (indicative)' }), el('b', { class: 'num', text: fmtUsd(row.ev_per_farmer_usd) }))
      ),
      el('p', { class: 'sub', text: 'Seven-day TVL change ' + fmtPct(row.change_7d) + '. The page recomputes this row as ' + fmtUsd(checkTok) + ' of token value and ' + fmtUsd(checkEv) + ' expected' + (checkTok === row.implied_token_value_usd && checkEv === row.implied_value_usd ? ', the same numbers board.json carries.' : ', which differ from the board: the data would be stale.') + ' An estimate, not a price, and no launch is promised.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Why this likelihood' }),
      el('div', { class: 'parts' },
        part('Readiness', row.readiness),
        part('Scale', row.scale),
        part('Propensity', row.propensity),
        part('Momentum', row.momentum),
        part('Spread', row.spread)
      )
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), tail ? el('span', { class: 'cost', text: tail }) : null);
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(el('footer', { text: 'Built from one frozen snapshot of the DefiLlama protocol index (' + DATA.as_of + '). Every figure on this page is computed by the program that wrote it; nothing is fetched and no launch is promised.' }));
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
