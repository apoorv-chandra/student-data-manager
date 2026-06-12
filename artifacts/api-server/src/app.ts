import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";
import { connectDB } from "./lib/mongoose";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Connect to MongoDB before handling requests
connectDB().catch((err) => {
  logger.error({ err }, "Failed to connect to MongoDB");
  process.exit(1);
});

app.use("/api", router);

// Serve admin panel static files (built to artifacts/admin/dist/public)
const adminDist = path.resolve(__dirname, "../../admin/dist/public");
app.use(express.static(adminDist));

// SPA fallback — serve index.html for all non-API routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(adminDist, "index.html"));
});

export default app;
