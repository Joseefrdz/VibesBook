// models/User.js

const { MongoClient } = require("mongodb");
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Función para obtener la colección de usuarios
async function getUsersCollection() {
  try {
    await client.connect(); // Me aseguro de que el cliente esté conectado
    const db = client.db("vibesbook_db"); // indicamos el nombre de la base de datos
    return db.collection("users");
  } catch (error) {
    console.error("Error al obtener la colección de usuarios:", error);
    throw error;
  }
}

module.exports = { getUsersCollection, client }; // Exportamos el cliente también para poder cerrarlo globalmente
