// Renders the home page on the server, so search engines get full HTML.


const articles = [
    {
      id: '1',
      title: 'Artificial Intelligence Transforms Modern Software Development',
      summary: 'A deep dive into how AI-driven tools are reshaping programming practices, code generation, and developer productivity in 2026.',
      category: 'Technology',
      author: 'John Doe',
      date: 'Sep 21, 2026',
      image: 'https://picsum.photos/600/400?1',
      views: 1250
    },
    {
      id: '2',
      title: 'Breakthrough in Renewable Energy Storage Efficiency',
      summary: 'Researchers reveal a novel solar storage methodology yielding up to 40% higher efficiency than existing commercial batteries.',
      category: 'Science',
      author: 'Sarah Connor',
      date: 'Sep 20, 2026',
      image: 'https://picsum.photos/600/400?2',
      views: 890
    },
    {
      id: '3',
      title: 'Global Tech Summit 2026 Key Highlights',
      summary: 'Key takeaways, product announcements, and future roadmaps presented by industry leaders at this year’s global summit.',
      category: 'Events',
      author: 'Alex Smith',
      date: 'Sep 19, 2026',
      image: 'https://picsum.photos/600/400?3',
      views: 2100
    }
  ];

function showHome(req, res) {
  res.render('index', {
    title: 'The Daily Web - דף הבית',
    articles: articles
  });
}

module.exports = { showHome };
