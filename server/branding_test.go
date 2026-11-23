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
