import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { securityHeaders, apiKeyAuth } from "./lib/security";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(securityHeaders);

// CORS: restrict to known origins via CORS_ORIGINS (comma-separated).
// Falls back to allow-all with a warning so local dev keeps working.
const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (corsOrigins.length > 0) {
  app.use(cors({ origin: corsOrigins }));
} else {
  logger.warn("CORS_ORIGINS not set — allowing all origins. Set it in production.");
  app.use(cors());
}

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Optional shared-secret gate (active only when APP_API_KEY is set).
// Health stays open for uptime probes.
app.use("/api", (req, res, next) => {
  if (req.path === "/health") {
    next();
    return;
  }
  apiKeyAuth(req, res, next);
});

app.use("/api", router);

// Central error handler — Express 5 forwards rejected async handlers here.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled route error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
});

export default app;
