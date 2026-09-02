// Package tenant provides the process-local tenant binding for a multi-instance
// Lazycat application. The deployment UID is not a user identity, so services
// start unbound and receive the gateway UID from the first authenticated
// request.
package tenant

import (
	"errors"
	"strings"
	"sync"
)

var ErrConflict = errors.New("tenant scope is already bound to another user")

// Scope is shared by the HTTP-facing services and the background scheduler.
// A multi-instance container must remain bound to one gateway user for its
// lifetime; changing users in the same process is rejected instead of
// switching data and notification destinations underneath running work.
type Scope struct {
	mu  sync.RWMutex
	uid string
}

func New(initial string) *Scope {
	return &Scope{uid: strings.TrimSpace(initial)}
}

func (s *Scope) Bind(uid string) error {
	if s == nil {
		return errors.New("tenant scope is nil")
	}
	uid = strings.TrimSpace(uid)
	if uid == "" {
		return errors.New("tenant UID is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.uid != "" && s.uid != uid {
		return ErrConflict
	}
	s.uid = uid
	return nil
}

func (s *Scope) UID() string {
	if s == nil {
		return ""
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.uid
}
