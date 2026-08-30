package httpapi

import (
	"net/http"
	"strings"
)

type authPageCopy struct {
	Language    string
	Title       string
	Eyebrow     string
	Heading     string
	Description string
	Button      string
	Notice      string
}

func authCopy(request *http.Request, reason string) authPageCopy {
	english := strings.HasPrefix(strings.ToLower(request.Header.Get("Accept-Language")), "en")
	if english {
		copy := authPageCopy{
			Language:    "en",
			Title:       "Sign in · Mimi App Backup",
			Eyebrow:     "MIMI APP BACKUP",
			Heading:     "Protect application data after you sign in.",
			Description: "All product pages require Lazycat OIDC. Backups write only to the signed-in account’s drive.",
			Button:      "Continue with Lazycat OIDC",
		}
		if reason == "identity_mismatch" {
			copy.Notice = "Your previous session did not match this application instance and was cleared. Authorize again with the Lazycat account that owns this instance."
		}
		return copy
	}
	copy := authPageCopy{
		Language:    "zh-CN",
		Title:       "登录 · 咪咪应用备份",
		Eyebrow:     "MIMI APP BACKUP",
		Heading:     "登录后开始保护应用数据",
		Description: "所有业务页面都需要经过懒猫 OIDC 登录。备份只写入当前账号自己的网盘。",
		Button:      "使用懒猫 OIDC 登录",
	}
	if reason == "identity_mismatch" {
		copy.Notice = "上一段会话与当前懒猫账号不一致，已安全退出。请重新登录。"
	}
	return copy
}

func (s *Server) renderLoginPage(w http.ResponseWriter, r *http.Request, reason, returnTo string) {
	copy := authCopy(r, reason)
	notice := ""
	if copy.Notice != "" {
		notice = `<div class="notice"><span class="notice-mark">!</span><p>` + templateEscape(copy.Notice) + `</p></div>`
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(`<!doctype html>
<html lang="` + templateEscape(copy.Language) + `">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>` + templateEscape(copy.Title) + `</title>
  <style>
    :root { color: #1e2b40; background: #f2f6fc; font-family: "Avenir Next", "SF Pro Display", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #f2f6fc; }
    .shell { width: min(420px, calc(100% - 32px)); }
    .intro { padding: 0; color: #1e2b40; background: transparent; }
    .brand { display: flex; align-items: center; gap: 11px; margin-bottom: 26px; }
    .brand-mark { width: 40px; height: 40px; overflow: hidden; border-radius: 12px; background: #fff; box-shadow: 0 7px 16px rgba(30,59,114,.2); }
    .brand-mark img { width: 100%; height: 100%; object-fit: cover; }
    .brand-name { font-size: 15px; font-weight: 780; letter-spacing: -.02em; }
    .brand-sub { margin-top: 3px; color: #8b9ab0; font-size: 10px; letter-spacing: .03em; }
    .intro-copy { margin-bottom: 18px; }
    .eyebrow { color: #1e3b72; font-size: 10px; font-weight: 750; letter-spacing: .1em; }
    h1 { margin: 7px 0 0; font-size: 25px; line-height: 1.15; letter-spacing: -.028em; }
    .description { margin: 8px 0 0; color: #60708a; font-size: 13px; line-height: 1.55; }
    .sign-in { padding: 18px; border: 1px solid #dbe4f0; border-radius: 16px; background: #fff; box-shadow: 0 1px 3px rgba(28,51,87,.08), 0 12px 30px rgba(28,51,87,.05); }
    .notice { display: flex; gap: 10px; margin: 0 0 18px; padding: 13px 14px; border: 1px solid #f3d19b; border-radius: 10px; color: #80501c; background: #fff3df; }
    .notice-mark { width: 20px; height: 20px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #aa6418; font-size: 12px; font-weight: 900; }
    .notice p { margin: 0; font-size: 12px; line-height: 1.55; }
    form { margin: 0; }
    button { width: 100%; min-height: 38px; border: 0; border-radius: 9px; color: #fff; background: #1e3b72; box-shadow: 0 7px 16px rgba(30,59,114,.2); cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; transition: background-color .16s ease, transform .16s ease; }
    button:hover { background: #142b58; }
    button:active { transform: scale(.97); }
    @media (max-width: 520px) { body { padding: 16px; } .shell { width: min(420px, 100%); } }
  </style>
</head>
<body>
  <main class="shell">
    <section class="intro" aria-labelledby="login-heading">
      <div class="brand"><div class="brand-mark"><img src="/assets/lzc-icon.png" alt=""></div><div><div class="brand-name">咪咪应用备份</div><div class="brand-sub">MIMI BACKUP · V1</div></div></div>
      <div class="intro-copy"><div class="eyebrow">` + templateEscape(copy.Eyebrow) + `</div><h1 id="login-heading">` + templateEscape(copy.Heading) + `</h1><p class="description">` + templateEscape(copy.Description) + `</p></div>
    </section>
    <section class="sign-in" aria-label="` + templateEscape(copy.Button) + `">
      ` + notice + `
      <form method="post" action="/auth/login"><input type="hidden" name="return_to" value="` + templateEscape(returnTo) + `"><button type="submit">` + templateEscape(copy.Button) + `</button></form>
    </section>
  </main>
</body>
</html>`))
}
