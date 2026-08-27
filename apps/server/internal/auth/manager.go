package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	"cloud.lazycat.app.backup/apps/server/internal/identity"
	"cloud.lazycat.app.backup/apps/server/internal/persistence"
	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

const CookieName = "lazycat_backup_session"

var (
	ErrSessionRequired  = errors.New("session required")
	ErrIdentityMismatch = identity.ErrMismatch
)

type Config struct {
	// TransactionScope identifies this app deployment while an OIDC flow is in
	// progress. It is not a user identity and must never be compared with a UID.
	TransactionScope string
	// TenantUID is retained only for callers built before TransactionScope.
	// It is used as a transaction scope, never as an authenticated user UID.
	TenantUID    string
	ClientID     string
	ClientSecret string
	IssuerURL    string
	AuthURL      string
	TokenURL     string
	UserInfoURL  string
	SessionTTL   time.Duration
}

type Manager struct {
	store    *persistence.Store
	config   Config
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	endpoint oauth2.Endpoint
	scope    string
}

func New(ctx context.Context, store *persistence.Store, config Config) (*Manager, error) {
	if store == nil {
		return nil, errors.New("control store is required")
	}
	scope := config.TransactionScope
	if scope == "" {
		scope = config.TenantUID
	}
	if scope == "" || config.ClientID == "" || config.ClientSecret == "" || config.IssuerURL == "" {
		return nil, errors.New("OIDC configuration is incomplete")
	}
	if config.SessionTTL <= 0 {
		config.SessionTTL = 8 * time.Hour
	}
	provider, err := oidc.NewProvider(ctx, config.IssuerURL)
	if err != nil {
		return nil, fmt.Errorf("discover OIDC provider: %w", err)
	}
	endpoint := provider.Endpoint()
	if config.AuthURL != "" {
		endpoint.AuthURL = config.AuthURL
	}
	if config.TokenURL != "" {
		endpoint.TokenURL = config.TokenURL
	}
	return &Manager{store: store, config: config, provider: provider, verifier: provider.Verifier(&oidc.Config{ClientID: config.ClientID}), endpoint: endpoint, scope: scope}, nil
}

func randomValue() (string, error) {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func safeReturnTo(value string) string {
	if value == "" || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") {
		return "/"
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.IsAbs() {
		return "/"
	}
	return value
}

func (m *Manager) LoginURL(ctx context.Context, entranceUID, redirectURI, returnTo string) (string, error) {
	return m.startLogin(ctx, redirectURI, returnTo)
}

// LoginURLWithRole retains the existing handler contract. The gateway UID is
// captured by the authenticated OIDC callback and stored with the session.
func (m *Manager) LoginURLWithRole(ctx context.Context, entranceUID, entranceRole, redirectURI, returnTo string) (string, error) {
	return m.startLogin(ctx, redirectURI, returnTo)
}

func (m *Manager) startLogin(ctx context.Context, redirectURI, returnTo string) (string, error) {
	state, err := randomValue()
	if err != nil {
		return "", err
	}
	nonce, err := randomValue()
	if err != nil {
		return "", err
	}
	verifier, err := randomValue()
	if err != nil {
		return "", err
	}
	if err := m.store.PurgeExpiredLoginTransactions(ctx, time.Now().UTC()); err != nil {
		return "", err
	}
	transaction := domain.LoginTransaction{TenantUID: m.scope, Nonce: nonce, Verifier: verifier, ReturnTo: safeReturnTo(returnTo), RedirectURI: redirectURI, ExpiresAt: time.Now().UTC().Add(10 * time.Minute)}
	if err := m.store.CreateLoginTransaction(ctx, state, transaction); err != nil {
		return "", err
	}
	config := oauth2.Config{ClientID: m.config.ClientID, ClientSecret: m.config.ClientSecret, Endpoint: m.endpoint, RedirectURL: redirectURI, Scopes: []string{oidc.ScopeOpenID, "profile", "email", "groups"}}
	return config.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)), nil
}

func (m *Manager) CompleteLogin(ctx context.Context, entranceUID, entranceRole, state, code string) (domain.Session, string, string, error) {
	if code == "" {
		return domain.Session{}, "", "", errors.New("authorization code is required")
	}
	gatewayUID := strings.TrimSpace(entranceUID)
	if gatewayUID == "" {
		return domain.Session{}, "", "", errors.New("Lazycat gateway identity is required")
	}
	transaction, err := m.store.ConsumeLoginTransaction(ctx, state, m.scope, time.Now().UTC())
	if err != nil {
		return domain.Session{}, "", "", err
	}
	config := oauth2.Config{ClientID: m.config.ClientID, ClientSecret: m.config.ClientSecret, Endpoint: m.endpoint, RedirectURL: transaction.RedirectURI}
	token, err := config.Exchange(ctx, code, oauth2.VerifierOption(transaction.Verifier))
	if err != nil {
		return domain.Session{}, "", "", fmt.Errorf("exchange OIDC authorization code: %w", err)
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		return domain.Session{}, "", "", errors.New("OIDC provider omitted id_token")
	}
	idToken, err := m.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return domain.Session{}, "", "", fmt.Errorf("verify OIDC id_token: %w", err)
	}
	var idClaims struct {
		Nonce   string `json:"nonce"`
		Subject string `json:"sub"`
	}
	if err := idToken.Claims(&idClaims); err != nil {
		return domain.Session{}, "", "", err
	}
	if idClaims.Nonce != transaction.Nonce {
		return domain.Session{}, "", "", errors.New("OIDC nonce mismatch")
	}
	user, err := m.userInfo(ctx, token)
	if err != nil {
		return domain.Session{}, "", "", err
	}
	if user.Subject == "" {
		user.Subject = idClaims.Subject
	}
	if user.Subject == "" || user.UID == "" {
		return domain.Session{}, "", "", errors.New("OIDC userinfo is incomplete")
	}
	role := roleFor(user.Groups)
	now := time.Now().UTC()
	expires := now.Add(m.config.SessionTTL)
	if !idToken.Expiry.IsZero() && idToken.Expiry.Before(expires) {
		expires = idToken.Expiry
	}
	// The OIDC profile UID and the Lazycat gateway UID are different identity
	// namespaces. Keep both: the gateway UID scopes platform data and is the
	// only value compared on subsequent ingress requests.
	session := domain.Session{Subject: user.Subject, UID: user.UID, GatewayUID: gatewayUID, Name: user.Name, Email: user.Email, Groups: user.Groups, Role: role, TenantUID: gatewayUID, CreatedAt: now, ExpiresAt: expires}
	rawSessionID, err := randomValue()
	if err != nil {
		return domain.Session{}, "", "", err
	}
	if err := m.store.CreateSession(ctx, rawSessionID, session); err != nil {
		return domain.Session{}, "", "", err
	}
	return session, rawSessionID, transaction.ReturnTo, nil
}

type userInfo struct {
	Subject string   `json:"sub"`
	UID     string   `json:"preferred_username"`
	Name    string   `json:"name"`
	Email   string   `json:"email"`
	Groups  []string `json:"groups"`
}

func (m *Manager) userInfo(ctx context.Context, token *oauth2.Token) (userInfo, error) {
	var result userInfo
	if m.config.UserInfoURL != "" {
		request, err := http.NewRequestWithContext(ctx, http.MethodGet, m.config.UserInfoURL, nil)
		if err != nil {
			return result, err
		}
		request.Header.Set("Authorization", "Bearer "+token.AccessToken)
		response, err := oauth2.NewClient(ctx, oauth2.StaticTokenSource(token)).Do(request)
		if err != nil {
			return result, fmt.Errorf("load OIDC userinfo: %w", err)
		}
		defer response.Body.Close()
		if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
			return result, fmt.Errorf("load OIDC userinfo: status %d", response.StatusCode)
		}
		if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
			return result, fmt.Errorf("decode OIDC userinfo: %w", err)
		}
		return result, nil
	}
	info, err := m.provider.UserInfo(ctx, oauth2.StaticTokenSource(token))
	if err != nil {
		return result, fmt.Errorf("load OIDC userinfo: %w", err)
	}
	if err := info.Claims(&result); err != nil {
		return result, fmt.Errorf("decode OIDC userinfo: %w", err)
	}
	return result, nil
}

func roleFor(groups []string) domain.Role {
	for _, group := range groups {
		if group == string(domain.RoleAdmin) {
			return domain.RoleAdmin
		}
	}
	return domain.RoleNormal
}

func (m *Manager) Session(ctx context.Context, r *http.Request) (domain.Session, error) {
	cookie, err := r.Cookie(CookieName)
	if err != nil || cookie.Value == "" {
		return domain.Session{}, ErrSessionRequired
	}
	session, err := m.store.Session(ctx, cookie.Value, time.Now().UTC())
	if errors.Is(err, domain.ErrNotFound) {
		return domain.Session{}, ErrSessionRequired
	}
	if err != nil {
		return domain.Session{}, err
	}
	if identity.Verify(session.GatewayUID, r.Header.Get("X-HC-User-ID")) != nil {
		_ = m.store.DeleteSession(ctx, cookie.Value)
		return domain.Session{}, ErrIdentityMismatch
	}
	return session, nil
}

func (m *Manager) Logout(ctx context.Context, r *http.Request) {
	if cookie, err := r.Cookie(CookieName); err == nil {
		_ = m.store.DeleteSession(ctx, cookie.Value)
	}
}

func SetSessionCookie(w http.ResponseWriter, rawID string, expires time.Time) {
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: rawID, Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, Expires: expires, MaxAge: int(time.Until(expires).Seconds())})
}
func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: "", Path: "/", HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
}
