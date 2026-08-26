package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"time"
)

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
	Device         uint64
	Inode          uint64
	VerifiedAt     time.Time
}

type sourceResolver interface {
	Resolve(context.Context, sourceRequest) (resolvedSource, error)
}

var errPlatformSourceNotReady = errors.New("platform source resolver is not configured")

// platformSourceResolver is intentionally conservative until Lazycat exposes
// the documented appvar.other.read directory/handle/stream contract. Keeping
// this as an adapter prevents scanner code from growing host-path fallbacks.
type platformSourceResolver struct{}

func (platformSourceResolver) Resolve(context.Context, sourceRequest) (resolvedSource, error) {
	return resolvedSource{}, errPlatformSourceNotReady
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
		Root:           root,
		DeployID:       request.DeployID,
		Projection:     "fixture-directory",
		AdapterVersion: "fixture-v1",
		ReadOnly:       sourceReadOnly(root),
		Device:         device,
		Inode:          inode,
		VerifiedAt:     time.Now().UTC(),
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
		return sourceRequest{}, errors.New("platform source resolver is not configured")
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
		if app.SourceRoot != "" {
			resolver = fixtureSourceResolver{root: app.SourceRoot}
		} else {
			resolver = platformSourceResolver{}
		}
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
	return resolved, nil
}
