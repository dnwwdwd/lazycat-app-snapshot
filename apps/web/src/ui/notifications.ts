export type BrowserNotificationPermission =
  | NotificationPermission
  | "unsupported";

function supported() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "Notification" in window
  );
}

export function browserNotificationPermission(): BrowserNotificationPermission {
  return supported() ? Notification.permission : "unsupported";
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!supported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return browserNotificationPermission();
  }
}

export function sendBrowserNotification({
  title,
  body,
  tag,
}: {
  title: string;
  body: string;
  tag: string;
}) {
  if (browserNotificationPermission() !== "granted") return;
  const notification = new Notification(title, {
    body,
    icon: "/lzc-icon.png",
    tag,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };
}
