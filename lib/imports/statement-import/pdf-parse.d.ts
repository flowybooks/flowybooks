// Type declaration for pdf-parse/lib/pdf-parse.js subpath import
// This bypasses the problematic index.js that tries to load test fixtures
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdf from 'pdf-parse';
  export default pdf;
}
