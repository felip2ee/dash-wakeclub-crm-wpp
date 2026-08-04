// Wake Club · service worker.
// Sem cache: dado velho da fila é pior que uma tela vazia.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  const dados = evento.data ? evento.data.json() : {};
  evento.waitUntil(
    self.registration.showNotification(dados.titulo ?? "Wake Club", {
      body: dados.corpo ?? "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: { url: dados.url ?? "/followups" },
      tag: dados.tag,
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url ?? "/followups";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientes) => {
      const cliente = clientes.find((item) => "focus" in item);
      if (cliente) return cliente.focus().then(() => cliente.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});
