import { Router } from "express";
import gameController from "./game.controller.js";
import authMiddleware from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", gameController.listMyGames);
router.get("/:gameId", gameController.getGameDetail);

export default router;
