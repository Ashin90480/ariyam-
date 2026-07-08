const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ariyam';

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

const reportSchema = new mongoose.Schema({
  eventName: String,
  district: String,
  organisation: String,
  hotelStay: String,
  hotelRating: String,
  hotelReview: String,
  foodSpots: String,
  touristPlaces: String,
  extraFeatures: String,
  hotelImages: Array,
  touristImages: Array,
  hotelDetails: Object,
  location: Object,
  touristLocation: Object
}, { timestamps: true });

const Report = mongoose.model('Report', reportSchema);

app.get('/api/reports', async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const report = new Report(req.body);
    await report.save();
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ error: 'Failed to save report' });
  }
});

app.delete('/api/reports/:id', async (req, res) => {
  try {
    const deleted = await Report.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.warn('MongoDB connection failed, continuing without database:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
