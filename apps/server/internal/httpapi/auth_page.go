package httpapi

import (
	"net/http"
	"strings"
)

type authPageCopy struct {
	Language string
	Title    string
	Eyebrow  string
	Heading  string
	Button   string
	Notice   string
}

func authCopy(request *http.Request, reason string) authPageCopy {
	english := strings.HasPrefix(strings.ToLower(request.Header.Get("Accept-Language")), "en")
	if english {
		copy := authPageCopy{
			Language: "en",
			Title:    "Sign in · Mimi App Backup",
			Eyebrow:  "MIMI APP BACKUP",
			Heading:  "Keep your application data within reach.",
			Button:   "Continue with Lazycat OIDC",
		}
		if reason == "identity_mismatch" {
			copy.Notice = "Your previous session did not match this application instance and was cleared. Authorize again with the Lazycat account that owns this instance."
		}
		return copy
	}
	copy := authPageCopy{
		Language: "zh-CN",
		Title:    "登录 · 咪咪应用备份",
		Eyebrow:  "MIMI APP BACKUP",
		Heading:  "把应用数据，留在随时可取的地方。",
		Button:   "使用懒猫 OIDC 登录",
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
    :root { color: #172b50; background: #eef5ff; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Noto Sans SC", sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #eef5ff; }
    .shell { width: min(960px, 100%); min-height: 550px; display: grid; grid-template-columns: 1.1fr .9fr; overflow: hidden; border-radius: 28px; background: #fff; box-shadow: 0 28px 75px rgba(23,43,80,.16); }
    .intro { position: relative; overflow: hidden; padding: clamp(32px, 7vw, 72px); color: #fff; background: #172b50; }
    .intro::before, .intro::after { position: absolute; border-radius: 999px; content: ""; pointer-events: none; }
    .intro::before { width: 260px; height: 260px; top: -120px; right: -105px; background: rgba(255,184,68,.18); }
    .intro::after { width: 180px; height: 180px; bottom: -94px; left: -72px; background: rgba(126,136,222,.24); }
    .brand, .intro-copy { position: relative; z-index: 1; }
    .brand { display: flex; align-items: center; gap: 13px; }
    .brand-mark { width: 50px; height: 50px; overflow: hidden; border: 3px solid rgba(255,255,255,.16); border-radius: 17px; background: #edf4ff; box-shadow: 0 9px 20px rgba(0,0,0,.16); }
    .brand-mark img { width: 100%; height: 100%; object-fit: cover; }
    .brand-name { font-size: 16px; font-weight: 800; letter-spacing: .02em; }
    .brand-sub { margin-top: 3px; color: #a8bbdb; font-size: 10px; letter-spacing: .13em; }
    .intro-copy { margin-top: clamp(76px, 15vh, 145px); max-width: 420px; }
    .eyebrow { color: #ffcd78; font-size: 11px; font-weight: 800; letter-spacing: .17em; }
    h1 { margin: 13px 0 0; font-size: clamp(30px, 3.4vw, 44px); line-height: 1.17; letter-spacing: -.045em; text-wrap: balance; }
    .sign-in { display: flex; flex-direction: column; justify-content: center; padding: clamp(32px, 6vw, 64px); }
    .notice { display: flex; gap: 10px; margin: 0 0 20px; padding: 12px; border: 1px solid #f2d8a0; border-radius: 14px; color: #806126; background: #fff8e9; }
    .notice-mark { width: 20px; height: 20px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 50%; color: #fff; background: #e9941d; font-size: 12px; font-weight: 900; }
    .notice p { margin: 0; font-size: 12px; line-height: 1.55; }
    form { margin: 0; }
    button { width: 100%; min-height: 48px; border: 0; border-radius: 13px; color: #172b50; background: #ffb844; box-shadow: 0 8px 16px rgba(233,148,29,.2); cursor: pointer; font: inherit; font-size: 14px; font-weight: 800; transition: transform .18s ease, background .18s ease; }
    button:hover { background: #ffc45c; transform: translateY(-1px); }
    button:focus-visible { outline: 3px solid rgba(233,148,29,.45); outline-offset: 3px; }
    @media (max-width: 720px) { body { padding: 14px; } .shell { min-height: 0; grid-template-columns: 1fr; border-radius: 23px; } .intro { min-height: 275px; padding: 30px; } .intro-copy { margin-top: 46px; } .sign-in { padding: 34px 30px 39px; } }
  </style>
</head>
<body>
  <main class="shell">
    <section class="intro" aria-labelledby="login-heading">
      <div class="brand"><div class="brand-mark"><img src="/assets/lzc-icon.png" alt=""></div><div><div class="brand-name">咪咪应用备份</div><div class="brand-sub">MIMI BACKUP · V1</div></div></div>
      <div class="intro-copy"><div class="eyebrow">` + templateEscape(copy.Eyebrow) + `</div><h1 id="login-heading">` + templateEscape(copy.Heading) + `</h1></div>
    </section>
    <section class="sign-in" aria-label="` + templateEscape(copy.Button) + `">
      ` + notice + `
      <form method="post" action="/auth/login"><input type="hidden" name="return_to" value="` + templateEscape(returnTo) + `"><button type="submit">` + templateEscape(copy.Button) + `</button></form>
    </section>
  </main>
</body>
</html>`))
}
