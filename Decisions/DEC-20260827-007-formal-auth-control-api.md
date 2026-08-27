# DEC-20260827-007 — 正式服务使用 OIDC 会话、每用户控制库和同源应用 API

## 决定

V1 的首个正式服务运行 `apps/server/cmd/server`。它在当前多实例容器的 `/lzcapp/var/backup.sqlite` 保存带 `tenant_uid` 的登录事务、会话、当前用户应用目录、实例探测结果和同步状态。迁移启用 WAL、外键和 busy timeout；所有业务数据带 `tenant_uid`。

OIDC 使用 Authorization Code + PKCE。服务从 UserInfo 的 `preferred_username` 读取 profile UID，并在回调时单独保存网关注入的 `X-HC-User-ID`。会话按 `agent-desk` 的方式绑定 `gateway_uid`；业务请求只校验 `session.gateway_uid != X-HC-User-ID`，不比较 OIDC profile UID 和网关 UID。`LAZYCAT_APP_DEPLOY_UID` 是应用部署标识，只用于登录事务的内部作用域。OIDC 回调校验 `state`、`nonce`、授权码、ID Token、UserInfo 和网关 UID 是否存在；无会话时先展示同源登录页，只有用户点击按钮后才创建 PKCE 事务并跳转 OIDC；回调成功后进入首页。OIDC groups 决定显示角色，但不扩大数据范围。网关 UID 冲突会删除会话：API 返回稳定错误码 403，浏览器清除 Cookie 后回到登录页重新授权；两种路径都不提供业务数据。Cookie 仅保存随机会话 ID，控制库只保存其 SHA-256；Token、Cookie 原值、源目录绝对路径和其他用户记录不会进入 API 或日志。手动备份完成请求身份与实例校验后使用不随浏览器断开取消的入队上下文，避免网关断开中止控制库写入；worker 仍独立运行，且不会扩大当前租户边界。

正式 API 使用同源 Cookie 和 OpenAPI 3.1 契约。应用目录同步由单个可合并协调器执行，探测 worker 有上限；浏览器只能提交已在当前租户目录中存在的 `deploy_id`。POC 继续作为独立诊断命令，不进入正式服务导航或 API。

## 理由

Vite/React 原型已完成，Go 同源托管其静态资源可以保留现有页面结构，并让会话 Cookie 与 API 保持同源。控制库只保存当前容器的用户数据，仍保留 tenant 字段，避免未来运行形态变化时混合记录。

## 验证边界

本地构建检查只覆盖编译产物。真实设备仍需验证已登录业务请求的 `session.gateway_uid`/入口 Header 匹配，以及用户 A/B 的目录/API 隔离。该决定不改变已通过 POC 的 appvar 读取权限、固定投影或只读边界。
