import { indexToken, indexUrl, password } from "./constants";

import { Index } from "@upstash/vector"; // replace with actual import
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import axios from "axios";
import fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import fs from "fs";
import { getLinkPreview } from "link-preview-js";
import path from "path";
import sizeOf from "image-size";

const semanticSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 25,
  separators: [" "],
  chunkOverlap: 8,
});

const WHITELIST = ["black", "swear"];
const PROFANITY_THRESHOLD = 0.86;

function splitTextIntoWords(text: string): string[] {
  return text.split(/\s/);
}

async function splitTextIntoSemantics(text: string): Promise<string[]> {
  if (text.split(/\s/).length === 1) return []; // no semantics for single words
  const documents = await semanticSplitter.createDocuments([text]);
  const chunks = documents.map((chunk) => chunk.pageContent);
  return chunks;
}

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

const startServer = async () => {
  const app = fastify({
    bodyLimit: 1048576 * 200, // 200 MB
    trustProxy: true,
    logger: false,
  });

  app.register(fastifyCors, {
    origin: "*",
  });

  await app.register(fastifyRateLimit, {
    max: 5000,
    timeWindow: "1 minute",
  });

  app.post("/profanity", async (request, reply) => {
    try {
      const index = new Index({
        url: indexUrl,
        token: indexToken,
      });

      const body = request.body;
      let { message, pass } = body as { message: string; pass: string };

      if (pass !== password) {
        return reply.code(401).send({ message: "Unauthorized" });
      }

      if (!message) {
        return reply.code(400).send({ error: "Message is required" });
      }

      if (message.split(/\s/).length > 35 || message.length > 1000) {
        return reply.code(413).send({
          error:
            "Due to temporary Cloudflare limits, a message can only be up to 35 words or 1000 characters.",
        });
      }

      message = message
        .split(/\s/)
        .filter((word) => !WHITELIST.includes(word.toLowerCase()))
        .join(" ");

      const [semanticChunks, wordChunks] = await Promise.all([
        splitTextIntoSemantics(message),
        splitTextIntoWords(message),
      ]);

      const flaggedFor = new Set<{ score: number; text: string }>();

      const vectorRes = await Promise.all([
        ...wordChunks.map(async (wordChunk) => {
          const [vector] = await index.query({
            topK: 1,
            data: wordChunk,
            includeMetadata: true,
          });

          if (vector && vector.score > 0.95) {
            flaggedFor.add({
              text: vector.metadata!.text as string,
              score: vector.score,
            });
          }

          return { score: 0 };
        }),
        ...semanticChunks.map(async (semanticChunk) => {
          const [vector] = await index.query({
            topK: 1,
            data: semanticChunk,
            includeMetadata: true,
          });

          if (vector && vector.score > PROFANITY_THRESHOLD) {
            flaggedFor.add({
              text: vector.metadata!.text as string,
              score: vector.score,
            });
          }

          return vector!;
        }),
      ]);

      if (flaggedFor.size > 0) {
        const sorted = Array.from(flaggedFor).sort((a, b) =>
          a.score > b.score ? -1 : 1
        )[0];
        return reply.send({
          isProfanity: true,
          score: sorted?.score,
          flaggedFor: sorted?.text,
        });
      } else {
        const mostProfaneChunk = vectorRes.sort((a, b) =>
          a.score > b.score ? -1 : 1
        )[0]!;

        return reply.send({
          isProfanity: false,
          score: mostProfaneChunk.score,
        });
      }
    } catch (err) {
      console.error(err);

      return reply
        .code(500)
        .send({ error: "Something went wrong.", err: JSON.stringify(err) });
    }
  });

  app.post("/generate-preview", async (request, reply) => {
    try {
      const { url } = request.body as { url: string };
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

    if (pass !== password) {
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

  app.get("/", async (request, reply) => {
    console.log(request.ip);
    reply.send({
      message: "There is nothing here",
    });
  });

  app.register(fastifyStatic, {
    root: "/home/hostinger/ftp/files",
    prefix: "/files/",
  });

  const port = 8787;
  await app.listen({ port });
  console.log(`Server listening on port ${port}`);
};

startServer().catch((err) => {
  console.error("Error starting server:", err);
});
