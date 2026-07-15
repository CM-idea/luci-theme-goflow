'use strict';
'require baseclass';
'require ui';

/* Top-level admin menu entries are dynamic (any installed luci-app-* package
 * can contribute one), so this is a best-effort icon lookup by menu node
 * name with a generic fallback - not an exhaustive registry. */
var ICONS = {
	status: 'chart',
	system: 'settings',
	network: 'globe',
	services: 'layers',
	vpn: 'shield',
	firewall: 'shield',
	istore: 'istore',
	'goflow-dashboard': 'dashboard',
	'goflow-stations': 'chart',
	logout: 'logout'
};

var ORDER = [
	'goflow-dashboard',
	'status',
	'system',
	'istore',
	'services',
	'vpn',
	'network',
	'logout'
];

function iconHtml(name) {
	var id = ICONS[name] || 'dot';
	return '<svg class="icon sidebar__icon"><use href="#goflow-icon-' + id + '"/></svg>';
}

function setDarkMode(isDark) {
	document.documentElement.setAttribute('data-darkmode', isDark ? 'true' : 'false');
	try { localStorage.setItem('goflow-darkmode', isDark ? 'true' : 'false'); } catch (e) {}
}

return baseclass.extend({
	__init__() {
		this.initSidebarToggle();
		this.initThemeToggle();

		ui.menu.load().then((tree) => this.render(tree));
	},

	initSidebarToggle() {
		var app = document.getElementById('goflow-app');
		var toggle = document.getElementById('goflow-sidebar-toggle');
		var overlay = document.getElementById('goflow-overlay');
		var MOBILE_BREAKPOINT = 768;
		var STORE_KEY = 'goflow-sidebar-collapsed';

		if (!app || !toggle)
			return;

		function isMobile() {
			return window.innerWidth <= MOBILE_BREAKPOINT;
		}

		try {
			if (!isMobile() && localStorage.getItem(STORE_KEY) === 'true')
				app.classList.add('app--sidebar-collapsed');
		} catch (e) {}

		toggle.addEventListener('click', function () {
			if (isMobile()) {
				app.classList.toggle('app--sidebar-open');
				return;
			}

			var collapsed = app.classList.toggle('app--sidebar-collapsed');
			try { localStorage.setItem(STORE_KEY, collapsed ? 'true' : 'false'); } catch (e) {}
		});

		if (overlay) {
			overlay.addEventListener('click', function () {
				app.classList.remove('app--sidebar-open');
			});
		}

		window.addEventListener('resize', function () {
			if (isMobile())
				app.classList.remove('app--sidebar-collapsed');
			else
				app.classList.remove('app--sidebar-open');
		});
	},

	initThemeToggle() {
		var toggle = document.getElementById('goflow-theme-toggle');

		if (!toggle)
			return;

		toggle.addEventListener('click', function () {
			var isDark = document.documentElement.getAttribute('data-darkmode') === 'true';
			setDarkMode(!isDark);
		});
	},

	render(tree) {
		let node = tree;
		let url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	/* Unchanged from upstream menu-bootstrap.js: renders the sub-tabs of the
	 * currently active top-level section into #tabmenu, at the top of the
	 * content area. */
	renderTabMenu(tree, url, level) {
		const container = document.querySelector('#tabmenu');
		const ul = E('ul', { 'class': 'tabs' });
		const children = ui.menu.getChildren(tree);
		let activeNode = null;

		children.forEach(child => {
			const isActive = (L.env.dispatchpath[3 + (level || 0)] == child.name);
			const activeClass = isActive ? ' active' : '';
			const className = 'tabmenu-item-%s %s'.format(child.name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, child.name) }, [ _(child.title) ] )]));

			if (isActive)
				activeNode = child;
		});

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	/* Replaces upstream's renderMainMenu(): instead of a horizontal top-nav
	 * with dropdowns, renders the same two menu levels as a vertical sidebar -
	 * top-level sections become accordion groups holding their second-level
	 * pages. Levels three and up stay in #tabmenu (see above), matching how
	 * far bootstrap's dropdown nav descends. */
	renderSidebarMenu(tree, url) {
		const container = document.querySelector('#sidebar-menu');
		var children = ui.menu.getChildren(tree);
		const activeName = L.env.dispatchpath[1];
		const activeSub = L.env.dispatchpath[2];

		if (!container)
			return;

		/* Sort top-level menu entries in a fixed order */
		children.sort(function(a, b) {
			var ai = ORDER.indexOf(a.name);
			var bi = ORDER.indexOf(b.name);
			if (ai === -1) ai = ORDER.length;
			if (bi === -1) bi = ORDER.length;
			return ai - bi;
		});

		const setOpen = (group, open) => {
			const submenu = group.querySelector('.sidebar__submenu');
			group.classList.toggle('sidebar__group--open', open);
			submenu.style.maxHeight = open ? submenu.scrollHeight + 'px' : '';
		};

		children.forEach(child => {
			const isActive = activeName === child.name;
			const sub = ui.menu.getChildren(child);

			/* Leaf entries (e.g. Logout) stay plain links */
			if (sub.length == 0) {
				const link = E('a', {
					'href': L.url(url, child.name),
					'class': 'sidebar__item' + (isActive ? ' sidebar__item--active' : '')
				}, [ E('span', { 'class': 'sidebar__label' }, [ _(child.title) ]) ]);

				link.insertAdjacentHTML('afterbegin', iconHtml(child.name));
				container.appendChild(link);
				return;
			}

			const toggle = E('button', {
				'type': 'button',
				'class': 'sidebar__item sidebar__item--toggle' + (isActive ? ' sidebar__item--active' : '')
			}, [ E('span', { 'class': 'sidebar__label' }, [ _(child.title) ]) ]);

			toggle.insertAdjacentHTML('afterbegin', iconHtml(child.name));
			toggle.insertAdjacentHTML('beforeend',
				'<svg class="icon sidebar__chevron"><use href="#goflow-icon-chevron"/></svg>');

			const submenu = E('div', { 'class': 'sidebar__submenu' },
				sub.map(s => E('a', {
					'href': L.url(url, child.name, s.name),
					'class': 'sidebar__subitem' +
						((isActive && activeSub === s.name) ? ' sidebar__subitem--active' : '')
				}, [ _(s.title) ])));

			const group = E('div', { 'class': 'sidebar__group' }, [ toggle, submenu ]);

			toggle.addEventListener('click', () => {
				const app = document.getElementById('goflow-app');

				/* In icon-only mode, first expand the sidebar so labels and
				 * the submenu have room, then open the clicked group */
				if (app && app.classList.contains('app--sidebar-collapsed')) {
					app.classList.remove('app--sidebar-collapsed');
					try { localStorage.setItem('goflow-sidebar-collapsed', 'false'); } catch (e) {}
					setOpen(group, true);
					return;
				}

				const willOpen = !group.classList.contains('sidebar__group--open');

				/* Accordion: only one group open at a time */
				container.querySelectorAll('.sidebar__group--open').forEach(other => {
					if (other !== group) setOpen(other, false);
				});

				setOpen(group, willOpen);
			});

			container.appendChild(group);

			/* The section being viewed starts expanded */
			if (isActive)
				setOpen(group, true);
		});
	},

	/* Unchanged from upstream menu-bootstrap.js. Targets #modemenu, only
	 * shown when more than one top-level admin index tree is registered
	 * (rare in practice). */
	renderModeMenu(tree) {
		const ul = document.querySelector('#modemenu');
		const children = ui.menu.getChildren(tree);

		children.forEach((child, index) => {
			const isActive = L.env.requestpath.length
				? child.name === L.env.requestpath[0]
				: index === 0;

			ul.appendChild(E('li', { 'class': isActive ? 'active' : '' }, [
				E('a', { 'href': L.url(child.name) }, [ _(child.title) ])
			]));

			if (isActive)
				this.renderSidebarMenu(child, child.name);
		});

		if (ul.children.length > 1)
			ul.style.display = '';
	}
});
