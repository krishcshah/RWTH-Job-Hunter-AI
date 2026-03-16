import fs from 'fs';
import PDFDocument from 'pdfkit';

const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('test.pdf'));
doc.text('This is a test PDF.');
doc.end();
