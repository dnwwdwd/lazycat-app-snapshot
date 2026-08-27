package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// LZCOS v1.6 exposes the cross-application appvar projection inside the
// business container only when the compatibility permission
// PERM_OTHER_APP_DATA_ADMIN is granted. This is intentionally a fixed
// container path; callers may not override it with a host path.
const defaultRuntimeAppvarRoot = "/lzcapp/run/data/app/var"

// sourceRequest is deliberately smaller than pocApplication. It contains the
// identity that the catalog adapter has already checked; it never contains a
// browser-supplied path or storage UID.
type sourceRequest struct {
	TenantUID string
	AppID     string
	DeployID  string
	OwnerUID  string
	Multi     bool
}

// resolvedSource is the only source representation accepted by scanning and
// snapshot code. Root is server-side and is never serialized to the browser.
type resolvedSource struct {
	Root           string
	DeployID       string
	Projection     string
	AdapterVersion string
	ReadOnly       bool
	// ReadOnlyMode describes how the provider guarantees that this service
	// only performs reads. A filesystem mode is backed by a read-only mount;
	// service-enforced mode is used by the legacy LZCOS projection, whose
	// compatibility mount is writable at the kernel level but is never opened
	// with write flags by this process.
	ReadOnlyMode string
	// EnforceReadOnly is set by a platform/documented provider. Fixture
	// directories are intentionally writable so local tests can create their
	// input data; a real projection must prove read-only before it is used.
	EnforceReadOnly bool
	Device          uint64
	Inode           uint64
	VerifiedAt      time.Time
}

type sourceResolver interface {
	Resolve(context.Context, sourceRequest) (resolvedSource, error)
}

type chainedSourceResolver struct {
	providers []sourceResolver
}

func (r chainedSourceResolver) Resolve(ctx context.Context, request sourceRequest) (resolvedSource, error) {
	var last error
	for _, provider := range r.providers {
		resolved, err := provider.Resolve(ctx, request)
		if err == nil {
			return resolved, nil
		}
		last = err
		if !errors.Is(err, errSourceContractUnsupported) && !errors.Is(err, errPlatformSourceNotReady) {
			return resolvedSource{}, err
		}
	}
	if last != nil {
		return resolvedSource{}, last
	}
	return resolvedSource{}, errPlatformSourceNotReady
}

var (
	errPlatformSourceNotReady       = errors.New("SOURCE_NOT_READY")
	errPlatformResolverNoProjection = errors.New("PLATFORM_RESOLVER_FOUND_BUT_NO_CALLER_VISIBLE_PROJECTION")
	errSourceContractUnsupported    = errors.New("SOURCE_CONTRACT_UNSUPPORTED")
	errRuntimeProjectionNotVisible  = errors.New("RUNTIME_APPVAR_PROJECTION_NOT_VISIBLE")
)

// platformSourceResolver is intentionally conservative until Lazycat exposes
// the documented appvar.other.read directory/handle/stream contract. Keeping
// this as an adapter prevents scanner code from growing host-path fallbacks.
type platformSourceResolver struct{}

func (platformSourceResolver) Resolve(context.Context, sourceRequest) (resolvedSource, error) {
	// QueryApplication can prove that the catalog entry exists, but the public
	// runtime contract currently does not expose a caller-visible appvar source
	// for that deploy. Keep this error distinct from a missing catalog so the UI
	// and API can point at the platform projection gap without suggesting a
	// package-local path configuration fix.
	return resolvedSource{}, errPlatformResolverNoProjection
}

// runtimeAppvarResolver consumes the projection that LZCOS creates when the
// compatibility PERM_OTHER_APP_DATA_ADMIN permission is granted. The path is
// inside the business container; no host path is inferred or accepted. The
// projection exposes the appvar namespace, so the catalog-validated appid is
// the only path component used to select a target. Deploy IDs are retained as
// the binding identity and are accepted as a directory name only when the
// platform layout explicitly uses them.
type runtimeAppvarResolver struct {
	root             string
	layout           string
	version          string
	allowNonstandard bool // test-only escape hatch; production uses the fixed runtime root
}

func (r runtimeAppvarResolver) Resolve(_ context.Context, request sourceRequest) (resolvedSource, error) {
	if strings.TrimSpace(r.root) == "" {
		return resolvedSource{}, errPlatformSourceNotReady
	}
	if request.TenantUID == "" || request.OwnerUID == "" || request.OwnerUID != request.TenantUID {
		return resolvedSource{}, errors.New("source violates tenant boundary")
	}
	if request.DeployID == "" || request.AppID == "" {
		return resolvedSource{}, errors.New("source deploy mapping is incomplete")
	}
	if err := validateMountIdentifier(request.DeployID); err != nil {
		return resolvedSource{}, err
	}
	if err := validateMountIdentifier(request.AppID); err != nil {
		return resolvedSource{}, err
	}
	if !r.allowNonstandard && filepath.Clean(r.root) != defaultRuntimeAppvarRoot {
		return resolvedSource{}, errors.New("runtime appvar projection root is not the LZCOS runtime path")
	}
	root, err := canonicalDirectory(r.root)
	if err != nil {
		return resolvedSource{}, fmt.Errorf("%w: runtime appvar projection root: %v", errRuntimeProjectionNotVisible, err)
	}
	layout := strings.TrimSpace(r.layout)
	if layout == "" {
		layout = "appid"
	}
	candidate, err := mountCandidate(root, layout, request)
	if err != nil {
		return resolvedSource{}, err
	}
	if info, err := os.Lstat(candidate); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return resolvedSource{}, fmt.Errorf("%w: runtime appvar projection target is a symlink", errRuntimeProjectionNotVisible)
	}
	resolved, err := canonicalDirectory(candidate)
	if err != nil {
		return resolvedSource{}, fmt.Errorf("%w: runtime appvar projection for deploy %q: %v", errRuntimeProjectionNotVisible, request.DeployID, err)
	}
	if err := ensureWithin(root, resolved); err != nil {
		return resolvedSource{}, err
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return resolvedSource{}, err
	}
	version := strings.TrimSpace(r.version)
	if version == "" {
		version = "lzcos-runtime-appvar-v1"
	}
	device, inode := sourceDeviceInode(info)
	return resolvedSource{
		Root:            resolved,
		DeployID:        request.DeployID,
		Projection:      "runtime-appvar",
		AdapterVersion:  version,
		ReadOnly:        true,
		ReadOnlyMode:    "service-enforced",
		EnforceReadOnly: false,
		Device:          device,
		Inode:           inode,
		VerifiedAt:      time.Now().UTC(),
	}, nil
}

// sdkSourceResolver is a deliberately explicit seam for a future official
// deploy-scoped SDK method. QueryApplication only returns application
// metadata, so it must never be treated as a file reader. Until Lazycat adds a
// method that accepts a deploy ID and returns list/stat/read/stream access, the
// provider reports a stable unsupported error and the resolver may continue to
// the documented mount provider.
type sdkSourceResolver struct {
	method  string
	version string
}

func (r sdkSourceResolver) Resolve(context.Context, sourceRequest) (resolvedSource, error) {
	if strings.TrimSpace(r.method) == "" {
		return resolvedSource{}, errSourceContractUnsupported
	}
	return resolvedSource{}, fmt.Errorf("%w: %s", errSourceContractUnsupported, r.method)
}

// documentedMountResolver maps an appvar projection supplied by an official
// Lazycat contract. The root and layout are server-side environment values;
// the browser can only submit a deploy ID that has already passed the catalog
// owner check. No host path is inferred when the root is absent.
type documentedMountResolver struct {
	root    string
	layout  string
	version string
}

func (r documentedMountResolver) Resolve(_ context.Context, request sourceRequest) (resolvedSource, error) {
	if r.root == "" {
		return resolvedSource{}, errPlatformSourceNotReady
	}
	if request.TenantUID == "" || request.OwnerUID == "" || request.OwnerUID != request.TenantUID {
		return resolvedSource{}, errors.New("source violates tenant boundary")
	}
	if request.DeployID == "" || request.AppID == "" {
		return resolvedSource{}, errors.New("source deploy mapping is incomplete")
	}
	if err := validateMountIdentifier(request.DeployID); err != nil {
		return resolvedSource{}, err
	}
	if err := validateMountIdentifier(request.AppID); err != nil {
		return resolvedSource{}, err
	}
	root, err := canonicalDirectory(r.root)
	if err != nil {
		return resolvedSource{}, fmt.Errorf("appvar projection root: %w", err)
	}
	layout := strings.TrimSpace(r.layout)
	if layout == "" {
		return resolvedSource{}, errors.New("appvar projection layout is not configured")
	}
	candidate, err := mountCandidate(root, layout, request)
	if err != nil {
		return resolvedSource{}, err
	}
	if info, err := os.Lstat(candidate); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return resolvedSource{}, errors.New("appvar projection target is a symlink")
	}
	resolved, err := canonicalDirectory(candidate)
	if err != nil {
		return resolvedSource{}, fmt.Errorf("appvar projection for deploy %q: %w", request.DeployID, err)
	}
	if err := ensureWithin(root, resolved); err != nil {
		return resolvedSource{}, err
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return resolvedSource{}, err
	}
	readOnly := sourceReadOnly(resolved)
	readOnlyMode := "permissions"
	if readOnly {
		readOnlyMode = "filesystem"
	}
	if !readOnly {
		readOnly, err = permissionsReadOnly(resolved)
		if err != nil {
			return resolvedSource{}, err
		}
	}
	if !readOnly {
		return resolvedSource{}, errors.New("appvar projection is writable")
	}
	device, inode := sourceDeviceInode(info)
	version := r.version
	if version == "" {
		version = "documented-mount-v1"
	}
	return resolvedSource{
		Root:            resolved,
		DeployID:        request.DeployID,
		Projection:      "documented-mount",
		AdapterVersion:  version,
		ReadOnly:        true,
		ReadOnlyMode:    readOnlyMode,
		EnforceReadOnly: true,
		Device:          device,
		Inode:           inode,
		VerifiedAt:      time.Now().UTC(),
	}, nil
}

func permissionsReadOnly(root string) (bool, error) {
	readOnly := true
	errWritableEntry := errors.New("writable projection entry")
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.Mode().Perm()&0o222 != 0 {
			readOnly = false
			return errWritableEntry
		}
		return nil
	})
	if errors.Is(err, errWritableEntry) {
		return false, nil
	}
	return readOnly, err
}

func validateMountIdentifier(value string) error {
	if value == "" || value == "." || value == ".." || strings.ContainsAny(value, `/\\`) {
		return errors.New("unsafe appvar deploy mapping")
	}
	return nil
}

func canonicalDirectory(path string) (string, error) {
	if path == "" {
		return "", errors.New("directory is empty")
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("source root is not a directory")
	}
	return resolved, nil
}

func ensureWithin(root, candidate string) error {
	rel, err := filepath.Rel(root, candidate)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return errors.New("appvar projection escapes configured root")
	}
	return nil
}

func mountCandidate(root, layout string, request sourceRequest) (string, error) {
	segments := []string{}
	switch layout {
	case "appid":
		segments = []string{request.AppID}
	case "deploy-id":
		segments = []string{request.DeployID}
	case "appid/deploy-id":
		segments = []string{request.AppID, request.DeployID}
	case "appid/appvar":
		segments = []string{request.AppID, "appvar"}
	case "deploy-id/appvar":
		segments = []string{request.DeployID, "appvar"}
	case "appid/deploy-id/appvar":
		segments = []string{request.AppID, request.DeployID, "appvar"}
	case "discover":
		return discoverMountCandidate(root, request.DeployID)
	default:
		// A configured layout may use these two placeholders, but each path
		// component is validated before it is joined to the configured root.
		if !strings.Contains(layout, "{deploy_id}") && !strings.Contains(layout, "{appid}") {
			return "", fmt.Errorf("unsupported appvar projection layout %q", layout)
		}
		replaced := strings.ReplaceAll(strings.ReplaceAll(layout, "{deploy_id}", request.DeployID), "{appid}", request.AppID)
		segments = strings.Split(filepath.ToSlash(replaced), "/")
	}
	for _, segment := range segments {
		if segment == "" || segment == "." || segment == ".." || strings.ContainsAny(segment, `/\\`) {
			return "", errors.New("unsafe appvar projection layout")
		}
	}
	return filepath.Join(append([]string{root}, segments...)...), nil
}

func discoverMountCandidate(root, deployID string) (string, error) {
	var matches []string
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == root {
			return nil
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		depth := len(strings.Split(filepath.ToSlash(rel), "/"))
		if depth > 3 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.IsDir() && filepath.Base(path) == deployID {
			matches = append(matches, path)
			return filepath.SkipDir
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	if len(matches) == 0 {
		return "", errors.New("appvar projection deploy mapping was not found")
	}
	if len(matches) != 1 {
		return "", errors.New("appvar projection deploy mapping is not unique")
	}
	return matches[0], nil
}

// fixtureSourceResolver uses the server-only SourceRoot carried by local test
// fixtures. It implements the same output contract as the platform adapter so
// scan and snapshot tests exercise the production boundary.
type fixtureSourceResolver struct {
	root string
}

func (r fixtureSourceResolver) Resolve(_ context.Context, request sourceRequest) (resolvedSource, error) {
	if r.root == "" {
		return resolvedSource{}, errPlatformSourceNotReady
	}
	root, err := filepath.EvalSymlinks(r.root)
	if err != nil {
		return resolvedSource{}, err
	}
	info, err := os.Stat(root)
	if err != nil {
		return resolvedSource{}, err
	}
	if !info.IsDir() {
		return resolvedSource{}, errors.New("source root is not a directory")
	}
	device, inode := sourceDeviceInode(info)
	return resolvedSource{
		Root:            root,
		DeployID:        request.DeployID,
		Projection:      "fixture-directory",
		AdapterVersion:  "fixture-v1",
		ReadOnly:        sourceReadOnly(root),
		ReadOnlyMode:    "fixture",
		EnforceReadOnly: false,
		Device:          device,
		Inode:           inode,
		VerifiedAt:      time.Now().UTC(),
	}, nil
}

func sourceDeviceInode(info os.FileInfo) (uint64, uint64) {
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat == nil {
		return 0, 0
	}
	return uint64(stat.Dev), uint64(stat.Ino)
}

func sourceRequestFor(config pocConfig, app pocApplication) (sourceRequest, error) {
	if !config.ready() {
		return sourceRequest{}, errors.New("backup instance identity is missing")
	}
	if app.DeployID == "" || app.OwnerUID == "" {
		return sourceRequest{}, fmt.Errorf("%w: platform source mapping is incomplete", errPlatformSourceNotReady)
	}
	if app.OwnerUID != config.tenantUID {
		return sourceRequest{}, errors.New("source violates tenant boundary")
	}
	return sourceRequest{
		TenantUID: config.tenantUID,
		AppID:     app.AppID,
		DeployID:  app.DeployID,
		OwnerUID:  app.OwnerUID,
		Multi:     app.MultiInstance,
	}, nil
}

func resolveApplicationSource(ctx context.Context, config pocConfig, app pocApplication) (resolvedSource, error) {
	request, err := sourceRequestFor(config, app)
	if err != nil {
		return resolvedSource{}, err
	}
	resolver := config.resolver
	if resolver == nil {
		resolver = configuredSourceResolver(config, app)
	}
	resolved, err := resolver.Resolve(ctx, request)
	if err != nil {
		return resolvedSource{}, err
	}
	if resolved.Root == "" || resolved.DeployID != request.DeployID {
		return resolvedSource{}, errors.New("source resolver returned an invalid deploy mapping")
	}
	root, err := filepath.EvalSymlinks(resolved.Root)
	if err != nil {
		return resolvedSource{}, err
	}
	info, err := os.Stat(root)
	if err != nil {
		return resolvedSource{}, err
	}
	if !info.IsDir() {
		return resolvedSource{}, errors.New("source root is not a directory")
	}
	resolved.Root = root
	if resolved.VerifiedAt.IsZero() {
		resolved.VerifiedAt = time.Now().UTC()
	}
	if resolved.Device == 0 || resolved.Inode == 0 {
		resolved.Device, resolved.Inode = sourceDeviceInode(info)
	}
	if resolved.EnforceReadOnly && !resolved.ReadOnly {
		return resolvedSource{}, errors.New("source projection is writable")
	}
	return resolved, nil
}

// configuredSourceResolver keeps provider selection in one place. The SDK
// seam is attempted only when an explicit method name is configured; this
// prevents an unsupported SDK from masking a documented mount or local
// fixture. A configured mount is preferred over fixtures so production cannot
// accidentally read a test directory.
func configuredSourceResolver(config pocConfig, app pocApplication) sourceResolver {
	if config.sourceProjectionRoot != "" {
		var mount sourceResolver
		if strings.TrimSpace(config.sourceProjectionMode) == "runtime-appvar" {
			mount = runtimeAppvarResolver{
				root:             config.sourceProjectionRoot,
				layout:           config.sourceProjectionLayout,
				version:          config.sourceProjectionVersion,
				allowNonstandard: config.allowNonstandardSourceRoot,
			}
		} else {
			mount = documentedMountResolver{root: config.sourceProjectionRoot, layout: config.sourceProjectionLayout, version: config.sourceProjectionVersion}
		}
		if method := strings.TrimSpace(config.sourceSDKMethod); method != "" {
			return chainedSourceResolver{providers: []sourceResolver{sdkSourceResolver{method: method, version: config.sourceProjectionVersion}, mount}}
		}
		return mount
	}
	if method := strings.TrimSpace(config.sourceSDKMethod); method != "" {
		providers := []sourceResolver{sdkSourceResolver{method: method, version: config.sourceProjectionVersion}}
		if app.SourceRoot != "" {
			providers = append(providers, fixtureSourceResolver{root: app.SourceRoot})
		}
		return chainedSourceResolver{providers: providers}
	}
	if app.SourceRoot != "" {
		return fixtureSourceResolver{root: app.SourceRoot}
	}
	return platformSourceResolver{}
}
