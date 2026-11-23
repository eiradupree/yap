package main

import (
	"github.com/mattermost/mattermost/server/public/model"
)

// yapSiteName replaces Mattermost's default Site Name, which the host shows in the
// browser tab, on the sign-in page and in emails.
const yapSiteName = "Yap"

// yapBrandText is the custom brand text shown under the title on the sign-in and
// sign-up pages. It's Mattermost's own sign-in subtitle: turning custom branding on
// replaces the sign-up page's "Create your Mattermost account…" with it, and drops
// "Mattermost" from the landing page's "You can view Mattermost in the desktop app".
const yapBrandText = "Collaborate with your team in real time"

// siteNameToSet returns the Site Name to save, if any. Only the default (unset or
// "Mattermost") is replaced: a name an admin chose is never changed.
func siteNameToSet(current *string) (string, bool) {
	if current == nil || *current == "" || *current == model.TeamSettingsDefaultSiteName {
		return yapSiteName, true
	}
	return "", false
}

// applyBrandingDefaults changes the config's branding settings that are still at
// Mattermost's defaults and reports whether it changed any. Custom branding is only
// turned on while it has no text, so it's left alone once an admin has written their
// own text or turned it off afterwards.
func applyBrandingDefaults(cfg *model.Config) bool {
	changed := false
	if name, ok := siteNameToSet(cfg.TeamSettings.SiteName); ok {
		cfg.TeamSettings.SiteName = model.NewPointer(name)
		changed = true
	}
	if text := cfg.TeamSettings.CustomBrandText; text == nil || *text == "" {
		cfg.TeamSettings.EnableCustomBrand = model.NewPointer(true)
		cfg.TeamSettings.CustomBrandText = model.NewPointer(yapBrandText)
		changed = true
	}
	return changed
}

// applyBranding brands the site Yap when the NameSiteYap setting is on. It runs in its
// own goroutine: saving the config calls the plugin's OnConfigurationChange hook,
// which mustn't happen while a hook of this plugin is still running.
func (p *Plugin) applyBranding() {
	if !p.getConfiguration().NameSiteYap {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				p.API.LogError("Panic while branding the site", "panic", r)
			}
		}()

		// The unsanitized config, so saving it doesn't overwrite secrets with "********".
		cfg := p.API.GetUnsanitizedConfig()
		if cfg == nil || !applyBrandingDefaults(cfg) {
			return
		}
		if err := p.API.SaveConfig(cfg); err != nil {
			p.API.LogError("Failed to brand the site", "err", err.Error())
			return
		}
		p.API.LogInfo("Set the Site Name and custom brand text to Yap's; turn off \"Brand the site as Yap\" in the plugin's settings to change them in Site Configuration > Customization")
	}()
}
