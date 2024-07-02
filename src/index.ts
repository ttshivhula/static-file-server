import axios from "axios";
import fastify from "fastify";
import fastifyCors from "@fastify/cors";
// Importing the rate-limit plugin
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fs from "fs";
import { getLinkPreview } from "link-preview-js";
import path from "path";
import sizeOf from "image-size";

const getImageDimensions = async (url: string) => {
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    return sizeOf(buffer);
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

const generatePreview = async (url: string) => {
  const response = await getLinkPreview(url, {
    followRedirects: "follow",
    headers: {
      "user-agent":
        "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    },
    timeout: 15000,
  });

  if (!response) return undefined;

  const { title, description, images } = response as any;

  let dimensions = undefined;

  if (images.length) {
    const response = await getImageDimensions(images[0]);

    if (response) {
      dimensions = {
        width: response.width,
        height: response.height,
      };
    }
  }

  return {
    title,
    description,
    image: images.length ? images[0] : undefined,
    imageDimension: dimensions,
  };
};

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

  app.post("/generate-preview", async (request, reply) => {
    try {
      const { url } = request.body as {
        url: string;
      };
      if (!url) {
        return reply.code(400).send({ error: "URL is required" });
      }
      const preview = await generatePreview(url);
      if (!preview) {
        return reply.code(404).send({ error: "Preview not found" });
      }
      reply.send(preview);
    } catch (err) {
      console.error(err);
      return reply.code(500).send({ error: "Internal server error" });
    }
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

    if (pass !== process.env.SERVER_PASSWORD) {
      return reply.code(401).send({ message: "Unauthorized" });
    }

    if (!filename || !data) {
      return reply
        .code(400)
        .send({ message: "Filename and data are required" });
    }

    const filePath = path.join(
      !isImage
        ? "/home/hostinger/ftp/files"
        : "/home/hostinger/ftp/files/images",
      filename
    );

    try {
      // Write the JSON data to the specified file
      if (isImage) {
        const bufferData = Buffer.from(data, "base64");
        fs.writeFileSync(filePath, bufferData);
      } else {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
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
