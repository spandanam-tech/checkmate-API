import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import errorMiddleware from "./middlewares/error.middleware.js";
import routes from "./modules/index.js";
import logger from "./utils/logger.js";
import connectDB from "./config/database.js";

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "*" }));
app.use(express.json());

// Serve uploaded profile images
app.use("/uploads", express.static("src/uploads"));

// Routes
app.use("/api/v1", routes);

// Health check
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Checkmate API is running" });
});

// Global error handler
app.use(errorMiddleware);

// Connect to MongoDB
connectDB();

export default app;
