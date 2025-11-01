export const getCertificates = (req, res) => {
  res.json([
    { id: 1, course: "HTML Basics", file: "/uploads/certificates/html.pdf" },
    { id: 2, course: "CSS Basics", file: "/uploads/certificates/css.pdf" }
  ]);
};

export const issueCertificate = (req, res) => {
  const { userId, course } = req.body;
  res.json({
    message: "🏆 Certificate issued successfully",
    userId,
    course,
    file: `/uploads/certificates/${course}.pdf`
  });
};
