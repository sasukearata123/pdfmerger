import { PDFDocument } from 'pdf-lib'
import './style.css'

// State
let filesData = []; // Array of { file: File, pages: number, pdfDoc: PDFDocument }
const MAX_FILES = 3;
const MAX_PAGES_PER_FILE = 3;

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const selectBtn = document.getElementById('select-files-btn');
const filesListEl = document.getElementById('files-list');
const mergeBtn = document.getElementById('merge-btn');
const errorEl = document.getElementById('error-message');
const resultContainer = document.getElementById('result-container');
const downloadBtn = document.getElementById('download-btn');

// --- Event Listeners ---

selectBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    handleFiles(Array.from(e.target.files));
    fileInput.value = ''; // Reset input
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-active');
    handleFiles(Array.from(e.dataTransfer.files));
});

mergeBtn.addEventListener('click', mergePDFs);

// --- Functions ---

async function handleFiles(newFiles) {
    hideError();
    resultContainer.classList.add('hidden'); // Hide result on new actions

    // Filter for PDFs only
    const pdfFiles = newFiles.filter(f => f.type === 'application/pdf');
    if (pdfFiles.length !== newFiles.length) {
        showError('Only PDF files are allowed.');
    }

    if (pdfFiles.length === 0) return;

    // Check total file count limit
    if (filesData.length + pdfFiles.length > MAX_FILES) {
        showError(`You can only add up to ${MAX_FILES} PDF files.`);
        return;
    }

    // Process each file
    for (const file of pdfFiles) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            // Load PDF to check page count
            // ignoreEncryption: true is helpful if we don't want to deal with password protected PDFs immediately,
            // but if it is encrypted, we might fail later. For now let's try standard load.
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const pageCount = pdfDoc.getPageCount();

            if (pageCount > MAX_PAGES_PER_FILE) {
                showError(`"${file.name}" has ${pageCount} pages. Max allowed is ${MAX_PAGES_PER_FILE}.`);
                continue; // Skip this file
            }

            // Add to state
            filesData.push({
                file,
                pageCount,
                pdfDoc, // Store loaded doc to reuse
                id: Date.now() + Math.random()
            });
        } catch (err) {
            console.error(err);
            showError(`Failed to load "${file.name}". It might be corrupted or encrypted.`);
        }
    }

    renderFileList();
    updateMergeButton();
}

function renderFileList() {
    filesListEl.innerHTML = '';
    filesData.forEach((data, index) => {
        const el = document.createElement('div');
        el.className = 'file-item';
        el.innerHTML = `
      <div class="file-info">
        <span class="file-name">${index + 1}. ${data.file.name}</span>
        <span class="file-meta">${data.pageCount} page${data.pageCount !== 1 ? 's' : ''}</span>
      </div>
      <button class="remove-btn" onclick="window.removeFile('${data.id}')" title="Remove">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
        filesListEl.appendChild(el);
    });
}

// Expose remove function globally so inline onclick works
window.removeFile = (id) => {
    filesData = filesData.filter(f => f.id != id);
    renderFileList();
    updateMergeButton();
    hideError();
    resultContainer.classList.add('hidden');
};

function updateMergeButton() {
    // Need at least 2 files (usually) to "merge", but technically 1 is fine too if they just want to process it?
    // Let's standardly require at least 1, but "merging" implies 2+.
    // User said "merge say at max 3 pdfs", usually implies joining.
    // Let's allow 1 file (maybe they want to just re-save it? Unlikely usefulness but safer to allow).
    // Actually, let's stick to helpful logical constraint: "Merge" usually needs >= 2.
    // BUT effectively user might just want to test with 1. Let's allow >= 1.
    mergeBtn.disabled = filesData.length === 0;
    mergeBtn.innerText = filesData.length > 0 ? `Merge ${filesData.length} PDFs` : 'Merge PDFs';
}

function showError(msg) {
    errorEl.innerText = msg;
    errorEl.classList.remove('hidden');
    // Auto hide after 5 seconds
    setTimeout(() => {
        if (errorEl.innerText === msg) hideError();
    }, 5000);
}

function hideError() {
    errorEl.classList.add('hidden');
    errorEl.innerText = '';
}

async function mergePDFs() {
    if (filesData.length === 0) return;

    mergeBtn.disabled = true;
    mergeBtn.innerText = 'Merging...';

    try {
        const mergedPdf = await PDFDocument.create();

        for (const data of filesData) {
            // Copy pages from source pdfs
            const copiedPages = await mergedPdf.copyPages(data.pdfDoc, data.pdfDoc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();

        // Prepare download
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // Show success UI
        resultContainer.classList.remove('hidden');

        // Clean up old listener
        const newDownloadBtn = downloadBtn.cloneNode(true);
        downloadBtn.parentNode.replaceChild(newDownloadBtn, downloadBtn);

        newDownloadBtn.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = url;
            a.download = `merged_document_${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // URL.revokeObjectURL(url); // Don't revoke immediately in case they click twice
        });

    } catch (err) {
        console.error(err);
        showError('An error occurred while merging PDFs.');
    } finally {
        mergeBtn.disabled = false;
        updateMergeButton();
    }
}
