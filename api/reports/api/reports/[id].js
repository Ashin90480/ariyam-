const { ObjectId } = require("mongodb");
const { connectToDatabase } = require("../../lib/mongodb");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const { id } = req.query;
  if (!id || !ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid report id." });
    return;
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection("reports");

    if (req.method === "DELETE") {
      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: "Report not found." });
        return;
      }
      res.status(200).json({ success: true });
      return;
    }

    res.status(405).json({ error: `Method ${req.method} not allowed.` });
  } catch (error) {
    console.error("Ariyam API error (/api/reports/:id):", error);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
};
