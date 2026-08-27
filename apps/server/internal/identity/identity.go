// Package identity keeps the platform identity checks independent from OIDC
// transport details. Its only authority is the UID supplied by the platform
// ingress, OIDC UserInfo and the frozen tenant of this application instance.
package identity

import (
	"errors"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
)

var ErrMismatch = errors.New("identity mismatch")

func VerifyRole(value string) error {
	if value != string(domain.RoleNormal) && value != string(domain.RoleAdmin) {
		return ErrMismatch
	}
	return nil
}

// Verify requires every supplied value to be present and equal. It is used
// for identifiers from the same namespace, such as the session-bound gateway
// UID and the current ingress UID.
func Verify(values ...string) error {
	if len(values) == 0 || values[0] == "" {
		return ErrMismatch
	}
	for _, value := range values[1:] {
		if value == "" || value != values[0] {
			return ErrMismatch
		}
	}
	return nil
}

// ResolveRole accepts ADMIN only when both the OIDC groups claim and the
// platform ingress header agree. A normal role is the absence of ADMIN in
// both sources; it does not confer broader catalogue access.
func ResolveRole(groups []string, entranceRole string) (domain.Role, error) {
	if err := VerifyRole(entranceRole); err != nil {
		return "", err
	}
	groupAdmin := false
	for _, group := range groups {
		if group == string(domain.RoleAdmin) {
			groupAdmin = true
			break
		}
	}
	if groupAdmin != (entranceRole == string(domain.RoleAdmin)) {
		return "", ErrMismatch
	}
	if groupAdmin {
		return domain.RoleAdmin, nil
	}
	return domain.RoleNormal, nil
}
