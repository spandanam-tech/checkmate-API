import { Router } from "express";
import { authRoutes } from "./auth/index.js";
import { userRoutes } from "./user/index.js";
import { gameRoutes } from "./game/index.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/games", gameRoutes);

export default router;
