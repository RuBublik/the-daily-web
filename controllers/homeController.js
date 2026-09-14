// Renders the home page on the server, so search engines get full HTML.
function showHome(req, res) {
  res.render('index', { title: 'The Daily Web' });
}

module.exports = { showHome };
