import express from "express";
import { getNotes } from "../controllers/notesController.js";

const router = express.Router();

// GET /api/resources/notes/:courseId
router.get("/:courseId", getNotes);

export default router;
