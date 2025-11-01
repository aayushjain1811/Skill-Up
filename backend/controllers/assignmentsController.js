import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_ASSIGNMENTS_PATH = path.join(__dirname, "../uploads/assignments");

// Get all assignments for a course
export const getAssignments = (req, res) => {
  const { courseId } = req.params;
  const courseAssignmentsPath = path.join(BASE_ASSIGNMENTS_PATH, courseId);

  try {
    if (!fs.existsSync(courseAssignmentsPath)) {
      return res.json([]); // no assignments yet
    }

    const assignments = fs.readdirSync(courseAssignmentsPath).map(file => ({
      title: file,
      url: `/uploads/assignments/${courseId}/${file}`
    }));

    res.json(assignments);
  } catch (error) {
    console.error("Error reading assignments:", error);
    res.status(500).json({ error: "Failed to load assignments" });
  }
};
