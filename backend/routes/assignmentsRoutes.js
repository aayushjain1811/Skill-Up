import express from "express";
import { getAssignments } from "../controllers/assignmentsController.js";

const router = express.Router();

// GET /api/resources/assignments/:courseId
router.get("/:courseId", getAssignments);

export default router;
