'use strict';
'require baseclass';
'require rpc';
'require poll';
'require fs';

var callSystemInfo = rpc.declare({ object: 'system', method: 'info' });
var callInterfaceDump = rpc.declare({ object: 'network.interface', method: 'dump', expect: { 'interface': [] } });
var callDeviceStatus = rpc.declare({ object: 'network.device', method: 'status', params: ['name'] });

return baseclass.extend({
	prevStats: null, prevTime: null,
	netDevice: null, netLabel: null, netChecked: false, linkSpeed: null,
	numCores: 1,

	__init__() {
		var self = this;
		L.resolveDefault(fs.read('/proc/cpuinfo'), '').then(function(text) {
			var m = text.match(/^processor\s*:/gm);
			self.numCores = (m && m.length) || 1;
		});
		this.setup();
	},

	makeIcon(name) {
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'header__chip-icon');
		svg.setAttribute('viewBox', '0 0 14 14');
		var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
		use.setAttribute('href', '#goflow-icon-chip-' + name);
		svg.appendChild(use);
		return svg;
	},

	chip(name, title) {
		var el = document.createElement('span');
		el.className = 'header__chip';
		el.setAttribute('data-indicator', name);
		el.title = title;
		el.appendChild(this.makeIcon(name));
		var val = document.createElement('span');
		val.className = 'header__chip-value';
		val.textContent = '--';
		el.appendChild(val);
		return el;
	},

	setLevel(el, level) { el.setAttribute('data-level', level); },

	setup() {
		this.box = document.getElementById('goflow-stats');
		if (!this.box) return;
		this.cpuEl = this.chip('cpu', 'CPU 使用率');
		this.ramEl = this.chip('ram', '内存使用率');
		this.uptimeEl = this.chip('uptime', '运行时间');
		this.box.appendChild(this.cpuEl);
		this.box.appendChild(this.ramEl);
		this.box.appendChild(this.uptimeEl);
		this.tick();
		poll.add(L.bind(this.tick, this), 5);
		poll.start();
	},

	tick() {
		var self = this;
		L.resolveDefault(callSystemInfo(), {}).then(function(info) { self.updateSystem(info); });

		if (!this.netChecked) {
			this.netChecked = true;
			L.resolveDefault(callInterfaceDump(), []).then(function(ifaces) {
				var wanDev = null;
				for (var i = 0; i < ifaces.length; i++)
					if (ifaces[i].interface === 'wan') { wanDev = ifaces[i].l3_device || ifaces[i].device; break; }
				if (!wanDev)
					for (var j = 0; j < ifaces.length; j++)
						if (ifaces[j].interface === 'wan6') { wanDev = ifaces[j].l3_device || ifaces[j].device; break; }
				self.resolveDevice(wanDev || 'wan');
			});
		} else if (this.netDevice) {
			this.pollNet();
		}
	},

	resolveDevice(devName) {
		var self = this;
		L.resolveDefault(callDeviceStatus(devName), {}).then(function(dev) {
			if (!dev) return;
			var members = dev['bridge-members'];
			if (dev.type === 'bridge' && members && members.length > 0) self.netDevice = members[0];
			else if (dev.statistics) self.netDevice = devName;
			if (!self.netDevice) return;

			L.resolveDefault(callDeviceStatus(self.netDevice), {}).then(function(phys) {
				if (phys && phys.speed) {
					var m = String(phys.speed).match(/^(\d+)/);
					if (m) self.linkSpeed = parseInt(m[1], 10);
				}
				if (phys && phys.devtype === 'dsa' && phys['hw-tc-offload'] && phys.conduit) {
					self.netLabel = self.netDevice;
					self.netDevice = phys.conduit;
				}
				self.netEl = self.chip('net', '网络吞吐量');
				self.box.insertBefore(self.netEl, self.uptimeEl);
				self.pollNet();
			});
		});
	},

	pollNet() {
		var self = this;
		L.resolveDefault(callDeviceStatus(this.netDevice), {}).then(function(dev) { self.updateNet(dev); });
	},

	updateSystem(info) {
		if (!info) return;
		if (info.load && info.load.length) {
			var load1 = info.load[0] / 65536;
			var pct = Math.min(load1 / this.numCores, 1) * 100;
			var s = pct.toFixed(0) + '%';
			this.cpuEl.querySelector('.header__chip-value').textContent = s;
			this.cpuEl.title = 'CPU 使用率: ' + s + ' (负载 ' + load1.toFixed(2) + ' / ' + this.numCores + ' 核)';
			this.setLevel(this.cpuEl, pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'crit');
		}
		if (info.memory && info.memory.total) {
			var total = info.memory.total;
			var avail = info.memory.available || info.memory.free;
			var pct = ((total - avail) / total * 100).toFixed(0);
			this.ramEl.querySelector('.header__chip-value').textContent = pct + '%';
			this.ramEl.title = '内存: ' + this.fmtBytes(total - avail) + ' / ' + this.fmtBytes(total) + ' (' + pct + '%)';
			this.setLevel(this.ramEl, pct < 60 ? 'ok' : pct < 85 ? 'warn' : 'crit');
		}
		if (info.uptime) {
			var u = this.fmtUptime(info.uptime);
			this.uptimeEl.querySelector('.header__chip-value').textContent = u;
			this.uptimeEl.title = '运行时间: ' + u;
		}
	},

	updateNet(dev) {
		if (!dev || !dev.statistics || !this.netEl) return;
		var now = Date.now() / 1000;
		var rx = dev.statistics.rx_bytes || 0, tx = dev.statistics.tx_bytes || 0;
		if (this.prevStats && this.prevTime) {
			var dt = now - this.prevTime;
			if (dt > 0) {
				var rxS = Math.max((rx - this.prevStats.rx) / dt, 0);
				var txS = Math.max((tx - this.prevStats.tx) / dt, 0);
				var txt = '\u2193' + this.fmtMbps(rxS) + ' \u2191' + this.fmtMbps(txS);
				this.netEl.querySelector('.header__chip-value').textContent = txt;
				this.netEl.title = (this.netLabel || this.netDevice) + ': \u2193 ' + this.fmtSpeedFull(rxS) + ' / \u2191 ' + this.fmtSpeedFull(txS);
				var peak = Math.max(rxS, txS);
				this.setLevel(this.netEl, peak < 1048576 ? 'ok' : peak < 52428800 ? 'active' : 'busy');
			}
		}
		this.prevStats = { rx: rx, tx: tx };
		this.prevTime = now;
	},

	fmtUptime(s) {
		var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
		return d > 0 ? d + 'd ' + h + 'h' : h + 'h ' + m + 'm';
	},

	fmtBytes(b) {
		if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GB';
		if (b >= 1048576) return (b / 1048576).toFixed(0) + ' MB';
		return (b / 1024).toFixed(0) + ' KB';
	},

	fmtMbps(bps) {
		var mbps = bps * 8 / 1e6;
		if (mbps >= 100) return mbps.toFixed(0);
		if (mbps >= 10)  return mbps.toFixed(1);
		return mbps.toFixed(2);
	},

	fmtSpeedFull(bps) {
		var bits = bps * 8;
		if (bits >= 1e9) return (bits / 1e9).toFixed(1) + ' Gbps';
		if (bits >= 1e6) return (bits / 1e6).toFixed(1) + ' Mbps';
		if (bits >= 1e3) return (bits / 1e3).toFixed(1) + ' kbps';
		return Math.round(bits) + ' bps';
	}
});
