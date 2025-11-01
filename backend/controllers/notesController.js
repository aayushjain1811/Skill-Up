import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const NOTES_PATH = path.join(__dirname, "../uploads/notes");
const ASSIGNMENTS_PATH = path.join(__dirname, "../uploads/assignments");

// Get notes for a course
router.get("/notes/:courseId", (req, res) => {
  const { courseId } = req.params;
  const folderPath = path.join(NOTES_PATH, courseId);

  if (!fs.existsSync(folderPath)) {
    return res.json([]);
  }

  const notes = fs.readdirSync(folderPath).map(file => ({
    title: file,
    url: `/uploads/notes/${courseId}/${file}`
  }));

  res.json(notes);
});

// Get assignments for a course
router.get("/assignments/:courseId", (req, res) => {
  const { courseId } = req.params;
  const folderPath = path.join(ASSIGNMENTS_PATH, courseId);

  if (!fs.existsSync(folderPath)) {
    return res.json([]);
  }

  const assignments = fs.readdirSync(folderPath).map(file => ({
    title: file,
    url: `/uploads/assignments/${courseId}/${file}`
  }));

  res.json(assignments);
});

export default router;
