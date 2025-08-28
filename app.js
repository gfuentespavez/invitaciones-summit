import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://yvjrcuhffesydxvvsoys.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2anJjdWhmZmVzeWR4dnZzb3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4Mjk3MDMsImV4cCI6MjA3MTQwNTcwM30.S3nrwoaLoPl5Xf4FHEOSOsH3QSBfNQUL7uPXDbv1_qw";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- UI Elements ---
const loginCard = document.getElementById('loginCard');
const appCard = document.getElementById('appCard');
const blockedCard = document.getElementById('blockedCard');
const btnLoginGoogle = document.getElementById('btn-login-google');
const btnLogout = document.getElementById('btn-logout');
const btnLogout2 = document.getElementById('btn-logout-2');
const btnLoad = document.getElementById('btn-load');
const btnNext = document.getElementById('nextBtn');
const btnGenerateAll = document.getElementById('btn-generate-all');
const statusEl = document.getElementById('status');
const loginError = document.getElementById('login-error');
const templateContainer = document.getElementById("templateContainer");
const templateSelector = document.getElementById("templateSelector");

// --- State ---
let currentUser = null;
let namesList = [];
let currentIndex = 0;

// --- UI Control ---
function showSection(section) {
    loginCard.classList.toggle('hidden', section !== 'login');
    appCard.classList.toggle('hidden', section !== 'app');
    blockedCard.classList.toggle('hidden', section !== 'blocked');
    btnLogout.classList.toggle('hidden', section !== 'app');
    templateContainer.classList.toggle("hidden", section !== 'app');
}

function setButtonsState(enabled) {
    btnNext.disabled = !enabled;
    btnGenerateAll.disabled = !enabled;
}

// --- Auth + Whitelist ---
async function checkWhitelist(email) {
    const { data, error } = await supabase
        .from('usuarios_autorizados')
        .select('email')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        console.error('❌ Error whitelist:', error);
        return false;
    }
    return !!data;
}

async function handleSession(event, session) {
    const user = session?.user || (await supabase.auth.getUser()).data?.user;
    if (!user) return showSection('login');

    currentUser = user;
    console.log("🔐 Usuario logueado:", user.email);
    const allowed = await checkWhitelist(user.email);
    showSection(allowed ? 'app' : 'blocked');
}

supabase.auth.onAuthStateChange(handleSession);
handleSession();

// --- PDF Logic ---
function sanitizeFilename(name) {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\-]+/g, '_').replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

async function createPdf(rawBlock, templateName = "ES_invitacion.pdf") {
    try {
        const allowedTemplates = ["ES_invitacion.pdf", "EN_invitation.pdf"];
        if (!allowedTemplates.includes(templateName)) throw new Error("Plantilla no permitida");

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
        await saveInvitation(rawBlock, pdfUrl, templateName.startsWith("ES") ? "ES" : "EN");

        return { pdfBytes, filename };
    } catch (error) {
        console.error("Error creando PDF:", error);
        return null;
    }
}

async function generateNext() {
    if (currentIndex >= namesList.length) {
        statusEl.textContent = "✅ Todos los PDF fueron generados.";
        return setButtonsState(true);
    }

    setButtonsState(false);
    const rawBlock = namesList[currentIndex];
    const selectedTemplate = templateSelector.value;

    statusEl.textContent = `Generando invitación ${currentIndex + 1}/${namesList.length}...`;
    const result = await createPdf(rawBlock, selectedTemplate);

    if (result) {
        const { pdfBytes, filename } = result;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
        link.download = filename;
        link.click();

        currentIndex++;
        statusEl.textContent = currentIndex >= namesList.length
            ? "✅ Todos los PDF fueron generados."
            : `Se generó ${filename}. Faltan ${namesList.length - currentIndex}.`;
    } else {
        statusEl.textContent = `❌ Error al generar bloque ${currentIndex + 1}.`;
    }

    setButtonsState(true);
    if (currentIndex >= namesList.length) btnNext.disabled = true;
}

async function generateAll() {
    if (namesList.length === 0) return alert("No hay nombres cargados.");
    if (namesList.length === 1) return generateNext();

    setButtonsState(false);
    statusEl.textContent = 'Iniciando generación masiva...';
    const zip = new JSZip();
    const selectedTemplate = templateSelector.value;

    for (let i = 0; i < namesList.length; i++) {
        statusEl.textContent = `Generando PDF ${i + 1} de ${namesList.length}...`;
        const result = await createPdf(namesList[i], selectedTemplate);
        if (result) zip.file(result.filename, result.pdfBytes);
    }

    const zipContent = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(zipContent);
    link.download = "Invitaciones.zip";
    link.click();

    statusEl.textContent = '✅ Archivo .zip generado.';
    setButtonsState(true);
}

// --- Supabase ---
async function saveInvitation(nombre, pdfUrl = null, idioma = 'ES') {
    if (!currentUser) return console.error("❌ No hay usuario autenticado.");
    const payload = { nombre, user_id: currentUser.id, idioma, pdf_url: pdfUrl };
    const { error } = await supabase.from('invitaciones').insert([payload]);
    if (error) console.error("❌ Error guardando invitación:", error);
}

async function uploadPdfToStorage(filename, blob) {
    const { error } = await supabase.storage
        .from('invitaciones')
        .upload(filename, blob, { upsert: true, contentType: 'application/pdf' });

    if (error) return console.error("❌ Error subiendo PDF:", error);
    return supabase.storage.from('invitaciones').getPublicUrl(filename).data.publicUrl;
}

// --- Events ---
btnLoginGoogle.addEventListener('click', async () => {
    loginError.textContent = '';
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) loginError.textContent = 'No se pudo iniciar sesión con Google.';
});

// --- Logout ---
async function doLogout() {
    try {
        await supabase.auth.signOut();
        currentUser = null;
        namesList = [];
        currentIndex = 0;
        statusEl.textContent = 'Esperando nombres...';
        showSection('login');
        console.log("🔓 Sesión cerrada correctamente.");
    } catch (error) {
        console.error("❌ Error al cerrar sesión:", error);
    }
}

btnLogout.addEventListener('click', doLogout);
btnLogout2.addEventListener('click', doLogout);