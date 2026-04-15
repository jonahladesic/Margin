import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import clientsRouter from "./clients";
import projectsRouter from "./projects";
import phasesRouter from "./phases";
import allocationsRouter from "./allocations";
import timeblocksRouter from "./timeblocks";
import invoicesRouter from "./invoices";
import expensesRouter from "./expenses";
import breakBlocksRouter from "./break-blocks";
import meetingsRouter from "./meetings";
import bqeCoreRouter from "./bqe-core";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(clientsRouter);
router.use(projectsRouter);
router.use(phasesRouter);
router.use(allocationsRouter);
router.use(timeblocksRouter);
router.use(invoicesRouter);
router.use(expensesRouter);
router.use(breakBlocksRouter);
router.use(meetingsRouter);
router.use(bqeCoreRouter);

export default router;
