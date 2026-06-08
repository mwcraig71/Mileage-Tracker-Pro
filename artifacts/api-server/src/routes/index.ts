import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gpsRouter from "./gps";
import projectsRouter from "./projects";
import teamLeadersRouter from "./teamLeaders";
import logEntriesRouter from "./logEntries";
import periodsRouter from "./periods";
import annotationsRouter from "./annotations";
import configRouter from "./config";
import driverSessionsRouter from "./driverSessions";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/gps", gpsRouter);
router.use("/projects", projectsRouter);
router.use("/team-leaders", teamLeadersRouter);
router.use("/log-entries", logEntriesRouter);
router.use("/periods", periodsRouter);
router.use("/annotations", annotationsRouter);
router.use("/config", configRouter);
router.use("/driver-sessions", driverSessionsRouter);

export default router;
