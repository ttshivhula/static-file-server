import { Hono } from "hono";
import { serve, type HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { cors } from "hono/cors";

type Bindings = HttpBindings & {};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: "*",
  })
);

app.get("/", (c) => {
  return c.json({
    remoteAddress: c.env.incoming.socket.remoteAddress,
    message: "There is nothing here",
  });
});

app.use("/files/*", serveStatic({ root: "../" }));

app.get(
  "/files/*",
  serveStatic({
    root: "../",
    rewriteRequestPath: (path) => path.replace(/^\/files/, "/files"),
  })
);

const port = 8787;

serve({
  fetch: app.fetch,
  port: port,
});
