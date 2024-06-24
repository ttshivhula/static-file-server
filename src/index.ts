import fastify from "fastify";
import fastifyCors from "@fastify/cors";
// Importing the rate-limit plugin
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fs from "fs";
import path from "path";

// Define an asynchronous function to set up and start the server
const startServer = async () => {
  // Create an instance of Fastify
  const app = fastify({
    bodyLimit: 1048576 * 200,
    trustProxy: true,
    logger: false,
  });

  // Enable CORS with the same settings as in Hono code
  app.register(fastifyCors, {
    origin: "*",
  });

  // Register the rate-limit plugin
  await app.register(fastifyRateLimit, {
    max: 5000,
    timeWindow: "1 minute",
  });

  app.post("/upload", async (request, reply) => {
    const {
      filename,
      data,
      pass,
      isImage = false,
    } = request.body as {
      filename: string;
      data: any;
      pass: string;
      isImage: boolean;
    };

    if (pass !== process.env.PASSWORD) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    if (!filename || !data) {
      return reply
        .code(400)
        .send({ message: "Filename and data are required" });
    }

    // if (!filename.endsWith(".json")) {
    //   return reply
    //     .code(400)
    //     .send({ message: "Filename must have a .json extension" });
    // }

    const filePath = path.join(
      !isImage
        ? "/home/hostinger/ftp/files"
        : "/home/hostinger/ftp/files/images",
      filename
    );

    try {
      // Write the JSON data to the specified file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      reply.send({
        message: "File uploaded successfully",
        url: `https://data.banterbubbles.com/files${
          isImage ? "/images/" : "/"
        }${filename}`,
      });
    } catch (error) {
      console.error("Error writing file:", error);
      reply.code(500).send({ message: "Internal Server Error" });
    }
  });

  // Define the root route
  app.get("/", async (request, reply) => {
    // request.log.info(request.ip);
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
