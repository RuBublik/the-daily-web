// Editor area: review, approve and publish articles. Every route here is behind requireRole('editor').

// GET /editor
function showDashboard(req, res) {
  res.render('editor/index', { title: 'Editor area - The Daily Web' });
}

module.exports = { showDashboard };
