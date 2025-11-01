import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get all videos for a course
export const getVideos = (req, res) => {
  const { courseId } = req.params;
  const courseVideosPath = path.join(__dirname, "../uploads/videos", courseId);
  
  try {
    if (!fs.existsSync(courseVideosPath)) {
      return res.status(404).json({ error: "Course videos not found" });
    }
    
    const videos = fs.readdirSync(courseVideosPath)
      .filter(file => file.endsWith('.mp4'))
      .map(file => ({
        filename: file,
        title: file.replace('.mp4', '').replace(/_/g, ' '),
        url: `/videos/${courseId}/${file}`
      }));
    
    res.json(videos);
  } catch (error) {
    console.error("Error reading videos:", error);
    res.status(500).json({ error: "Failed to load videos" });
  }
};

// Stream a specific video
export const streamVideo = (req, res) => {
  const { courseId, filename } = req.params;
  const filePath = path.join(__dirname, "../uploads/videos", courseId, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Video not found");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });

    const head = {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4",
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
    };
    res.writeHead(200, head);
    fs.createReadStream(filePath).pipe(res);
  }
};

export const uploadVideo = (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  res.json({
    message: "✅ Video uploaded successfully",
    filename: req.file.filename,
    path: `/uploads/videos/${req.file.filename}`
  });
};