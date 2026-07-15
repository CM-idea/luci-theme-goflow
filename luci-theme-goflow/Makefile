#
# Copyright (C) 2026 Dursun Tokgoz
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

PKG_VERSION:=1.10
PKG_RELEASE:=1

include $(TOPDIR)/rules.mk

LUCI_TITLE:=Goflow Theme
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Dursun Tokgoz <dursuntokgoz@users.noreply.github.com>

define Package/luci-theme-goflow/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Goflow
	uci -q delete luci.themes.GoflowDark
	uci -q delete luci.themes.GoflowLight
	uci commit luci
}
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot
$(eval $(call BuildPackage,luci-theme-goflow))
