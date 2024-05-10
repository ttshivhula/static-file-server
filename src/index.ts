import { Hono } from "hono";
import { serve, type HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";

type Bindings = HttpBindings & {};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.json({
    remoteAddress: c.env.incoming.socket.remoteAddress,
  });
});

app.use("/files/*", serveStatic({ root: "./" }));

app.get(
  "/files/*",
  serveStatic({
    root: "./",
    rewriteRequestPath: (path) => path.replace(/^\/files/, "/files"),
  })
);

const port = 8787;

serve({
  fetch: app.fetch,
  port: port,
});
