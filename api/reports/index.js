const { connectToDatabase } = require("../../lib/mongodb");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection("reports");

    if (req.method === "GET") {
      const reports = await collection.find({}).sort({ createdAt: -1 }).toArray();
      res.status(200).json(reports);
      return;
    }

    if (req.method === "POST") {
      const report = req.body;
      if (!report || typeof report !== "object") {
        res.status(400).json({ error: "Request body must be a report object." });
        return;
      }
      const toInsert = { ...report, createdAt: new Date() };
      const result = await collection.insertOne(toInsert);
      res.status(201).json({ ...toInsert, _id: result.insertedId });
      return;
    }

    res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (error) {
    console.error("Ariyam API error (/api/reports):", error);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
};
