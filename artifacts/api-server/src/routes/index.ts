import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gpsRouter from "./gps";
import projectsRouter from "./projects";
import teamLeadersRouter from "./teamLeaders";
import logEntriesRouter from "./logEntries";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gps", gpsRouter);
router.use("/projects", projectsRouter);
router.use("/team-leaders", teamLeadersRouter);
router.use("/log-entries", logEntriesRouter);

export default router;
