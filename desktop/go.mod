// This go.mod only keeps the Go tooling of the Yap plugin (go vet ./..., golangci-lint)
// out of desktop/, which has no Go code but whose node_modules can contain .go files.
module github.com/eiradupree/yap/desktop

go 1.25
