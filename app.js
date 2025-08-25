// Importa el cliente de Supabase para la interacción con la base de datos y autenticación.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Configuración de Supabase: URL y clave anónima pública.
const SUPABASE_URL = "https://yvjrcuhffesydxvvsoys.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2anJjdWhmZmVzeWR4dnZzb3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4Mjk3MDMsImV4cCI6MjA3MTQwNTcwM30.S3nrwoaLoPl5Xf4FHEOSOsH3QSBfNQUL7uPXDbv1_qw";

// Inicializa el cliente de Supabase.
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Referencias a Elementos de la UI ---
// Se obtienen los elementos del DOM para manipular la interfaz.
const loginCard = document.getElementById('loginCard');
const appCard = document.getElementById('appCard');
const blockedCard = document.getElementById('blockedCard');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLogout = document.getElementById('btn-logout');
const btnLogout2 = document.getElementById('btn-logout-2');
const btnLoad = document.getElementById('btn-load');
const btnNext = document.getElementById('nextBtn');
const btnGenerateAll = document.getElementById('btn-generate-all'); // Botón para generar todos los PDFs.
const statusEl = document.getElementById('status');
const loginError = document.getElementById('login-error');

// --- Estado de la Aplicación ---
// Variables para mantener el estado actual del usuario y la lista de nombres.
let currentUser = null;
let namesList = [];
let currentIndex = 0;

// --- Funciones de Control de la UI ---

/**
 * Muestra u oculta las diferentes secciones de la aplicación.
 * @param {'login' | 'app' | 'blocked'} section - La sección a mostrar.
 */
function showSection(section) {
  loginCard.classList.toggle('hidden', section !== 'login');
  appCard.classList.toggle('hidden', section !== 'app');
  blockedCard.classList.toggle('hidden', section !== 'blocked');
  btnLogout.classList.toggle('hidden', section !== 'app');
}

/**
 * Habilita o deshabilita los botones de generación para evitar acciones concurrentes.
 * @param {boolean} enabled - `true` para habilitar, `false` para deshabilitar.
 */
function setButtonsState(enabled) {
    btnNext.disabled = !enabled;
    btnGenerateAll.disabled = !enabled;
}

// --- Lógica de Autenticación y Whitelist ---

/**
 * Verifica si el email del usuario está en la lista de usuarios autorizados en Supabase.
 * @param {string} email - El email del usuario.
 * @returns {Promise<boolean>} - `true` si está autorizado, `false` en caso contrario.
 */
async function checkWhitelist(email) {
  const { data, error } = await supabase
    .from('usuarios_autorizados')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error('❌ Error verificando whitelist:', error);
    return false;
  }
  return !!data;
}

/**
 * Maneja la sesión de autenticación. Obtiene el usuario actual y muestra la sección correspondiente.
 */
async function handleSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    currentUser = null;
    showSection('login');
    return;
  }
  currentUser = user;
  const allowed = await checkWhitelist(user.email);
  showSection(allowed ? 'app' : 'blocked');
}

// Se maneja la sesión al cargar la página y en cada cambio de estado de autenticación.
handleSession();
supabase.auth.onAuthStateChange(handleSession);


// --- Lógica de Generación de PDF ---

/**
 * Sanea un nombre de archivo para que sea seguro para el sistema de archivos.
 * @param {string} name - El nombre a sanear.
 * @returns {string} - El nombre saneado.
 */
function sanitizeFilename(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Quita acentos.
    .replace(/[^\w\-]+/g, '_') // Reemplaza caracteres no alfanuméricos por guion bajo.
    .replace(/_+/g, '_') // Evita guiones bajos consecutivos.
    .replace(/^_+|_+$/g, ''); // Limpia guiones al inicio y final.
}

/**
 * Crea un único PDF a partir de un bloque de texto.
 * @param {string} rawBlock - El bloque de texto con nombres y cargos.
 * @returns {Promise<{pdfBytes: Uint8Array, filename: string}|null>} - Los bytes del PDF y el nombre de archivo, o `null` si falla.
 */
async function createPdf(rawBlock, templateName = "ES_invitacion.pdf") {
  try {
    const allowedTemplates = ["ES_invitacion.pdf", "EN_invitation.pdf"];
    if (!allowedTemplates.includes(templateName)) {
      throw new Error("Plantilla no permitida");
    }

    const lines = rawBlock.split("\n").map(l => l.trim()).filter(l => l.length > 0);
    const sanitizedName = sanitizeFilename(lines[0] || `Invitacion`);

    const templateUrl = `assets/${templateName}`;
    const existingPdfBytes = await fetch(templateUrl).then(res => res.arrayBuffer());
    const pdfDoc = await PDFLib.PDFDocument.load(existingPdfBytes);

    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await fetch("assets/fonts/DobraSlab-Book.ttf").then(res => res.arrayBuffer());
    const customFont = await pdfDoc.embedFont(fontBytes);

    const page = pdfDoc.getPages()[0];
    const { height } = page.getSize();

    let y = height - 221;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 12, font: customFont, color: PDFLib.rgb(0, 0, 0) });
      y -= 14;
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `Invitacion_${sanitizedName}.pdf`;

    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const pdfUrl = await uploadPdfToStorage(filename, blob);
    await saveInvitation(rawBlock, pdfUrl);

    return { pdfBytes, filename };
  } catch (error) {
    console.error("Error creando PDF:", error);
    return null;
  }
}

/**
 * Genera el siguiente PDF de la lista y lo descarga.
 */
async function generateNext() {
  if (currentIndex >= namesList.length) {
    statusEl.textContent = "✅ Todos los PDF fueron generados.";
    setButtonsState(true);
    return;
  }

  setButtonsState(false);
  const rawBlock = namesList[currentIndex];
  statusEl.textContent = `Generando invitación ${currentIndex + 1}/${namesList.length}...`;

  const result = await createPdf(rawBlock);

  if (result) {
    const { pdfBytes, filename } = result;
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();

    currentIndex++;
    statusEl.textContent = `Se generó ${filename}. Faltan ${namesList.length - currentIndex}.`;
  } else {
    statusEl.textContent = `❌ Error al generar para el bloque ${currentIndex + 1}.`;
  }

  if (currentIndex >= namesList.length) {
    statusEl.textContent = "✅ Todos los PDF fueron generados.";
    setButtonsState(true); // Habilita los botones al final.
    btnNext.disabled = true; // Pero deshabilita 'siguiente' si ya no hay más.
  } else {
    setButtonsState(true);
  }
}

/**
 * Genera todos los PDFs de la lista y los comprime en un archivo .zip si son más de uno.
 */
async function generateAll() {
    if (namesList.length === 0) {
        alert("No hay nombres cargados.");
        return;
    }

    // Si es solo un documento, se genera directamente.
    if (namesList.length === 1) {
        currentIndex = 0;
        await generateNext();
        return;
    }

    setButtonsState(false);
    statusEl.textContent = 'Iniciando generación masiva...';
    const zip = new JSZip();

    for (let i = 0; i < namesList.length; i++) {
        const rawBlock = namesList[i];
        statusEl.textContent = `Generando PDF ${i + 1} de ${namesList.length}...`;
        const result = await createPdf(rawBlock);

        if (result) {
            zip.file(result.filename, result.pdfBytes);
        } else {
            console.error(`No se pudo generar el PDF para el bloque: ${rawBlock}`);
        }
    }

    statusEl.textContent = 'Comprimiendo archivos...';
    try {
        const zipContent = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(zipContent);
        link.download = "Invitaciones.zip";
        link.click();
        statusEl.textContent = '✅ Archivo .zip generado y descargado.';
    } catch (error) {
        console.error("Error al crear el .zip:", error);
        statusEl.textContent = '❌ Error al comprimir los archivos.';
    }

    setButtonsState(true);
}


// --- Lógica de Supabase (Guardado y Subida) ---

/**
 * Guarda la información de la invitación en la base de datos de Supabase.
 * @param {string} nombre - El contenido del bloque de la invitación.
 * @param {string|null} pdfUrl - La URL pública del PDF en Supabase Storage.
 * @param {'ES'|'EN'} idioma - El idioma de la invitación.
 */
async function saveInvitation(nombre, pdfUrl = null, idioma = 'ES') {
  if (!currentUser) return console.error("❌ No hay usuario autenticado.");
  if (!nombre || typeof nombre !== 'string') return console.error("❌ Nombre inválido:", nombre);

  const payload = { nombre, user_id: currentUser.id, idioma, pdf_url: pdfUrl };
  const { error } = await supabase.from('invitaciones').insert([payload]);

  if (error) {
    console.error("❌ Error guardando invitación:", JSON.stringify(error, null, 2));
    alert("No se pudo guardar la invitación. Revisa la consola.");
  }
}

/**
 * Sube un archivo Blob (PDF) a Supabase Storage.
 * @param {string} filename - El nombre del archivo.
 * @param {Blob} blob - El contenido del archivo.
 * @returns {Promise<string|null>} - La URL pública del archivo subido.
 */
async function uploadPdfToStorage(filename, blob) {
    const { error } = await supabase.storage
        .from('invitaciones')
        .upload(filename, blob, { upsert: true, contentType: 'application/pdf' });

    if (error) {
        console.error("❌ Error subiendo PDF:", error);
        return null;
    }

    const { data } = supabase.storage.from('invitaciones').getPublicUrl(filename);
    return data.publicUrl;
}


// --- Event Listeners ---

// Inicia sesión con Google.
btnLoginGoogle.addEventListener('click', async () => {
  loginError.textContent = '';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) {
    console.error(error);
    loginError.textContent = 'No se pudo iniciar sesión con Google.';
  }
});

// Cierra la sesión.
async function doLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  namesList = [];
  currentIndex = 0;
  statusEl.textContent = 'Esperando nombres...';
  showSection('login');
}
btnLogout.addEventListener('click', doLogout);
btnLogout2.addEventListener('click', doLogout);

// Carga los nombres desde el textarea.
btnLoad.addEventListener('click', () => {
  const rawText = document.getElementById("names").value;
  const blocks = rawText.split(",").map(b => b.trim()).filter(b => b.length > 0);

  if (blocks.length === 0) {
    alert("Por favor ingrese al menos un bloque de texto.");
    return;
  }

  namesList = blocks;
  currentIndex = 0;
  statusEl.textContent = `Se cargaron ${namesList.length} bloques. Listo para generar.`;
  setButtonsState(true); // Habilita ambos botones de generación.
});

// Asigna las funciones a los botones de generación.
btnNext.addEventListener('click', generateNext);
btnGenerateAll.addEventListener('click', generateAll);
