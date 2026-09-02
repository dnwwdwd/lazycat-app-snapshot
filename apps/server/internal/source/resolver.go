package source

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

const RuntimeAppvarRoot = "/lzcapp/run/data/app/var"

type Error struct {
	Code string
	Err  error
}

func (e *Error) Error() string { return e.Code + ": " + e.Err.Error() }
func (e *Error) Unwrap() error { return e.Err }
func Code(err error) string {
	var sourceErr *Error
	if errors.As(err, &sourceErr) {
		return sourceErr.Code
	}
	return "PROBE_FAILED"
}

type Request struct {
	TenantUID, AppID, DeployID, OwnerUID string
	// AllowSharedApp is true for catalog entries returned by the platform's
	// all-installed-apps query. Application ownership does not restrict use of
	// an installed app; the resolved path is still pinned to the appvar
	// projection and the caller's control database remains tenant-scoped.
	AllowSharedApp bool
	// AdminScope is retained for source compatibility with older callers. It is
	// treated as the same all-installed-apps scope and is not tied to role.
	AdminScope bool
}
type Resolved struct{ Root, ReadOnlyMode string }
type Resolver struct {
	Root                 string
	AllowNonstandardRoot bool
}

func (r Resolver) Resolve(request Request) (Resolved, error) {
	if request.TenantUID == "" || request.OwnerUID == "" || (!request.AllowSharedApp && !request.AdminScope && request.OwnerUID != request.TenantUID) {
		return Resolved{}, &Error{Code: "SOURCE_OWNER_MISMATCH", Err: errors.New("source owner does not match tenant")}
	}
	if err := validateID(request.AppID); err != nil {
		return Resolved{}, &Error{Code: "SOURCE_INSTANCE_NOT_FOUND", Err: err}
	}
	if err := validateID(request.DeployID); err != nil {
		return Resolved{}, &Error{Code: "SOURCE_INSTANCE_NOT_FOUND", Err: err}
	}
	root := r.Root
	if root == "" {
		root = RuntimeAppvarRoot
	}
	if !r.AllowNonstandardRoot && filepath.Clean(root) != RuntimeAppvarRoot {
		return Resolved{}, &Error{Code: "RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE", Err: errors.New("runtime appvar root is invalid")}
	}
	resolvedRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return Resolved{}, &Error{Code: "RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE", Err: err}
	}
	rootInfo, err := os.Stat(resolvedRoot)
	if err != nil || !rootInfo.IsDir() {
		return Resolved{}, &Error{Code: "RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE", Err: errors.New("runtime appvar root is unavailable")}
	}
	candidate := filepath.Join(resolvedRoot, request.AppID)
	info, err := os.Lstat(candidate)
	if err != nil {
		return Resolved{}, projectionError(err)
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return Resolved{}, &Error{Code: "SOURCE_PERMISSION_DENIED", Err: errors.New("source projection target is a symlink")}
	}
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		return Resolved{}, projectionError(err)
	}
	relative, err := filepath.Rel(resolvedRoot, resolved)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return Resolved{}, &Error{Code: "SOURCE_PERMISSION_DENIED", Err: errors.New("source escapes runtime projection")}
	}
	info, err = os.Stat(resolved)
	if err != nil {
		return Resolved{}, projectionError(err)
	}
	if !info.IsDir() {
		return Resolved{}, &Error{Code: "SOURCE_INSTANCE_NOT_FOUND", Err: errors.New("source is not a directory")}
	}
	return Resolved{Root: resolved, ReadOnlyMode: "service-enforced"}, nil
}

func projectionError(err error) error {
	if errors.Is(err, fs.ErrNotExist) {
		return &Error{Code: "SOURCE_PROJECTION_UNAVAILABLE", Err: err}
	}
	if errors.Is(err, fs.ErrPermission) {
		return &Error{Code: "SOURCE_PERMISSION_DENIED", Err: err}
	}
	return &Error{Code: "SOURCE_NOT_READY", Err: err}
}

func validateID(value string) error {
	if value == "" || value == "." || value == ".." || strings.ContainsAny(value, `/\\`) {
		return fmt.Errorf("unsafe source identifier")
	}
	return nil
}
