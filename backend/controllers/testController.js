export const getTests = (req, res) => {
  res.json([
    { id: 1, course: "HTML Basics", questions: 10 },
    { id: 2, course: "CSS Basics", questions: 12 }
  ]);
};

export const submitTest = (req, res) => {
  const { courseId, answers } = req.body;
  res.json({
    message: "✅ Test submitted",
    courseId,
    score: Math.floor(Math.random() * 100)
  });
};
