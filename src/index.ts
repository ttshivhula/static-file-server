import fastify from "fastify";
import fastifyCors from "@fastify/cors";
// Importing the rate-limit plugin
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";

// Define an asynchronous function to set up and start the server
const startServer = async () => {
  // Create an instance of Fastify
  const app = fastify({
    bodyLimit: 1048576 * 200,
    trustProxy: true,
  });

  // Enable CORS with the same settings as in Hono code
  app.register(fastifyCors, {
    origin: "*",
  });

  // Register the rate-limit plugin
  await app.register(fastifyRateLimit, {
    max: 10,
    timeWindow: "1 minute",
  });

  // Define the root route
  app.get("/", async (request, reply) => {
    console.log(request.ip);
    reply.send({
      message: "There is nothing here",
    });
  });

  // Serve static files from the specified directory
  app.register(fastifyStatic, {
    root: "/home/hostinger/ftp/files",
    prefix: "/files/", // Serve files under "/files/*"
  });

  // Start the server on the specified port
  const port = 8787;
  await app.listen({ port });
  console.log(`Server listening on port ${port}`);
};

// Call the asynchronous function to start the server
startServer().catch((err) => {
  console.error("Error starting server:", err);
});
