import { Component, OnInit } from '@angular/core';
import { DragulaService } from 'ng2-dragula';
import * as PDFLib from 'pdf-lib';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'app';
  uploadedPdfs: File[] = [];
  mergedPdf: Uint8Array | null = null;
  newFileName = 'merged_document.pdf';

  constructor(private dragulaService: DragulaService) {
    // Listen for drag-drop reorder event
    this.dragulaService.dropModel.subscribe(() => {
      this.coordinateMergePDFs();
    });
  }

  ngOnInit(): void {}

  /** Capture uploaded files */
  reorderFiles(event: any): void {
    const files: FileList = event.target.files;
    for (let i = 0; i < files.length; i++) {
      this.uploadedPdfs.push(files[i]);
    }
    this.coordinateMergePDFs();
  }

  /** Read File as Uint8Array */
  private readFileAsUint8Array(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event: any) => {
        if (event.target && event.target.result) {
          resolve(new Uint8Array(event.target.result));
        } else {
          reject('Could not read the PDF file');
        }
      };

      reader.onerror = (error) => reject(error);
      reader.readAsArrayBuffer(file);
    });
  }

  /** Merge multiple PDFs into one */
  async coordinateMergePDFs(): Promise<void> {
    if (this.uploadedPdfs.length < 2) {
      this.mergedPdf = null;
      return;
    }

    try {
      const pdfBuffers: Uint8Array[] = await Promise.all(
        this.uploadedPdfs.map(f => this.readFileAsUint8Array(f))
      );
      this.mergedPdf = await this.mergePDFsIntoOne(pdfBuffers);
    } catch (err) {
      console.error('Error merging PDFs:', err);
      alert('Failed to merge PDFs.');
    }
  }

  /** Merge logic */
  async mergePDFsIntoOne(pdfs: Uint8Array[]): Promise<Uint8Array> {
  // Create an empty output PDF
  const mergedPdf = PDFLib.PDFDocumentFactory.create();

  // Iterate through each uploaded PDF file
  for (const pdfBytes of pdfs) {
    // Load source PDF
    const src = PDFLib.PDFDocumentFactory.load(pdfBytes);

    // Get all pages from the source PDF
    const pages = src.getPages();

    // Add each page to the merged document
    pages.forEach((page: any) => {
      mergedPdf.addPage(page);
    });
  }

  // Save the combined document to bytes
  const mergedPdfBytes = PDFLib.PDFDocumentWriter.saveToBytes(mergedPdf);

  return mergedPdfBytes;
}


  /** Download merged PDF */
  downloadMergedPDF(): void {
    if (!this.mergedPdf) return;

    const blob = new Blob([this.mergedPdf as any as ArrayBuffer], {
      type: 'application/pdf'
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.newFileName.endsWith('.pdf')
      ? this.newFileName
      : `${this.newFileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}
