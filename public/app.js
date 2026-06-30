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
const videoWrap = document.getElementById('videoWrap');
const filterLogo = document.getElementById('filterLogo');
const filterRobot = document.getElementById('filterRobot');

let cameraStream = null;

// Filtro: los 4 robots con su animación. Se elige UNO al azar por foto.
const FILTER_ROBOTS = [
    { src: 'DIBM.png', anim: 'anim-wave' },   // azul (saluda)
    { src: 'AIBM.png', anim: 'anim-bounce' }, // morado (salta)
    { src: 'CIBM.png', anim: 'anim-float' },  // rosa (flota)
    { src: 'BIBM.png', anim: 'anim-wiggle' }  // verde (se mueve)
];
let currentRobot = null;
let currentSide = 'right';

// Elige robot y lado al azar y arma el overlay del filtro
function setupFilter() {
    currentRobot = FILTER_ROBOTS[Math.floor(Math.random() * FILTER_ROBOTS.length)];
    currentSide = Math.random() < 0.5 ? 'left' : 'right';
    filterRobot.src = currentRobot.src;
    filterRobot.className = 'filter-robot ' + currentSide + ' ' + currentRobot.anim;
}

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
        setupFilter(); // elegir robot aleatorio para esta foto
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

// Captura la imagen aplicando el filtro (video + logo arriba + robot aleatorio)
function captureImage() {
    const boxW = videoWrap.clientWidth || cameraVideo.videoWidth;
    const boxH = videoWrap.clientHeight || cameraVideo.videoHeight;

    // Lienzo de salida en alta resolución, con la MISMA proporción que se ve en pantalla
    const outW = 1080;
    const outH = Math.round(outW * (boxH / boxW));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    // 1) Video con recorte "cover" (igual que en la vista previa)
    const vW = cameraVideo.videoWidth;
    const vH = cameraVideo.videoHeight;
    const scale = Math.max(outW / vW, outH / vH);
    const sW = outW / scale;
    const sH = outH / scale;
    const sX = (vW - sW) / 2;
    const sY = (vH - sH) / 2;
    ctx.drawImage(cameraVideo, sX, sY, sW, sH, 0, 0, outW, outH);

    // 2) Logo IBM | telcel arriba al centro (40% del ancho)
    if (filterLogo.naturalWidth) {
        const lw = outW * 0.40;
        const lh = lw * (filterLogo.naturalHeight / filterLogo.naturalWidth);
        ctx.drawImage(filterLogo, (outW - lw) / 2, outH * 0.04, lw, lh);
    }

    // 3) Robot aleatorio abajo, del lado elegido (58% del alto)
    if (filterRobot.naturalWidth) {
        const rh = outH * 0.58;
        const rw = rh * (filterRobot.naturalWidth / filterRobot.naturalHeight);
        const rx = currentSide === 'left' ? outW * 0.01 : outW - rw - outW * 0.01;
        ctx.drawImage(filterRobot, rx, outH - rh, rw, rh);
    }

    const dataUrl = canvas.toDataURL('image/png');
    imagePreview.src = dataUrl;
    previewContainer.style.display = 'none';
    cameraModal.style.display = 'none';
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }

    mostrarResultadoFiltro(dataUrl);
}

// Muestra el resultado del filtro y lo guarda en la base de datos (privado)
async function mostrarResultadoFiltro(dataUrl) {
    resultImage.src = dataUrl;
    document.querySelector('.upload-section').style.display = 'none';
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (window.confetti) {
        window.confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.6 },
            colors: ['#0f62fe', '#8a3ffc', '#24a148', '#ee5396'],
            shapes: ['circle', 'square'],
            gravity: 0.6,
            ticks: 300
        });
    }

    // Guardar en el servidor (MySQL + respaldo privado)
    try {
        const resp = await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: dataUrl, robot: currentRobot ? currentRobot.src : null })
        });
        if (resp.ok) {
            showToast('¡Foto lista! 🎉', 'success');
        } else {
            showToast('Foto lista (no se pudo guardar en el servidor)', 'error');
        }
    } catch (e) {
        console.error('Error guardando la foto:', e);
        showToast('Foto lista (sin conexión al servidor)', 'error');
    }
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

    // Construir el prompt: la persona con los 4 robots IBM
    const nombre = window.nombreUsuario || 'Usuario';

    const prompt = `Esta es la foto real de una persona.

Tu única tarea es CAMBIAR EL FONDO por un fondo de estudio azul corporativo estilo IBM: degradado azul limpio (de azul medio luminoso a azul marino), profesional y moderno, con sutiles ondas/líneas tecnológicas suaves y un ligero viñeteado. Tipo retrato corporativo de estudio.

REGLAS ESTRICTAS:
- NO modifiques a la persona. Conserva EXACTAMENTE su rostro, rasgos, expresión, tono de piel, cabello, barba/vello facial, lentes y ropa. La cara debe quedar IDÉNTICA a la foto original; no la regeneres, no la suavices, no la embellezcas, no cambies su edad ni su peinado.
- Reemplaza SOLO el fondo detrás de la persona; recórtala con bordes limpios (incluido el cabello) y déjala intacta.
- Ilumina a la persona de forma natural y favorecedora, manteniendo sus colores reales (que NO quede lavada ni pálida ni con tinte azul en la piel). Buen contraste y nitidez.
- Encuadre vertical tipo retrato: cabeza y hombros de la persona en la parte SUPERIOR-CENTRAL, ocupando aproximadamente los dos tercios superiores, dejando libre el tercio inferior.
- Resultado fotográfico realista, profesional, alta calidad.`;

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
        
        // Lanzar celebración con colores IBM
        if (window.confetti) {
            window.confetti({
                particleCount: 120,
                spread: 80,
                origin: { y: 0.6 },
                colors: ['#0f62fe', '#8a3ffc', '#24a148', '#ee5396'],
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
    const nombreArchivo = `IBM_${nombreLimpio}_${dia}-${mes}-${año}_${hora}-${minuto}-${segundo}.png`;
    
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
