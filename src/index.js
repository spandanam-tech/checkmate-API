import { createServer } from "http";
import app from "./app.js";
import { initSocket } from "./socket/index.js";
import logger from "./utils/logger.js";

const PORT = process.env.PORT || 3000;

const server = createServer(app);

// Attach Socket.IO to the HTTP server
initSocket(server);

server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on port ${PORT}`);
});
