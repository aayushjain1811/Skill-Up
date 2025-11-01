import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// ✅ Import routes
import videoRoutes from "./routes/videoRoutes.js";
app.use("/api/videos", videoRoutes);

// ✅ Serve uploaded static files
app.use("/uploads/videos", express.static(path.join(__dirname, "uploads/videos")));
app.use("/uploads/notes", express.static(path.join(__dirname, "uploads/notes")));
app.use("/uploads/assignments", express.static(path.join(__dirname, "uploads/assignments")));

// ✅ Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// ✅ Debug route for videos
app.get("/api/test-video", (req, res) => {
  const testPath = path.join(__dirname, "uploads/videos/course1/1.mp4");
  const exists = fs.existsSync(testPath);
  res.json({
    type: "video",
    fileExists: exists,
    filePath: testPath,
    accessibleUrl: "http://localhost:5000/uploads/videos/course1/1.mp4",
    message: exists ? "File found!" : "File not found!"
  });
});

// ✅ Debug route for notes
app.get("/api/test-note", (req, res) => {
  const testPath = path.join(__dirname, "uploads/notes/course1/note1.pdf");
  const exists = fs.existsSync(testPath);
  res.json({
    type: "note",
    fileExists: exists,
    filePath: testPath,
    accessibleUrl: "http://localhost:5000/uploads/notes/course1/note1.pdf",
    message: exists ? "File found!" : "File not found!"
  });
});

// ✅ Debug route for assignments
app.get("/api/test-assignment", (req, res) => {
  const testPath = path.join(__dirname, "uploads/assignments/course1/assignment1.docx");
  const exists = fs.existsSync(testPath);
  res.json({
    type: "assignment",
    fileExists: exists,
    filePath: testPath,
    accessibleUrl: "http://localhost:5000/uploads/assignments/course1/assignment1.docx",
    message: exists ? "File found!" : "File not found!"
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
  console.log("📁 Static folders:");
  console.log(`   Videos:      http://localhost:${PORT}/uploads/videos/...`);
  console.log(`   Notes:       http://localhost:${PORT}/uploads/notes/...`);
  console.log(`   Assignments: http://localhost:${PORT}/uploads/assignments/...`);
});
