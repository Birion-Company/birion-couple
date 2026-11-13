/* BIRION COUPLE: recebe as notificações push (mesmo com o app fechado) e abre a tela certa ao tocar. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Birion Couple", {
      body: data.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/painel", approveTx: data.approveTx || null },
      actions: data.approveTx ? [{ action: "accept", title: "Aceitar" }, { action: "view", title: "Ver" }] : [],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const approveTx = event.notification.data && event.notification.data.approveTx;
  if (event.action === "accept" && approveTx) {
    // Aceitar direto da notificação, sem abrir o app. Se não deu (sessão vencida, por exemplo), abre o lançamento.
    event.waitUntil(
      fetch("/api/aceitar", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionId: approveTx }) })
        .then((r) => r.json().catch(() => ({ ok: false })))
        .then((res) =>
          res && res.ok
            ? self.registration.showNotification("Aceito", { body: res.message || "Já vale nas dívidas.", icon: "/brand/icon-192.png", tag: "aceito-" + approveTx })
            : self.clients.openWindow(new URL((event.notification.data && event.notification.data.url) || "/painel", self.location.origin).href),
        )
        .catch(() => self.clients.openWindow(new URL("/painel", self.location.origin).href)),
    );
    return;
  }
  const url = new URL((event.notification.data && event.notification.data.url) || "/painel", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
