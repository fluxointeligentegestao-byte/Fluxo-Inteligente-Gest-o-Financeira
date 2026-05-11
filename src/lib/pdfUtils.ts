
/**
 * Converts a base64 string to a Blob object.
 */
export const base64ToBlob = (base64: string, contentType: string = '') => {
  if (!base64) return null;

  let b64Data = '';
  let actualType = contentType;

  if (base64.startsWith('data:')) {
    const parts = base64.split(';base64,');
    if (parts.length > 1) {
      actualType = parts[0].split(':')[1]?.split(';')[0] || contentType;
      b64Data = parts[1];
    } else {
      b64Data = base64;
    }
  } else {
    b64Data = base64;
  }

  // Clean the base64 string - remove any whitespace/newlines
  b64Data = b64Data.replace(/\s/g, '');

    try {
    const byteCharacters = atob(b64Data);
    console.log(`base64ToBlob: Successfully decoded ${b64Data.length} chars to ${byteCharacters.length} bytes. Type: ${actualType}`);
    
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }

    return new Blob(byteArrays, { type: actualType || 'application/pdf' });
  } catch (e) {
    console.error('Failed to convert base64 to blob. Length:', b64Data.length, 'Error:', e);
    return null;
  }
};

/**
 * Utility to download a blob or base64 as a file
 */
export const downloadFile = (data: string | Blob, fileName: string, type: string = 'application/pdf') => {
  const blob = typeof data === 'string' ? base64ToBlob(data, type) : data;
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Creates a temporary URL for a base64 string.
 * Remember to call URL.revokeObjectURL() when done or it will leak memory.
 */
export const base64ToURL = (base64: string, contentType: string = '') => {
  if (!base64) return '';
  
  if (base64.startsWith('http') || base64.startsWith('blob:')) return base64;

  const blob = base64ToBlob(base64, contentType);
  if (!blob) return '';
  
  return URL.createObjectURL(blob);
};
