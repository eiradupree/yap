package main

import (
	"testing"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/stretchr/testify/assert"
)

func TestSiteNameToSet(t *testing.T) {
	for _, tc := range []struct {
		name    string
		current *string
		want    string
		wantSet bool
	}{
		{"unset", nil, "Yap", true},
		{"empty", model.NewPointer(""), "Yap", true},
		{"Mattermost's default", model.NewPointer("Mattermost"), "Yap", true},
		{"already Yap", model.NewPointer("Yap"), "", false},
		{"chosen by an admin", model.NewPointer("Acme Chat"), "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := siteNameToSet(tc.current)
			assert.Equal(t, tc.wantSet, ok)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestApplyBrandingDefaults(t *testing.T) {
	t.Run("defaults are branded", func(t *testing.T) {
		cfg := &model.Config{}
		cfg.SetDefaults()
		assert.True(t, applyBrandingDefaults(cfg))
		assert.Equal(t, "Yap", *cfg.TeamSettings.SiteName)
		assert.True(t, *cfg.TeamSettings.EnableCustomBrand)
		assert.Equal(t, yapBrandText, *cfg.TeamSettings.CustomBrandText)
		assert.False(t, applyBrandingDefaults(cfg), "a second run changes nothing")
	})

	t.Run("an admin's choices are kept", func(t *testing.T) {
		cfg := &model.Config{}
		cfg.SetDefaults()
		cfg.TeamSettings.SiteName = model.NewPointer("Acme Chat")
		cfg.TeamSettings.EnableCustomBrand = model.NewPointer(false)
		cfg.TeamSettings.CustomBrandText = model.NewPointer("Acme's own text")
		assert.False(t, applyBrandingDefaults(cfg))
		assert.Equal(t, "Acme Chat", *cfg.TeamSettings.SiteName)
		assert.False(t, *cfg.TeamSettings.EnableCustomBrand)
		assert.Equal(t, "Acme's own text", *cfg.TeamSettings.CustomBrandText)
	})
}
