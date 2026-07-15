'use strict';
'require view';
'require rpc';
'require poll';
'require fs';
'require ui';

var callSysInfo  = rpc.declare({ object: 'system', method: 'info' });
var callSysBoard = rpc.declare({ object: 'system', method: 'board' });
var callIfaceDump = rpc.declare({ object: 'network.interface', method: 'dump', expect: { interface: [] } });
var callDevStatus = rpc.declare({ object: 'network.device', method: 'status', params: ['name'] });

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	trafficPrev: null,
	trafficTime: null,
	wanDev: null,
	chartReady: false,

	render() {
		this.container = document.querySelector('#maincontent');
		if (!this.container) return;
		this.container.innerHTML = this.template();
		this.tick();
		this.initChart();
		poll.add(L.bind(this.tick, this), 3);
		poll.start();
	},

	template() {
		return (
			'<div class="goflow-dashboard">' +
				/* Row 1 */
				'<div class="db-stats">' +
					this.statCard('wan', 'db-stat__icon--blue', this.icon('goflow-icon-globe'), 'WAN 状态', '<span id="db-wan-status">--</span>', '<span id="db-wan-ip"></span>', '<span id="db-wan-dot" class="db-stat__indicator"></span>') +
					this.statCard('down', 'db-stat__icon--green', this.icon('goflow-icon-arrow-down'), '下载', '<span id="db-down-val">--</span> <small>Mbps</small>', '<span id="db-down-total">总计: --</span>') +
					this.statCard('up', 'db-stat__icon--orange', this.icon('goflow-icon-arrow-up'), '上传', '<span id="db-up-val">--</span> <small>Mbps</small>', '<span id="db-up-total">总计: --</span>') +
					this.statCard('clients', 'db-stat__icon--purple', this.icon('goflow-icon-wifi'), '无线客户端', '<span id="db-clients-val">--</span>', '<span id="db-clients-meta"></span>') +
				'</div>' +
				/* Row 2 */
				'<div class="db-main">' +
					'<div class="db-card">' +
						'<div class="db-card__header">' +
							'<h2 class="db-card__title">实时流量 — <span id="db-traffic-dev">WAN</span></h2>' +
							'<div class="db-card__actions">' +
								'<span class="db-legend"><i class="db-legend__dot db-legend__dot--down"></i>下载</span>' +
								'<span class="db-legend"><i class="db-legend__dot db-legend__dot--up"></i>上传</span>' +
							'</div>' +
						'</div>' +
						'<div class="db-card__body">' +
							'<canvas id="db-traffic-chart" class="db-chart" height="400"></canvas>' +
						'</div>' +
					'</div>' +
					'<div class="db-card">' +
						'<div class="db-card__header">' +
							'<h2 class="db-card__title">系统</h2>' +
						'</div>' +
						'<div class="db-card__body">' +
							this.meterHtml('cpu', 'CPU 负载') +
							this.meterHtml('ram', '内存（RAM）') +
							this.meterHtml('storage', '存储（overlay）') +
							'<div class="db-info-list">' +
								this.infoRow('hostname', '主机名') +
								this.infoRow('model', '型号') +
								this.infoRow('arch', '架构') +
								this.infoRow('firmware', '固件版本') +
								this.infoRow('kernel', '内核版本') +
								this.infoRow('uptime', '运行时间') +
								this.infoRow('load', '平均负载') +
							'</div>' +
						'</div>' +
					'</div>' +
				'</div>' +
				/* Row 3 */
				'<div class="db-bottom">' +
					'<div class="db-card">' +
						'<div class="db-card__header">' +
							'<h2 class="db-card__title">活跃 DHCP 租约</h2>' +
						'</div>' +
						'<div class="db-card__body db-card__body--flush">' +
							'<table class="db-table">' +
								'<thead><tr><th>主机名</th><th>IPv4 地址</th><th>MAC 地址</th><th class="db-table__col--right">剩余时间</th></tr></thead>' +
								'<tbody id="db-dhcp-tbody"><tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-color-medium)">加载中…</td></tr></tbody>' +
							'</table>' +
						'</div>' +
					'</div>' +
					'<div class="db-card">' +
						'<div class="db-card__header">' +
							'<h2 class="db-card__title">无线</h2>' +
						'</div>' +
						'<div class="db-card__body" id="db-wifi-body">' +
							'<div style="text-align:center;padding:24px;color:var(--text-color-medium)">加载中…</div>' +
						'</div>' +
					'</div>' +
				'</div>' +
			'</div>'
		);
	},

	statCard(id, iconCls, svg, label, value, meta, extra) {
		return (
			'<div class="db-stat">' +
				'<div class="db-stat__icon ' + iconCls + '">' + svg + '</div>' +
				'<div class="db-stat__body">' +
					'<span class="db-stat__label">' + label + '</span>' +
					'<span class="db-stat__value">' + value + '</span>' +
					'<span class="db-stat__meta">' + (meta || '') + '</span>' +
				'</div>' +
				(extra || '') +
			'</div>'
		);
	},

	meterHtml(id, label) {
		return (
			'<div class="db-meter">' +
				'<div class="db-meter__head">' +
					'<span class="db-meter__label">' + label + '</span>' +
					'<span class="db-meter__value" id="db-' + id + '-pct">--</span>' +
				'</div>' +
				'<div class="db-progress">' +
					'<div class="db-progress__bar db-progress__bar--blue" id="db-' + id + '-bar"></div>' +
				'</div>' +
			'</div>'
		);
	},

	infoRow(id, label) {
		return (
			'<div class="db-info-list__item">' +
				'<span>' + label + '</span>' +
				'<strong id="db-info-' + id + '">--</strong>' +
			'</div>'
		);
	},

	icon(name) { return '<svg class="icon"><use href="#' + name + '"/></svg>'; },

	/* ---- Data tick ---- */
	tick() {
		var self = this;
		L.resolveDefault(callSysInfo(), {}).then(function(info) { self.updateSystem(info); });
		L.resolveDefault(callSysBoard(), {}).then(function(board) { self.updateBoard(board); });
		L.resolveDefault(callIfaceDump(), []).then(function(ifaces) { self.updateWAN(ifaces); });
		if (!this._dhcpDone) { this._dhcpDone = true; this.pollDHCP(); this.pollWiFi(); }
	},

	/* ---- System info ---- */
	updateSystem(info) {
		if (!info) return;
		// CPU
		if (info.load && info.load.length)
			this.setMeter('cpu', Math.round(Math.min(info.load[0] / 65536, 100)), null);
		// RAM
		if (info.memory && info.memory.total) {
			var t = info.memory.total, a = info.memory.available || info.memory.free;
			this.setMeter('ram', Math.round((t - a) / t * 100), this.fmtBytes(t - a) + ' / ' + this.fmtBytes(t));
		}
		// Uptime
		if (info.uptime) this.setInfo('uptime', this.fmtUptime(info.uptime));
		// Load
		if (info.load && info.load.length === 3)
			this.setInfo('load', (info.load[0]/65536).toFixed(2) + ' / ' + (info.load[1]/65536).toFixed(2) + ' / ' + (info.load[2]/65536).toFixed(2));
		// Hostname
		if (info.hostname) this.setInfo('hostname', info.hostname);
	},

	updateBoard(board) {
		if (!board) return;
		if (board.model) this.setInfo('model', board.model);
		if (board.release && board.release.kernel) this.setInfo('kernel', board.release.kernel);
		if (board.release && board.release.description) this.setInfo('firmware', board.release.description.replace(/^OpenWrt\s+/, ''));
		if (board.system) this.setInfo('arch', board.system);
		// Storage
		if (!this._storageDone && (this._storageDone = true)) this.pollStorage();
	},

	pollStorage() {
		var self = this;
		fs.exec('/bin/df', ['-k', '/']).then(function(res) {
			if (!res || res.code !== 0 || !res.stdout) return;
			var lines = res.stdout.trim().split('\n');
			if (lines.length < 2) return;
			var parts = lines[1].trim().split(/\s+/);
			if (parts.length >= 4) {
				var total = parseInt(parts[1], 10) * 1024;
				var used  = parseInt(parts[2], 10) * 1024;
				self.setMeter('storage', Math.round(used / total * 100), self.fmtBytes(used) + ' / ' + self.fmtBytes(total));
			}
		});
	},

	/* ---- WAN + Traffic ---- */
	updateWAN(ifaces) {
		if (!ifaces || !ifaces.length) return;
		var wan = null;
		for (var i = 0; i < ifaces.length; i++) {
			if (ifaces[i].interface === 'wan' && ifaces[i].up) { wan = ifaces[i]; break; }
		}
		if (!wan) {
			for (var j = 0; j < ifaces.length; j++) {
				if (ifaces[j].interface === 'wan6' && ifaces[j].up) { wan = ifaces[j]; break; }
			}
		}

		var statusEl = document.getElementById('db-wan-status');
		var ipEl = document.getElementById('db-wan-ip');
		var dotEl = document.getElementById('db-wan-dot');

		if (wan) {
			if (statusEl) statusEl.textContent = '\u5df2\u8fde\u63a5';
			var ip = (wan['ipv4-address'] && wan['ipv4-address'].length) ? wan['ipv4-address'][0].address : '';
			if (ipEl) {
				var dev = wan.l3_device || wan.device || '';
				var proto = wan.proto || '';
				ipEl.textContent = (dev && proto ? dev + ' \u00b7 ' + proto.toUpperCase() + ' \u00b7 ' : dev + ' \u00b7 ') + (ip || '');
			}
			if (dotEl) { dotEl.className = 'db-stat__indicator db-stat__indicator--online'; }

			var devName = wan.l3_device || wan.device;
			if (devName && devName !== this.wanDev) {
				this.wanDev = devName;
				var devTitle = document.getElementById('db-traffic-dev');
				if (devTitle) devTitle.textContent = devName + '\uff08WAN\uff09';
				this.startTrafficPoll(devName);
			}
		} else {
			if (statusEl) statusEl.textContent = '\u672a\u8fde\u63a5';
			if (ipEl) ipEl.textContent = '';
			if (dotEl) { dotEl.className = 'db-stat__indicator db-stat__indicator--offline'; }
		}
	},

	startTrafficPoll(devName) {
		var self = this; self._trafficTicks = 0;
		if (self._trafficTimer) clearInterval(self._trafficTimer);
		function fetch() {
			L.resolveDefault(callDevStatus(devName), {}).then(function(dev) { self.updateTraffic(dev); });
		}
		fetch();
		self._trafficTimer = setInterval(fetch, 2000);
	},

	updateTraffic(dev) {
		if (!dev || !dev.statistics) return;
		var now = Date.now() / 1000;
		var rx = dev.statistics.rx_bytes || 0;
		var tx = dev.statistics.tx_bytes || 0;

		if (this.trafficPrev && this.trafficTime) {
			var dt = now - this.trafficTime;
			if (dt > 0) {
				var rxS = Math.max((rx - this.trafficPrev.rx) / dt, 0);
				var txS = Math.max((tx - this.trafficPrev.tx) / dt, 0);
				this.setStatVal('down', this.fmtMbps(rxS));
				this.setStatMeta('down', '\u603b\u8ba1: ' + this.fmtBytes(rx) + '\uff08\u4eca\u65e5\uff09');
				this.setStatVal('up', this.fmtMbps(txS));
				this.setStatMeta('up', '\u603b\u8ba1: ' + this.fmtBytes(tx) + '\uff08\u4eca\u65e5\uff09');
				this.pushChartPoint(rxS, txS);
			}
		}
		this.trafficPrev = { rx: rx, tx: tx };
		this.trafficTime = now;
	},

	/* ---- DHCP leases ---- */
	pollDHCP() {
		var self = this;
		fs.read('/tmp/dhcp.leases').then(function(data) {
			var tbody = document.getElementById('db-dhcp-tbody');
			if (!tbody) return;
			var lines = (data || '').trim().split('\n');
			if (!lines.length || (lines.length === 1 && !lines[0])) {
				tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-color-medium)">\u65e0\u6d3b\u8dc3\u79df\u7ea6</td></tr>';
				return;
			}
			var html = '';
			for (var i = 0; i < lines.length; i++) {
				var p = lines[i].split(/\s+/);
				if (p.length < 5) continue;
				var ts = parseInt(p[0], 10), mac = p[1], ip = p[2], host = p[3], id = p[4];
				var remain = '';
				var now = Math.floor(Date.now() / 1000);
				if (ts > now) {
					var r = ts - now;
					if (r >= 86400) remain = Math.floor(r / 86400) + ' \u5929';
					else if (r >= 3600) remain = Math.floor(r / 3600) + ' \u65f6 ' + Math.floor((r % 3600) / 60) + ' \u5206';
					else remain = Math.floor(r / 60) + ' \u5206';
				} else {
					remain = '\u9759\u6001';
				}
				html += '<tr>' +
					'<td><div class="db-device"><div class="db-device__icon"><svg class="icon"><use href="#goflow-icon-laptop"/></svg></div><div class="db-device__info"><span class="db-device__name">' + this.esc(host) + '</span></div></div></td>' +
					'<td>' + ip + '</td>' +
					'<td><span class="db-device__mac">' + mac + '</span></td>' +
					'<td class="db-table__col--right">' + remain + '</td>' +
				'</tr>';
			}
			tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-color-medium)">\u65e0\u6d3b\u8dc3\u79df\u7ea6</td></tr>';
		});
	},

	/* ---- WiFi ---- */
	pollWiFi() {
		var self = this;
		fs.exec('/usr/sbin/iwinfo', []).then(function(res) {
			if (res && res.code === 0) self.parseIwinfo(res.stdout || '');
			else self.showWiFiFallback();
		}).catch(function() { self.showWiFiFallback(); });
	},

	parseIwinfo(raw) {
		var container = document.getElementById('db-wifi-body');
		if (!container) return;
		var ifaces = [];
		var lines = raw.split('\n');
		var cur = null;
		for (var i = 0; i < lines.length; i++) {
			var l = lines[i].trim();
			if (!l) continue;
			if (l.search(/\s{2,}ESSID|^\w/) === 0) {
				var name = l.split(/\s+/)[0];
				if (name && name !== 'lo') { cur = name; ifaces.push(cur); }
			}
		}
		if (!ifaces.length) { this.showWiFiFallback(); return; }

		var html = '';
		for (var j = 0; j < ifaces.length; j++) {
			html += '<div class="db-wifi">' +
				'<div class="db-wifi__head">' +
					'<div class="db-wifi__icon db-wifi__icon--active"><svg class="icon"><use href="#goflow-icon-wifi"/></svg></div>' +
					'<div class="db-wifi__meta">' +
						'<span class="db-wifi__ssid">' + ifaces[j] + '</span>' +
						'<span class="db-wifi__band">\u65e0\u7ebf\u63a5\u53e3</span>' +
					'</div>' +
				'</div>' +
			'</div>';
		}
		container.innerHTML = html;

		// Wireless client count: count lines in /tmp/dhcp.leases or try associate list
		this.pollWiFiClients(ifaces);
	},

	showWiFiFallback() {
		var container = document.getElementById('db-wifi-body');
		if (!container) return;
		container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-color-medium)">\u65e0\u7ebf\u4fe1\u606f\u4e0d\u53ef\u7528</div>';
	},

	pollWiFiClients(ifaces) {
		var self = this;
		var total = 0;
		var counts = [];
		var done = 0;
		ifaces.forEach(function(iface, idx) {
			fs.exec('/usr/sbin/iwinfo', [iface, 'assoclist']).then(function(res) {
				var n = 0;
				if (res && res.code === 0) {
					var lines = (res.stdout || '').split('\n');
					for (var i = 0; i < lines.length; i++) {
						if (lines[i].match(/^[0-9A-Fa-f:]{17}/)) n++;
					}
				}
				total += n;
				counts[idx] = n;
				done++;
				if (done === ifaces.length) {
					self.setStatVal('clients', String(total));
					self.setStatMeta('clients', counts.map(function(c, i) { return c + ' \u00d7 ' + ifaces[i]; }).join(' \u00b7 '));
				}
			}).catch(function() { done++; });
		});
	},

	/* ---- Traffic chart (Canvas) ---- */
	POINTS: 40, MAX_MBPS: 120, CHART_H: 400,
	downData: [], upData: [],
	chartCtx: null,

	initChart() {
		var canvas = document.getElementById('db-traffic-chart');
		if (!canvas) return;
		this.chartCtx = canvas.getContext('2d');
		for (var i = 0; i < this.POINTS; i++) { this.downData.push(0); this.upData.push(0); }
		this.resizeChart();
		window.addEventListener('resize', L.bind(this.resizeChart, this));
		this.chartReady = true;
	},

	resizeChart() {
		var canvas = document.getElementById('db-traffic-chart');
		if (!canvas || !this.chartCtx) return;
		var dpr = window.devicePixelRatio || 1;
		var rect = canvas.getBoundingClientRect();
		canvas.width = rect.width * dpr;
		canvas.height = this.CHART_H * dpr;
		this.chartCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.drawChart();
	},

	pushChartPoint(rx, tx) {
		this.downData.push(rx / 1e6 * 8);
		this.upData.push(tx / 1e6 * 8);
		if (this.downData.length > this.POINTS) { this.downData.shift(); this.upData.shift(); }
		if (this.chartReady) this.drawChart();
	},

	drawChart() {
		var ctx = this.chartCtx;
		if (!ctx) return;
		var canvas = document.getElementById('db-traffic-chart');
		var rect = canvas.getBoundingClientRect();
		var w = rect.width, h = this.CHART_H;

		var style = getComputedStyle(document.documentElement);
		var borderColor = style.getPropertyValue('--border-color-medium').trim() || '#e3e8f1';
		var textMuted = style.getPropertyValue('--text-color-medium').trim() || '#7c879c';
		var primaryColor = style.getPropertyValue('--primary-color-high').trim() || '#3b6ef5';
		var warnColor = style.getPropertyValue('--warning-color-high').trim() || '#ef8c3b';

		ctx.clearRect(0, 0, w, h);

		// Grid
		ctx.strokeStyle = borderColor;
		ctx.fillStyle = textMuted;
		ctx.font = '11px sans-serif';
		ctx.lineWidth = 1;
		for (var g = 0; g <= 4; g++) {
			var gy = (h / 4) * g;
			ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
			var label = Math.round(this.MAX_MBPS - (this.MAX_MBPS / 4) * g);
			if (g < 4) ctx.fillText(label + ' Mbps', 6, gy + 14);
		}

		this.drawSeries(this.downData, primaryColor, w, h);
		this.drawSeries(this.upData, warnColor, w, h);
	},

	drawSeries(data, color, w, h) {
		var ctx = this.chartCtx;
		var stepX = w / (this.POINTS - 1);
		ctx.beginPath();
		data.forEach(function(v, i) {
			var x = i * stepX, y = h - (v / this.MAX_MBPS) * h;
			if (i === 0) { ctx.moveTo(x, y); return; }
			var prevX = (i - 1) * stepX, prevY = h - (data[i - 1] / this.MAX_MBPS) * h;
			var midX = (prevX + x) / 2;
			ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + y) / 2);
		});
		ctx.lineTo(w, h - (data[this.POINTS - 1] / this.MAX_MBPS) * h);
		ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.stroke();

		var gradient = ctx.createLinearGradient(0, 0, 0, h);
		gradient.addColorStop(0, this.hexToRgba(color, .22));
		gradient.addColorStop(1, this.hexToRgba(color, 0));
		ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
		ctx.fillStyle = gradient; ctx.fill();
	},

	hexToRgba(hex, a) {
		var v = hex.replace('#', '');
		if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
		var n = parseInt(v, 16);
		return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
	},

	/* ---- Helpers ---- */
	setMeter(id, pct, detail) {
		var pEl = document.getElementById('db-' + id + '-pct');
		var bEl = document.getElementById('db-' + id + '-bar');
		if (pEl) pEl.textContent = (detail || '') || (pct + '%');
		if (bEl) {
			bEl.style.width = Math.min(pct, 100) + '%';
			bEl.className = 'db-progress__bar ' +
				(pct > 80 ? 'db-progress__bar--danger' : pct > 60 ? 'db-progress__bar--orange' : 'db-progress__bar--blue');
		}
	},

	setInfo(id, val) {
		var el = document.getElementById('db-info-' + id);
		if (el) el.textContent = val;
	},

	setStatVal(id, val) {
		var el = document.getElementById('db-' + id + '-val');
		if (el) el.textContent = val;
	},

	setStatMeta(id, val) {
		var el = document.getElementById('db-' + id + '-total');
		if (el) el.textContent = val;
	},

	esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },

	fmtUptime(s) {
		var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
		return d > 0 ? d + ' 天 ' + h + ' 小时 ' + m + ' 分钟' : h + ' 小时 ' + m + ' 分钟';
	},

	fmtBytes(b) {
		if (b >= 1e9) return (b / 1e9).toFixed(1) + ' GB';
		if (b >= 1e6) return (b / 1e6).toFixed(0) + ' MB';
		if (b >= 1024) return (b / 1024).toFixed(0) + ' KB';
		return b + ' B';
	},

	fmtMbps(bps) {
		var mbps = bps / 1e6 * 8;
		return mbps >= 10 ? mbps.toFixed(0) : mbps.toFixed(1);
	}
});
