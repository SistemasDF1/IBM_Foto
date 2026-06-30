import express from 'express';
import multer from 'multer';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import QRCode from 'qrcode';
import os from 'os';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de multer para manejar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo JPG, PNG y WEBP'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Inicializar Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Obtener la IP local de la máquina para que el QR funcione desde celulares en la misma red
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Función para limpiar archivos antiguos (mantener solo 30)
async function cleanOldFiles() {
  try {
    const downloadDir = path.join(__dirname, 'downloads');
    if (!fs.existsSync(downloadDir)) return;
    
    const files = fs.readdirSync(downloadDir)
      .filter(file => file.startsWith('figura_') && file.endsWith('.png'))
      .map(file => ({
        name: file,
        path: path.join(downloadDir, file),
        time: fs.statSync(path.join(downloadDir, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);
    
    if (files.length > 30) {
      const filesToDelete = files.slice(30);
      filesToDelete.forEach(file => {
        fs.unlinkSync(file.path);
        console.log('Archivo eliminado:', file.name);
      });
    }
  } catch (error) {
    console.error('Error limpiando archivos:', error);
  }
}

// Función para procesar imagen: centrar, recortar y agregar marca de agua
async function processImage(base64Image) {
  try {
    const imageBuffer = Buffer.from(base64Image, 'base64');

    // Dimensiones finales: 2400x3600 (imagen 3300 + franja blanca 300)
    const finalWidth = 2400;
    const finalHeight = 3600;
    const bandHeight = 300;

    // Logo IBM blanco (cobrand), redimensionado para caber en la franja
    const logoPath = path.join(__dirname, 'public', 'CobrandIBM.png');
    const logoBuffer = await sharp(logoPath)
      .resize({ height: 180, width: 1600, fit: 'inside' })
      .png()
      .toBuffer();
    const logoMeta = await sharp(logoBuffer).metadata();

    // Imagen principal + franja blanca inferior
    const baseImage = await sharp(imageBuffer)
      .resize(finalWidth, finalHeight - bandHeight, {
        fit: 'cover',
        position: 'center'
      })
      .extend({
        bottom: bandHeight,
        background: { r: 0, g: 17, b: 65, alpha: 1 }
      })
      .png()
      .toBuffer();

    // Logo en la esquina izquierda de la franja
    const processedImage = await sharp(baseImage)
      .composite([{
        input: logoBuffer,
        top: Math.round((finalHeight - bandHeight) + (bandHeight - logoMeta.height) / 2),
        left: 80
      }])
      .png()
      .toBuffer();

    return processedImage.toString('base64');
  } catch (error) {
    console.error('Error procesando imagen:', error);
    throw error;
  }
}

// Guardar datos del participante (leads del evento) en CSV
function saveLead({ nombre, empresa, puesto, telefono, ciudad }) {
  try {
    if (!nombre) return;
    const leadsPath = path.join(__dirname, 'leads.csv');
    if (!fs.existsSync(leadsPath)) {
      fs.writeFileSync(leadsPath, '﻿fecha,nombre,empresa,puesto,telefono,ciudad\n');
    }
    const clean = v => `"${String(v || '').replace(/"/g, '""')}"`;
    const fecha = new Date().toISOString();
    const row = [fecha, nombre, empresa, puesto, telefono, ciudad].map(clean).join(',') + '\n';
    fs.appendFileSync(leadsPath, row);
    console.log('Lead guardado:', nombre, '-', empresa);
  } catch (error) {
    console.error('Error guardando lead:', error);
  }
}

// Descargar leads (protegido con LEADS_KEY del .env)
app.get('/api/leads', (req, res) => {
  const key = process.env.LEADS_KEY;
  if (!key || req.query.key !== key) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  const leadsPath = path.join(__dirname, 'leads.csv');
  if (!fs.existsSync(leadsPath)) {
    return res.status(404).json({ error: 'Aún no hay registros' });
  }
  res.download(leadsPath, 'leads_ibm.csv');
});

// Ruta principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint para generar imagen
app.post('/api/generate', upload.single('image'), async (req, res) => {
  try {
    const { prompt, nombre, empresa, puesto, telefono, ciudad } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'El prompt es requerido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'La imagen es requerida' });
    }

    // Registrar datos del participante (actividad Identidad Digital)
    saveLead({ nombre, empresa, puesto, telefono, ciudad });

    // Leer la imagen del usuario
    const imagePath = req.file.path;
    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString('base64');

    // Configurar el modelo
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash-image"
    });

    // Cargar los 4 robots IBM como imágenes de referencia
    const robotFiles = ['AIBM.png', 'BIBM.png', 'CIBM.png', 'DIBM.png'];
    const robotParts = robotFiles.map(file => ({
      inlineData: {
        mimeType: 'image/png',
        data: fs.readFileSync(path.join(__dirname, 'public', file)).toString('base64')
      }
    }));

    // Preparar el contenido para la API: prompt + foto del usuario + 4 robots de referencia
    const parts = [
      { text: prompt },
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: base64Image
        }
      },
      ...robotParts
    ];

    console.log('Generando foto con los robots IBM con Gemini 2.5...');
    
    // Generar la imagen
    const result = await model.generateContent(parts);
    const response = await result.response;

    // Buscar la imagen generada en la respuesta
    let generatedImageBase64 = null;
    
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        generatedImageBase64 = part.inlineData.data;
        break;
      }
    }

    // Limpiar el archivo temporal
    fs.unlinkSync(imagePath);

    if (generatedImageBase64) {
      // Procesar imagen: centrar, recortar y agregar marca de agua
      const processedImageBase64 = await processImage(generatedImageBase64);
      
      // Guardar imagen en carpeta downloads
      const filename = `figura_${Date.now()}.png`;
      const downloadPath = path.join(__dirname, 'downloads', filename);
      const downloadDir = path.join(__dirname, 'downloads');
      
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir);
      }
      
      fs.writeFileSync(downloadPath, Buffer.from(processedImageBase64, 'base64'));
      
      // Limpiar archivos antiguos
      await cleanOldFiles();
      
      // Generar URL de descarga con la IP local para que el QR funcione desde otros dispositivos
      const host = req.get('host') || '';
      const baseHost = host.includes('localhost') || host.includes('127.0.0.1')
        ? `${getLocalIP()}:${PORT}`
        : host;
      const downloadUrl = `${req.protocol}://${baseHost}/downloads/${filename}`;
      console.log('URL de descarga generada:', downloadUrl);
      
      // Generar QR code
      const qrCode = await QRCode.toDataURL(downloadUrl);
      console.log('QR generado exitosamente, longitud:', qrCode.length);
      
      const response = {
        success: true,
        image: `data:image/png;base64,${processedImageBase64}`,
        downloadUrl: downloadUrl,
        qrCode: qrCode,
        message: 'Imagen generada y procesada exitosamente'
      };
      
      console.log('Respuesta enviada con QR:', !!response.qrCode);
      res.json(response);
    } else {
      res.status(500).json({
        error: 'No se pudo generar la imagen',
        details: 'La API no retornó una imagen'
      });
    }

  } catch (error) {
    console.error('Error al generar imagen:', error);
    
    // Limpiar archivo temporal en caso de error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({
      error: 'Error al generar la imagen',
      details: error.message
    });
  }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Generador IBM API está funcionando',
    hasApiKey: !!process.env.GOOGLE_API_KEY
  });
});

// Endpoint para servir archivos de descarga
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'downloads', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📱 Acceso desde la red local: http://${getLocalIP()}:${PORT}`);
  console.log(`✨ Generador de fotos IBM está listo`);
  
  if (!process.env.GOOGLE_API_KEY) {
    console.warn('⚠️  ADVERTENCIA: No se encontró GOOGLE_API_KEY en el archivo .env');
  }
});
