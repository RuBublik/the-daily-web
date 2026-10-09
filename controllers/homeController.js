// Renders the home page on the server, so search engines get full HTML.


const articles = [
    {
      id: '1',
      title: 'Artificial Intelligence Transforms Modern Software Development',
      summary: 'A deep dive into how AI-driven tools are reshaping programming practices, code generation, and developer productivity in 2026.',
      category: 'Technology',
      author: 'John Doe',
      publishedAt: new Date('2026-09-21T10:00:00Z'),
      image: 'https://picsum.photos/600/400?1',
      views: 1250
    },
    {
      id: '2',
      title: 'Breakthrough in Renewable Energy Storage Efficiency',
      summary: 'Researchers reveal a novel solar storage methodology yielding up to 40% higher efficiency than existing commercial batteries.',
      category: 'Science',
      author: 'Sarah Connor',
      publishedAt: new Date('2026-09-20T14:30:00Z'),
      image: 'https://picsum.photos/600/400?2',
      views: 890
    },
    {
      id: '3',
      title: 'Global Tech Summit 2026 Key Highlights',
      summary: 'Key takeaways, product announcements, and future roadmaps presented by industry leaders at this year’s global summit.',
      category: 'Events',
      author: 'Alex Smith',
      publishedAt: new Date('2026-09-19T09:15:00Z'),
      image: 'https://picsum.photos/600/400?3',
      views: 2100
    }
  ];

function showHome(req, res) {
  res.render('index', {
    title: 'The Daily Web',
    articles: articles,
    user: req.user
  });
}

module.exports = { showHome };
