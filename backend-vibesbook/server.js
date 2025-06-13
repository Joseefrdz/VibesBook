// server.js

require("dotenv").config();

const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Importar el módulo User y Media
const { getUsersCollection, client } = require("./models/User");
const { getMediaCollection } = require("./models/Media");

// Importar bcryptjs para hashear contraseñas
const bcrypt = require("bcryptjs");

// Importar jsonwebtoken para tokens JWT
const jwt = require("jsonwebtoken");

// Obtener la clave secreta para JWT de las variables de entorno
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "9g2635+4vd_+$CV32uhslajsdfg_-bfas_duf786+asyg_qaw3425%^456u4j&*ase-346h75^&!asd2345";

// Importar Multer y Cloudinary
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

// Importar el middleware de autenticación
const authenticateToken = require("./middleware/auth");

// --- Configuración de Cloudinary ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true, // Usa HTTPS para las URLs de Cloudinary
});

// --- Configuración de Multer (ahora para usar memoria, no disco) ---
// Multer ahora solo procesará el archivo en memoria antes de pasarlo a Cloudinary
const storage = multer.memoryStorage(); // Almacenar el archivo temporalmente en memoria
const upload = multer({ storage: storage });

// --- Conexión a MongoDB ---
async function connectToMongo() {
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("¡Conexión exitosa a MongoDB Atlas!");
  } catch (error) {
    console.error("Error al conectar a MongoDB Atlas:", error);
    process.exit(1); // Salir si la conexión a la DB falla
  }
}
connectToMongo(); // Llamamos a la función de conexión al iniciar el servidor

// --- Middlewares ---

app.use(express.json()); // Para parsear JSON en las peticiones

// --- Rutas de Autenticación ---

//Registro
app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "Todos los campos son obligatorios." });
  }

  try {
    const usersCollection = await getUsersCollection();

    // 1. Verificar si el usuario o email ya existen
    const existingUser = await usersCollection.findOne({
      $or: [{ username }, { email }],
    });
    if (existingUser) {
      return res.status(409).json({
        message: "El nombre de usuario o email ya están registrados.",
      });
    }

    // 2. Hashear la contraseña
    const salt = await bcrypt.genSalt(10); // Genera un 'salt' para mayor seguridad
    const hashedPassword = await bcrypt.hash(password, salt);

    // 3. Crear el nuevo usuario
    const newUser = {
      username,
      email,
      password: hashedPassword, // Guardar la contraseña hasheada
      createdAt: new Date(),
    };

    // 4. Guardar el usuario en la base de datos
    const result = await usersCollection.insertOne(newUser);

    res.status(201).json({
      message: "Usuario registrado exitosamente",
      userId: result.insertedId,
    });
  } catch (error) {
    console.error("Error en el registro de usuario:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor durante el registro." });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Email y contraseña son obligatorios." });
  }

  try {
    const usersCollection = await getUsersCollection();

    // 1. Buscar el usuario por email
    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ message: "Usuario o contraseña incorrectos." });
    }

    // 2. Comparar la contraseña ingresada con la hasheada
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ message: "Usuario o contraseña incorrectos." });
    }

    // 3. Generar el JWT
    // Incluimos la info del usuario que queremos en el token
    const payload = {
      userId: user._id, // MongoDB ObjectId
      username: user.username,
      email: user.email,
    };

    // El token durará en 1 hora
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "2h" });

    res.status(200).json({ message: "Inicio de sesión exitoso", token });
  } catch (error) {
    console.error("Error en el inicio de sesión:", error);

    res.status(500).json({
      message: "Error interno del servidor durante el inicio de sesión.",
    });
  }
});

// --- Rutas para Fotos y Audios ---

// Ruta para subir una foto y un audio asociado
app.post(
  "/api/media/upload",
  authenticateToken,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const imageFile = req.files["image"] ? req.files["image"][0] : null;
      const audioFile = req.files["audio"] ? req.files["audio"][0] : null;
      const { description } = req.body;

      if (!imageFile || !audioFile) {
        return res
          .status(400)
          .json({ message: "Se requieren tanto una imagen como un audio." });
      }

      // Subir imagen a Cloudinary
      const imageUploadResult = await cloudinary.uploader.upload(
        `data:${imageFile.mimetype};base64,${imageFile.buffer.toString(
          "base64"
        )}`,
        { resource_type: "image", folder: "vibesbook/images" } // Guardar en una subcarpeta
      );

      // Subir audio a Cloudinary
      const audioUploadResult = await cloudinary.uploader.upload(
        `data:${audioFile.mimetype};base64,${audioFile.buffer.toString(
          "base64"
        )}`,
        { resource_type: "video", folder: "vibesbook/audios" } // Cloudinary trata los audios como 'video'
      );

      const mediaCollection = await getMediaCollection();

      const newMedia = {
        userId: req.user.userId,
        imageUrl: imageUploadResult.secure_url, // URL segura de Cloudinary
        audioUrl: audioUploadResult.secure_url, // URL segura de Cloudinary
        public_id_image: imageUploadResult.public_id, // ID público de Cloudinary para la imagen (útil para eliminar)
        public_id_audio: audioUploadResult.public_id, // ID público de Cloudinary para el audio (útil para eliminar)
        description: description || "",
        createdAt: new Date(),
      };

      const result = await mediaCollection.insertOne(newMedia);

      res.status(201).json({
        message: "Imagen y audio subidos exitosamente a Cloudinary",
        mediaId: result.insertedId,
        imageUrl: newMedia.imageUrl,
        audioUrl: newMedia.audioUrl,
      });
    } catch (error) {
      console.error("Error al subir medios a Cloudinary:", error);
      res
        .status(500)
        .json({ message: "Error interno del servidor al subir los medios." });
    }
  }
);

// Ruta para obtener todos los medios (fotos y audios) de un usuario
app.get("/api/media/my-media", authenticateToken, async (req, res) => {
  try {
    const mediaCollection = await getMediaCollection();
    const userId = req.user.userId;

    const userMedia = await mediaCollection.find({ userId: userId }).toArray();

    res.status(200).json(userMedia);
  } catch (error) {
    console.error("Error al obtener los medios del usuario:", error);
    res
      .status(500)
      .json({ message: "Error interno del servidor al obtener los medios." });
  }
});

// --- Ruta de ejemplo existente ---
app.get("/", (req, res) => {
  res.send(
    "¡Servidor backend de álbumes de fotos y audios funcionando y conectado a MongoDB!"
  );
});

// --- Iniciar el servidor ---
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
});

// --- Manejo de cierre de la aplicación ---
process.on("SIGINT", async () => {
  if (client) {
    await client.close();
    console.log("Conexión a MongoDB cerrada.");
  }
  process.exit(0);
});
