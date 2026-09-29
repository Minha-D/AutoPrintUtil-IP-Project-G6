const fs = require('fs');
const { PDFDocument } = require('pdf-lib');
const { getDocumentPath } = require('./user-files');

const rates = { color: 5, bw: 3 };

async function createPrintQuote(db, studentId, documentId, copies, color) {
  const document = db.documents.find(entry =>
    entry.id === documentId && entry.studentId === studentId
  );
  if (!document) {
    const error = new Error('Document not found');
    error.status = 404;
    throw error;
  }

  const normalizedCopies = Number(copies);
  if (!Number.isInteger(normalizedCopies) || normalizedCopies < 1 || normalizedCopies > 100) {
    const error = new Error('Copies must be a whole number between 1 and 100.');
    error.status = 400;
    throw error;
  }
  if (!Object.hasOwn(rates, color)) {
    const error = new Error('Choose color or black & white printing.');
    error.status = 400;
    throw error;
  }

  const filePath = getDocumentPath(studentId, document.filename);
  let pdf;
  try {
    pdf = await PDFDocument.load(fs.readFileSync(filePath));
  } catch {
    const error = new Error('Could not read this PDF to calculate its page count.');
    error.status = 422;
    throw error;
  }

  const pages = pdf.getPageCount();
  const ratePerPage = rates[color];
  return {
    documentId: document.id,
    filename: document.originalName,
    pages,
    copies: normalizedCopies,
    color,
    ratePerPage,
    totalPages: pages * normalizedCopies,
    totalBdt: pages * normalizedCopies * ratePerPage
  };
}

module.exports = { createPrintQuote, rates };