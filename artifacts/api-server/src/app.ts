import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { apiKeyAuth } from "./middlewares/auth";

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

// ── CORS ─────────────────────────────────────────────────────────────────────
// If ALLOWED_ORIGINS is set (comma-separated), restrict to those origins.
// Otherwise keep CORS fully open but warn once so the operator knows.
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
if (allowedOriginsEnv) {
  const allowedOrigins = allowedOriginsEnv
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser requests (no Origin header) and whitelisted origins.
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
    }),
  );
} else {
  logger.warn(
    "ALLOWED_ORIGINS not set — CORS is OPEN to all origins. Set ALLOWED_ORIGINS (comma-separated) to restrict.",
  );
  app.use(cors());
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API-key auth (no-op + startup warning when API_KEY is unset).
app.use(apiKeyAuth);

app.use("/api", router);

// ── Final error handler ───────────────────────────────────────────────────────
// Must be registered last and have 4 args so Express treats it as an error
// handler. Logs via pino and returns a generic 500 (or err.status if set).
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; statusCode?: number; message?: string };
  const status = e?.status ?? e?.statusCode ?? 500;
  logger.error({ err, url: req.url, method: req.method }, "Unhandled request error");
  if (res.headersSent) {
    return;
  }
  res
    .status(status)
    .json({ error: status === 500 ? "Internal server error" : (e?.message ?? "Error") });
});

export default app;
