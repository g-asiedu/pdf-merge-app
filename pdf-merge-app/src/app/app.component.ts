import { Component } from '@angular/core';
import * as PDFLib from 'pdf-lib';

interface PdfUrlEntry {
  url: string;
  status: 'pending' | 'success' | 'error';
  progress: number; // percentage
  sizeMB?: number;
  errorMessage?: string;
  bytes?: Uint8Array;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent {
  pdfUrls: PdfUrlEntry[] = [];
  mergedPdf: Uint8Array | null = null;
  merging = false;
  mergeProgress = 0;

  addPdfUrl() {
    this.pdfUrls.push({ url: '', status: 'pending', progress: 0 });
  }

  removePdf(index: number) {
    this.pdfUrls.splice(index, 1);
  }

  clearAll() {
    this.pdfUrls = [];
    this.mergedPdf = null;
    this.mergeProgress = 0;
  }

  /** --- Parallel download with progress and batch limiting --- */
  async downloadAllPdfs(concurrency = 5) {
    const queue = Array.from({ length: this.pdfUrls.length }, (_, i) => i);
    const workers: Promise<void>[] = [];

    const worker = async () => {
      while (queue.length > 0) {
        const index = queue.shift();
        if (index === undefined) return;
        const entry = this.pdfUrls[index];
        entry.status = 'pending';
        try {
          entry.bytes = await this.fetchPdfWithProgress(entry);
          entry.status = 'success';
        } catch (err: any) {
          entry.status = 'error';
          entry.errorMessage = err.message || 'Download failed';
        }
      }
    };

    for (let i = 0; i < concurrency; i++) {
      workers.push(worker());
    }

    await Promise.allSettled(workers);
  }

  /** --- Download single PDF with streaming progress --- */
  private async fetchPdfWithProgress(entry: PdfUrlEntry): Promise<Uint8Array> {
    const response = await fetch(entry.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentLength = Number(response.headers.get('Content-Length')) || 0;
    const reader = response.body?.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;

    if (!reader) throw new Error('No readable stream');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (contentLength) {
          entry.progress = Math.round((received / contentLength) * 100);
        } else {
          entry.progress = Math.min(100, entry.progress + 10);
        }
      }
    }

    const blob = new Blob(chunks);
    entry.sizeMB = +(blob.size / (1024 * 1024)).toFixed(2);
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /** --- Merge PDFs after downloads --- */
  async mergePdfs() {
    this.merging = true;
    this.mergeProgress = 0;
    this.mergedPdf = null;

    try {
      // Step 1: Download all
      await this.downloadAllPdfs(5);

      const valid = this.pdfUrls.filter((f) => f.status === 'success');
      if (valid.length < 2) {
        alert('Need at least two successful PDFs to merge.');
        this.merging = false;
        return;
      }

      // Step 2: Create merged document
    const merged = await PDFLib.PDFDocument.create();

    for (let i = 0; i < valid.length; i++) {
      const src = await PDFLib.PDFDocument.load(valid[i].bytes!);
      const copiedPages = await merged.copyPages(src, src.getPageIndices());
      copiedPages.forEach((page) => merged.addPage(page));
      this.mergeProgress = Math.round(((i + 1) / valid.length) * 100);
    }


      // Step 3: Save merged output
      this.mergedPdf = await merged.save();
      this.merging = false;
      this.mergeProgress = 100;
    } catch (error) {
      console.error('Merge failed:', error);
      alert('Merge failed. See console for details.');
      this.merging = false;
    }
  }

  /** --- Post-merge actions --- */
  viewMergedPdf() {
    if (!this.mergedPdf) return;
    const blob = new Blob([this.mergedPdf as any as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  downloadMergedPdf() {
    if (!this.mergedPdf) return;
    const blob = new Blob([this.mergedPdf as any as ArrayBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'merged.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
