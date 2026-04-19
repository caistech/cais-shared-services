export interface ReportBrand {
  productName: string;
  primaryColor: string;
  accentColor: string;
  logoSvg?: string;
  bodyColor?: string;
  backgroundColor?: string;
}

export interface ReportHeader {
  title: string;
  subtitle?: string;
  preparedFor?: string;
  dateLine?: string;
}

export interface ReportFooter {
  disclaimer: string;
  watermark?: string;
  pageNumbers: boolean;
}

export interface ReportMetadata {
  author: string;
  subject: string;
  recipient?: string;
  title?: string;
}

export interface RenderOptions {
  markdown: string;
  brand: ReportBrand;
  header: ReportHeader;
  footer: ReportFooter;
  metadata: ReportMetadata;
  maxBodyChars?: number;
}

export interface RenderResult {
  buffer: Buffer;
  truncated: boolean;
  pageCount: number;
}
