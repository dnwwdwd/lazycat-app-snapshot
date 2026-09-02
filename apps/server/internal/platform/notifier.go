package platform

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"cloud.lazycat.app.backup/apps/server/internal/domain"
	gohelper "gitee.com/linakesi/lzc-sdk/lang/go"
	"gitee.com/linakesi/lzc-sdk/lang/go/common"
)

// SDKNotifier delivers current-user notifications through Lazycat's
// MessageService. The optional user.notify permission is enforced by the
// platform; callers receive the error and can keep their primary operation
// successful.
type SDKNotifier struct{}

func (SDKNotifier) Notify(ctx context.Context, receiver string, notification domain.Notification) error {
	receiver = strings.TrimSpace(receiver)
	if receiver == "" {
		return errors.New("notification receiver is required")
	}
	if strings.TrimSpace(notification.Title) == "" || strings.TrimSpace(notification.Content) == "" {
		return errors.New("notification title and content are required")
	}
	requestCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	requestCtx = gohelper.WithRealUID(requestCtx, receiver)
	gateway, err := gohelper.NewAPIGateway(requestCtx)
	if err != nil {
		return fmt.Errorf("connect to platform message service: %w", err)
	}
	defer gateway.Close()
	_, err = gateway.Message.NewMessage(requestCtx, &common.NewMessageRequest{
		Receiver:    receiver,
		MessageType: common.MsgType_NORMAL,
		Title:       notification.Title,
		Content:     notification.Content,
		Meta:        notification.Meta,
	})
	if err != nil {
		return fmt.Errorf("create platform message: %w", err)
	}
	return nil
}
