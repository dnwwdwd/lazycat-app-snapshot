package platform

import (
	"context"
	"fmt"
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
	onlyOwner, ignorePending := true, true
	response, err := gateway.PkgManager.QueryApplication(requestCtx, &sys.QueryApplicationRequest{
		DeployIds: []string{}, OnlyOwner: &onlyOwner, IgnorePendingPkg: &ignorePending,
	})
	if err != nil {
		return nil, fmt.Errorf("query current-user applications: %w", err)
	}
	result := make([]Application, 0, len(response.GetInfoList()))
	for _, info := range response.GetInfoList() {
		if info == nil || info.GetDeployId() == "" || info.GetOwner() != tenantUID || info.GetAppid() == backupAppID {
			continue
		}
		result = append(result, Application{
			AppID: info.GetAppid(), Name: info.GetTitle(), Version: info.GetVersion(), Icon: info.GetIcon(), DeployID: info.GetDeployId(),
			OwnerUID: info.GetOwner(), MultiInstance: info.GetMultiInstance(),
		})
	}
	return result, nil
}
