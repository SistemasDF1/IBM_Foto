// Elementos DOM
const cameraBtn = document.getElementById('cameraBtn');
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const captureBtn = document.getElementById('captureBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const previewContainer = document.getElementById('previewContainer');
const imagePreview = document.getElementById('imagePreview');
const removeBtn = document.getElementById('removeBtn');
const promptInput = document.getElementById('promptInput');
const generateBtn = document.getElementById('generateBtn');
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const loadingOverlay = document.getElementById('loadingOverlay');
const downloadBtn = document.getElementById('downloadBtn');
const newBtn = document.getElementById('newBtn');
const toast = document.getElementById('toast');
const countdownEl = document.getElementById('countdown');

let cameraStream = null;

// Event Listeners
generateBtn.addEventListener('click', generateImage);
downloadBtn.addEventListener('click', downloadImage);
newBtn.addEventListener('click', resetForm);
cameraBtn.addEventListener('click', async () => {
    cameraModal.style.display = 'block';
    
    // 1. Verificar soporte básico y contexto seguro
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Tu navegador no permite acceso a la cámara. Asegúrate de usar HTTPS o localhost.');
        cameraModal.style.display = 'none';
        return;
    }

    try {
        // 2. Intentar obtener cámara (preferencia: frontal)
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        cameraVideo.srcObject = cameraStream;
    } catch (err) {
        console.error('Error de cámara:', err);
        
        // 3. Mensajes de error más claros
        let msg = 'No se pudo acceder a la cámara.';
        if (err.name === 'NotFoundError' || err.message.includes('not found')) {
            msg = 'No se detectó ninguna cámara conectada. Si estás en PC, conecta una webcam.';
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            msg = 'Permiso denegado. Debes permitir el acceso a la cámara en la barra de dirección.';
        } else if (err.name === 'NotReadableError') {
            msg = 'La cámara está siendo usada por otra aplicación (Zoom, Meet, etc).';
        }
        
        alert(`${msg}\n\nDetalle técnico: ${err.message || err.name}`);
        cameraModal.style.display = 'none';
    }
});
captureBtn.addEventListener('click', startCountdown);
closeCameraBtn.addEventListener('click', closeCamera);

// Funciones
function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
}

function checkFormValid() {
    // Verifica si hay imagen en el preview
    const hasImage = imagePreview.src && imagePreview.src.startsWith('data:image');
    generateBtn.disabled = !hasImage;
}

// Iniciar cuenta regresiva
function startCountdown() {
    let count = 3;
    countdownEl.style.display = 'block';
    countdownEl.textContent = count;
    
    const timer = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.textContent = count;
        } else {
            clearInterval(timer);
            countdownEl.style.display = 'none';
            captureImage();
        }
    }, 1000);
}

// Captura la imagen y genera directamente (sin mostrar la foto original)
function captureImage() {
    const canvas = document.createElement('canvas');
    canvas.width = cameraVideo.videoWidth;
    canvas.height = cameraVideo.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    imagePreview.src = dataUrl;
    previewContainer.style.display = 'none';
    cameraModal.style.display = 'none';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    // Generar automáticamente: el usuario solo ve la imagen creada por la IA
    generateImage();
}

// Quitar imagen capturada
removeBtn.addEventListener('click', () => {
    imagePreview.src = '';
    previewContainer.style.display = 'none';
    checkFormValid();
});

// Generar imagen usando la imagen capturada (base64)
async function generateImage() {
    if (!imagePreview.src || !imagePreview.src.startsWith('data:image')) {
        showToast('La imagen es requerida', 'error');
        imagePreview.classList.add('required');
        setTimeout(() => imagePreview.classList.remove('required'), 1500);
        return;
    }

    // Construir el prompt estilo XALDIGITAL (retrato de código binario)
    const nombre = window.nombreUsuario || 'Usuario';

    const prompt = `Usa la foto que acabo de tomar como base principal.
Mantén mi identidad facial realista y reconocible (ojos, rasgos, cabello, vello facial).

Crea un retrato digital artístico tipo póster:
el rostro debe estar formado por código binario brillante (números 1 y 0)
y caracteres de datos pequeños en color dorado/amarillo luminoso,
siguiendo los contornos y volúmenes reales de la cara.
Los ojos deben permanecer realistas y visibles a través del código.

Un lado del rostro se desintegra y disuelve en partículas
de datos y dígitos que flotan hacia el borde de la imagen.

Fondo azul muy oscuro casi negro, con sutiles columnas de
código cayendo estilo matrix, iluminación cinematográfica.

En la parte inferior escribe el nombre "${nombre}"
en tipografía futurista digital color amarillo neón brillante.

Estilo póster tecnológico premium, alta calidad, ultra detallado,
no caricatura, no anime.`;

    promptInput.value = prompt;

    loadingOverlay.style.display = 'flex';

    try {
        const formData = new FormData();
        // Convierte el base64 a archivo antes de enviar
        const file = dataURLtoFile(imagePreview.src, 'captured.png');
        formData.append('image', file);
        formData.append('prompt', prompt);

        // Datos del participante (captura de leads del evento)
        const datos = window.datosUsuario || {};
        formData.append('nombre', datos.nombre || nombre);
        formData.append('empresa', datos.empresa || '');
        formData.append('puesto', datos.puesto || '');
        formData.append('telefono', datos.telefono || '');
        formData.append('ciudad', datos.ciudad || '');

        const response = await fetch('/api/generate', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        console.log('Respuesta del servidor:', data);

        if (!response.ok) {
            throw new Error(data.error || 'Error al generar la imagen');
        }

        resultImage.src = data.image;
        document.querySelector('.upload-section').style.display = 'none';
        resultSection.style.display = 'block';
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast('¡Imagen generada exitosamente! 🎉', 'success');
        
        // Lanzar celebración con colores XALDIGITAL (amarillo/dorado)
        if (window.confetti) {
            window.confetti({
                particleCount: 120,
                spread: 80,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FFE600', '#FFFFFF', '#000000'],
                shapes: ['circle', 'square'],
                gravity: 0.6,
                ticks: 300
            });
        }
        
        // Mostrar QR con URL de descarga
        console.log('QR recibido:', !!data.qrCode);
        if (data.qrCode) {
            console.log('Mostrando QR...');
            showQRCode(data.qrCode);
        } else {
            console.log('No se recibió QR del servidor');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast(error.message || 'Error al generar la imagen', 'error');
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function downloadImage() {
    const nombre = window.nombreUsuario || 'Usuario';
    const fecha = new Date();
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const año = fecha.getFullYear();
    const hora = String(fecha.getHours()).padStart(2, '0');
    const minuto = String(fecha.getMinutes()).padStart(2, '0');
    const segundo = String(fecha.getSeconds()).padStart(2, '0');
    const nombreLimpio = nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ]/g, '_');
    const nombreArchivo = `XALDIGITAL_${nombreLimpio}_${dia}-${mes}-${año}_${hora}-${minuto}-${segundo}.png`;
    
    const link = document.createElement('a');
    link.href = resultImage.src;
    link.download = nombreArchivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Imagen descargada', 'success');
}

function resetForm() {
    imagePreview.src = '';
    promptInput.value = '';
    previewContainer.style.display = 'none';
    resultSection.style.display = 'none';
    document.querySelector('.upload-section').style.display = 'block';
    generateBtn.disabled = true;
    
    // Limpiar QR
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) qrContainer.innerHTML = '';
    
    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Abrir la cámara
async function openCamera() {
    cameraModal.style.display = 'block';
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Tu navegador no permite acceso a la cámara. Asegúrate de usar HTTPS.');
        cameraModal.style.display = 'none';
        return;
    }

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        cameraVideo.srcObject = cameraStream;
    } catch (err) {
        console.error('Error de cámara:', err);
        alert('Error al abrir cámara: ' + (err.message || err.name));
        cameraModal.style.display = 'none';
    }
}

// Cerrar modal de cámara
function closeCamera() {
    cameraModal.style.display = 'none';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
}

// Verificar salud de la API al cargar
async function checkApiHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        
        if (!data.hasApiKey) {
            showToast('⚠️ Configura tu GOOGLE_API_KEY en el archivo .env', 'error');
        }
    } catch (error) {
        console.error('Error al verificar la API:', error);
    }
}

// Función para seleccionar color de piel
function selectSkin(tonoPiel) {
    // Remover selección anterior
    document.querySelectorAll('.skin-option').forEach(option => {
        option.style.border = '2px solid #e9ecef';
    });
    
    // Marcar opción seleccionada - buscar por el onclick que contiene el tono
    document.querySelectorAll('.skin-option').forEach(option => {
        if (option.getAttribute('onclick').includes(tonoPiel)) {
            option.style.border = '2px solid #434444ff';
        }
    });
    
    // Guardar selección
    window.tonoSeleccionado = tonoPiel;
    
    // Mostrar botón continuar
    document.getElementById('continue-photo-button').style.display = 'block';
}

// Función para abrir directamente la cámara después de seleccionar color de piel
function abrirCamara() {
    document.getElementById('skinSelectionContainer').style.display = 'none';
    document.getElementById('generatorContainer').style.display = 'block';
    // Abrir modal de cámara automáticamente
    setTimeout(() => {
        document.getElementById('cameraBtn').click();
    }, 100);
}

// Función para continuar a la sección de foto después de seleccionar color de piel
function continuarFoto() {
    document.getElementById('skinSelectionContainer').style.display = 'none';
    document.getElementById('generatorContainer').style.display = 'block';
}

// Función para seleccionar marco
function selectFrame(estiloMarco) {
    // Remover selección anterior
    document.querySelectorAll('.frame-option').forEach(option => {
        option.style.border = '2px solid #e9ecef';
    });
    
    // Marcar opción seleccionada
    document.querySelectorAll('.frame-option').forEach(option => {
        if (option.getAttribute('onclick') && option.getAttribute('onclick').includes(estiloMarco)) {
            option.style.border = '2px solid #434444ff';
        }
    });
    
    // Guardar selección
    window.marcoSeleccionado = estiloMarco;
}

// Función para mostrar QR de descarga
function showQRCode(qrCodeDataUrl) {
    const qrContainer = document.getElementById('qr-container');
    if (!qrContainer) return;
    
    qrContainer.innerHTML = '';
    
    // Crear título
    const title = document.createElement('h3');
    title.textContent = 'Escanea para descargar';
    title.style.color = '#ffffff';
    title.style.fontSize = '1.1rem';
    title.style.marginBottom = '10px';
    title.style.textShadow = '0 2px 4px rgba(0,0,0,0.5)';
    qrContainer.appendChild(title);
    
    // Mostrar QR generado por el servidor
    const qrImg = document.createElement('img');
    qrImg.src = qrCodeDataUrl;
    qrImg.style.width = '150px';
    qrImg.style.height = '150px';
    qrImg.style.border = '2px solid #ddd';
    qrImg.style.borderRadius = '10px';
    qrContainer.appendChild(qrImg);
}

// Ejecutar al cargar la página
checkApiHealth();
