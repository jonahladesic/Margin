import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { authMiddleware } from "./middlewares/authMiddleware";
import router from "./routes";

const app: Express = express();

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

// In production, serve the built frontend static files
if (process.env.NODE_ENV === "production") {
  const staticPath = path.resolve(process.cwd(), "artifacts/studio/dist/public");
  console.log("[server] Serving static files from:", staticPath);

  const mimeTypes: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip API routes
    if (req.path.startsWith("/api")) { next(); return; }

    const filePath = path.join(staticPath, req.path);
    if (req.path !== "/" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || "application/octet-stream";
      res.setHeader("Content-Type", contentType);
      fs.createReadStream(filePath).pipe(res);
    } else {
      // SPA fallback — serve index.html
      const indexPath = path.join(staticPath, "index.html");
      res.setHeader("Content-Type", "text/html");
      fs.createReadStream(indexPath).pipe(res);
    }
  });
}

export default app;
