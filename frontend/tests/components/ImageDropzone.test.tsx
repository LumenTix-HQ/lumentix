import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ImageDropzone from '@/components/ImageDropzone';
import { MAX_IMAGE_BYTES } from '@/lib/utils/image-upload';

function makeFile(name: string, type: string, size: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function dropFiles(zone: HTMLElement, files: File[]) {
  fireEvent.drop(zone, { dataTransfer: { files, types: ['Files'] } });
}

beforeEach(() => {
  cleanup();
  // jsdom does not implement object URLs.
  vi.stubGlobal('URL', Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  }));
});

describe('ImageDropzone', () => {
  it('renders a focusable drop zone with the accepted formats', () => {
    render(<ImageDropzone file={null} onFileChange={vi.fn()} />);
    const zone = screen.getByRole('button', { name: /drag & drop an image/i });
    expect(zone).toBeTruthy();
    expect(zone.tagName).toBe('BUTTON'); // focusable + Enter/Space activation
    expect(screen.getByText(/JPEG or PNG, up to 5 MB/i)).toBeTruthy();
  });

  it('opens the file picker when activated by keyboard', () => {
    const { container } = render(<ImageDropzone file={null} onFileChange={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');

    const zone = screen.getByRole('button', { name: /drag & drop an image/i });
    zone.focus();
    expect(document.activeElement).toBe(zone);
    // A native button fires `click` for both Enter and Space.
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('accepts a valid dropped file', () => {
    const onFileChange = vi.fn();
    render(<ImageDropzone file={null} onFileChange={onFileChange} />);
    const file = makeFile('cover.png', 'image/png', 1024);
    dropFiles(screen.getByRole('button', { name: /drag & drop an image/i }), [file]);
    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it('shows an inline error and clears the selection for an invalid type', () => {
    const onFileChange = vi.fn();
    render(<ImageDropzone file={null} onFileChange={onFileChange} />);
    dropFiles(
      screen.getByRole('button', { name: /drag & drop an image/i }),
      [makeFile('notes.pdf', 'application/pdf', 1024)],
    );
    expect(screen.getByRole('alert').textContent).toMatch(/JPEG or PNG/);
    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it('shows an inline error for an oversized file', () => {
    render(<ImageDropzone file={null} onFileChange={vi.fn()} />);
    dropFiles(
      screen.getByRole('button', { name: /drag & drop an image/i }),
      [makeFile('huge.jpg', 'image/jpeg', MAX_IMAGE_BYTES + 1)],
    );
    expect(screen.getByRole('alert').textContent).toMatch(/maximum size is 5 MB/);
  });

  it('renders a preview with a remove button once a file is staged', () => {
    const onFileChange = vi.fn();
    const file = makeFile('cover.png', 'image/png', 2048);
    render(<ImageDropzone file={file} onFileChange={onFileChange} />);

    const preview = screen.getByAltText(/preview of cover.png/i) as HTMLImageElement;
    expect(preview.src).toBe('blob:preview');
    expect(screen.getByText(/cover.png — 2 KB/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /remove selected image/i }));
    expect(onFileChange).toHaveBeenCalledWith(null);
  });

  it('renders an accessible progress bar while uploading', () => {
    render(
      <ImageDropzone
        file={makeFile('cover.png', 'image/png', 2048)}
        onFileChange={vi.fn()}
        status="uploading"
        progress={42}
      />,
    );
    const bar = screen.getByRole('progressbar', { name: /image upload progress/i });
    expect(bar.getAttribute('aria-valuenow')).toBe('42');
    expect(screen.getByText(/42%/)).toBeTruthy();
  });

  it('surfaces an upload error from the parent', () => {
    render(
      <ImageDropzone
        file={makeFile('cover.png', 'image/png', 2048)}
        onFileChange={vi.fn()}
        status="error"
        uploadError="Server rejected the upload"
      />,
    );
    expect(screen.getByRole('alert').textContent).toBe('Server rejected the upload');
  });
});
