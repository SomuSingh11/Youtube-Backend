import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// Middleware to enable CORS with options
app.use(
  cors({
    origin: process.env.CORS_ORIGIN, // Allow requests from this origin
    credentials: true, // Allow sending cookies with CORS requests
  })
);
app.use(express.json({ limit: "24kb" })); // Parse JSON requests (limiting payload size to 24kb)
app.use(express.urlencoded({ extended: true, limit: "24kb" })); // Parse URL-encoded requests (limiting payload size to 24kb)
app.use(express.static("public")); // Serve static files from the 'public' directory
app.use(cookieParser()); // Parse cookies attached to the request

export { app };
