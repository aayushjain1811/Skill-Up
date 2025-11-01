import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

const BASE_VIDEO_PATH = "/home/aayushjain1811/SkillUp/backend/uploads/videos";

// ✅ Get all videos for a course
router.get("/course/:courseId", (req, res) => {
  const { courseId } = req.params;
  const courseVideosPath = path.join(BASE_VIDEO_PATH, courseId);

  try {
    if (!fs.existsSync(courseVideosPath)) {
      return res.status(404).json({ error: "Course videos not found" });
    }

    const videos = fs.readdirSync(courseVideosPath)
      .filter(file => file.endsWith(".mp4"))
      .map(file => ({
        filename: file,
        title: file.replace(".mp4", "").replace(/_/g, " "),
        // 👇 use static serving URL directly
        url: `/uploads/videos/${courseId}/${file}`,
      }));

    res.json(videos);
  } catch (error) {
    console.error("Error reading videos:", error);
    res.status(500).json({ error: "Failed to load videos" });
  }
});

export default router;
