app.use(express.json());
let reports = [];

app.get('/api/reports', (req, res) => res.json(reports));
app.post('/api/reports', (req, res) => {
  const report = req.body;
  reports.push(report);
  res.status(201).json({ message: 'Report saved', report });
});
