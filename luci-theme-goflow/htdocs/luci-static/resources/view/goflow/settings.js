'use strict';
'require view';
'require form';
'require uci';

return view.extend({
	load: function() {
		return uci.load('goflow');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('goflow', _('Goflow Theme'),
			_('Configure the appearance and dashboard settings of the Goflow theme. Changes apply after saving and reloading the page.'));

		/* ---- Appearance ---- */
		s = m.section(form.NamedSection, 'global', 'global', _('Appearance'));
		s.anonymous = true;

		o = s.option(form.ListValue, 'mode', _('Theme mode'),
			_('"Auto" follows your operating system\'s light/dark preference. The header toggle can override this per-browser.'));
		o.value('auto', _('Auto (follow system)'));
		o.value('light', _('Light'));
		o.value('dark', _('Dark'));
		o.default = 'auto';

		o = s.option(form.ListValue, 'font_size', _('Base font size'),
			_('Scales all text in the interface.'));
		o.value('13', _('Small (13px)'));
		o.value('14', _('Normal (14px)'));
		o.value('16', _('Large (16px)'));
		o.value('18', _('Extra large (18px)'));
		o.default = '14';

		o = s.option(form.Flag, 'rail_collapsed', _('Collapse navigation by default'),
			_('Start with the side navigation rail collapsed to icons on desktop.'));
		o.default = '0';
		o.rmempty = false;

		/* ---- Dashboard & Status ---- */
		s = m.section(form.NamedSection, 'global', 'global', _('Dashboard & Status'));
		s.anonymous = true;

		o = s.option(form.Flag, 'status_bar', _('Live header status bar'),
			_('Show CPU, memory, throughput and uptime chips in the header. Disable to reduce polling on low-end devices.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'dashboard', _('Dashboard page'),
			_('Show the "仪表板" dashboard entry in the side menu.'));
		o.default = '1';
		o.rmempty = false;

		/* ---- Logo ---- */
		s = m.section(form.NamedSection, 'global', 'global', _('Logo'));
		s.anonymous = true;

		o = s.option(form.FileUpload, '_logo_upload', _('Custom Logo'),
			_('Upload a custom icon to replace the sidebar logo. The glow effect will be removed automatically when a custom logo is set.'));
		o.root_directory = '/www/luci-static/goflow/';

		return m.render();
	}
});
