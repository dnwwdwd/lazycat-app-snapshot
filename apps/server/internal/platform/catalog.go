package platform

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	gohelper "gitee.com/linakesi/lzc-sdk/lang/go"
	"gitee.com/linakesi/lzc-sdk/lang/go/sys"
)

type Application struct {
	AppID         string `json:"appid"`
	Name          string `json:"name"`
	Version       string `json:"version"`
	Icon          string `json:"icon"`
	DeployID      string `json:"deploy_id"`
	OwnerUID      string `json:"owner_uid"`
	MultiInstance bool   `json:"multi_instance"`
}

type Catalog interface {
	List(context.Context, string, string) ([]Application, error)
}

type SDKCatalog struct{}

func (SDKCatalog) List(ctx context.Context, tenantUID, backupAppID string) ([]Application, error) {
	if tenantUID == "" {
		return nil, fmt.Errorf("tenant identity is required")
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	requestCtx := gohelper.WithRealUID(ctx, tenantUID)
	gateway, err := gohelper.NewAPIGateway(requestCtx)
	if err != nil {
		return nil, fmt.Errorf("connect to platform api gateway: %w", err)
	}
	defer gateway.Close()
	onlyOwner, ignorePending := false, true
	response, err := gateway.PkgManager.QueryApplication(requestCtx, &sys.QueryApplicationRequest{
		DeployIds: []string{}, OnlyOwner: &onlyOwner, IgnorePendingPkg: &ignorePending,
	})
	if err != nil {
		return nil, fmt.Errorf("query installed applications: %w", err)
	}
	result := make([]Application, 0, len(response.GetInfoList()))
	for _, info := range response.GetInfoList() {
		if info == nil || info.GetDeployId() == "" || info.GetOwner() == "" || info.GetAppid() == backupAppID {
			continue
		}
		name := strings.TrimSpace(info.GetTitle())
		if name == "" {
			// Unpublished packages may not have marketplace metadata. Keep the
			// instance usable with a readable package-derived label instead of
			// leaking the full package identifier into every table.
			name = fallbackApplicationName(info.GetAppid())
		}
		icon := strings.TrimSpace(info.GetIcon())
		if icon == "" {
			icon = platformIconURL(info.GetAppid())
		}
		result = append(result, Application{
			AppID: info.GetAppid(), Name: name, Version: info.GetVersion(), Icon: icon, DeployID: info.GetDeployId(),
			OwnerUID: info.GetOwner(), MultiInstance: info.GetMultiInstance(),
		})
	}
	return result, nil
}

func platformIconURL(appID string) string {
	issuer := strings.TrimSpace(os.Getenv("OIDC_ISSUER_URI"))
	if issuer == "" {
		return ""
	}
	parsed, err := url.Parse(issuer)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host + "/sys/icons/" + url.PathEscape(appID) + ".png"
}

func fallbackApplicationName(appID string) string {
	value := strings.TrimSpace(appID)
	for _, prefix := range []string{"cloud.lazycat.app.", "cloud.lazycat."} {
		value = strings.TrimPrefix(value, prefix)
	}
	parts := strings.FieldsFunc(value, func(r rune) bool { return r == '.' || r == '-' || r == '_' })
	if len(parts) == 0 {
		return appID
	}
	value = strings.Join(parts, " ")
	return strings.ToUpper(value[:1]) + value[1:]
}
