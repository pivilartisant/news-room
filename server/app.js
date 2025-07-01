const express = require('express');
const cors = require('cors');
const path = require('path');
const slackBot = require('./slackBot');

const app = express();
const PORT = process.env.PORT || 3046;

app.use(cors());
app.use(express.json());

const static_dir = path.join(__dirname, '.');
console.log('Static files directory:', static_dir);

app.use(express.static(static_dir));

app.get('/api/events-api', async (req, res) => {
  try {
    const response = await fetch('https://events.hackclub.com/api/events/upcoming/');
        
    if (!response.ok) {
      console.error(`Events API returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `Events API error: ${response.status}` });
    }
    
    const responseText = await response.text();
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw response:', responseText);
      return res.status(500).json({ error: 'Invalid JSON response from events API' });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

app.get('/api/hackathons-api', async (req, res) => {
  try {
    const response = await fetch('https://hackathons.hackclub.com/api/events/upcoming');
        
    if (!response.ok) {
      console.error(`Hackathons API returned ${response.status}: ${response.statusText}`);
      return res.status(500).json({ error: `Hackathons API error: ${response.status}` });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching hackathons:', error);
    res.status(500).json({ error: 'Failed to fetch hackathons' });
  }
});

// API endpoint to get public Slack data only
app.get('/api/slack-data', (req, res) => {
  const extractedData = slackBot.getExtractedData();
  res.json(extractedData);
});

// API endpoint to get ALL Slack data (admin only)
app.get('/api/slack-data-admin', (req, res) => {
  const adminToken = req.headers.authorization || req.query.admin_token;
  
  if (!process.env.ADMIN_TOKEN) {
    return res.status(503).json({ error: 'Admin functionality not configured' });
  }
  
  if (adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'Invalid admin credentials' });
  }
  
  const allData = slackBot.getAllData();
  res.json(allData);
});

// API endpoint to get bot channels
app.get('/api/slack-channels', async (req, res) => {
  const channels = await slackBot.getBotChannels();
  res.json(channels);
});

app.get('/', (req, res) => {
  res.sendFile(static_dir);
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Start Slack bot
  await slackBot.startSlackBot();
});
