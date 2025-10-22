import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

interface ExtractionRequest {
  mongoUri: string;
  collectionName: string;
  limitTo3: boolean;
  allCollections: boolean;
}

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  extractionForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.extractionForm = this.fb.group({
      mongoUri: ['', Validators.required],
      collectionName: ['', Validators.required],
      limitTo3: [false],
      allCollections: [false]
    });

    // Watch allCollections checkbox to disable/enable collectionName
    this.extractionForm.get('allCollections')?.valueChanges.subscribe((allCollections: boolean) => {
      const collectionNameControl = this.extractionForm.get('collectionName');
      if (allCollections) {
        collectionNameControl?.disable();
        collectionNameControl?.clearValidators();
      } else {
        collectionNameControl?.enable();
        collectionNameControl?.setValidators([Validators.required]);
      }
      collectionNameControl?.updateValueAndValidity();
    });
  }

  onSubmit(): void {
    if (this.extractionForm.invalid) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const formValue = this.extractionForm.getRawValue() as ExtractionRequest;

    this.http.post('http://localhost:3000/api/extract', formValue, {
      responseType: 'blob',
      observe: 'response'
    }).subscribe({
      next: (response) => {
        this.isLoading = false;
        
        // Get filename from content-disposition header or use default
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'download';
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }

        // Create download link
        const blob = response.body;
        if (blob) {
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          link.click();
          window.URL.revokeObjectURL(url);
          
          this.successMessage = 'Data extracted successfully!';
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Failed to extract data. Please check your MongoDB URI and try again.';
        console.error('Error:', error);
      }
    });
  }
}
