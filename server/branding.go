package main

import (
	"github.com/mattermost/mattermost/server/public/model"
)

// yapSiteName replaces Mattermost's default Site Name, which the host shows in the
// browser tab, on the sign-in page and in emails.
const yapSiteName = "Yap"

// siteNameToSet returns the Site Name to save, if any. Only the default (unset or
// "Mattermost") is replaced: a name an admin chose is never changed.
func siteNameToSet(current *string) (string, bool) {
	if current == nil || *current == "" || *current == model.TeamSettingsDefaultSiteName {
		return yapSiteName, true
	}
	return "", false
}

// applySiteName names the site Yap when the NameSiteYap setting is on. It runs in its
// own goroutine: saving the config calls the plugin's OnConfigurationChange hook,
// which mustn't happen while a hook of this plugin is still running.
func (p *Plugin) applySiteName() {
	if !p.getConfiguration().NameSiteYap {
		return
	}
	go func() {
		defer func() {
			if r := recover(); r != nil {
				p.API.LogError("Panic while setting the Site Name", "panic", r)
			}
		}()

		// The unsanitized config, so saving it doesn't overwrite secrets with "********".
		cfg := p.API.GetUnsanitizedConfig()
		if cfg == nil {
			return
		}
		name, ok := siteNameToSet(cfg.TeamSettings.SiteName)
		if !ok {
			return
		}
		cfg.TeamSettings.SiteName = model.NewPointer(name)
		if err := p.API.SaveConfig(cfg); err != nil {
			p.API.LogError("Failed to set the Site Name", "err", err.Error())
			return
		}
		p.API.LogInfo("Set the Site Name to " + name + "; turn off \"Name the site Yap\" in the plugin's settings and change it in Site Configuration > Customization to use another name")
	}()
}
