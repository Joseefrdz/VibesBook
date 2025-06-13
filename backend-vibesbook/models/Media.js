// models/Media.js
const { MongoClient } = require("mongodb");
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function getMediaCollection() {
  try {
    await client.connect();
    const db = client.db("vibesbook_db"); // Usa el mismo nombre de DB que en User.js
    return db.collection("media");
  } catch (error) {
    console.error("Error al obtener la colección de medios:", error);
    throw error;
  }
}

module.exports = { getMediaCollection };
