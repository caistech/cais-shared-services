import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { RenderOptions } from "../types";
import { Markdown } from "./Markdown";

const PAGE_PADDING = { top: 56, right: 56, bottom: 64, left: 56 };

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    paddingTop: PAGE_PADDING.top,
    paddingRight: PAGE_PADDING.right,
    paddingBottom: PAGE_PADDING.bottom,
    paddingLeft: PAGE_PADDING.left,
  },
  headerBand: {
    marginBottom: 18,
  },
  productName: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontWeight: 700,
  },
  title: {
    fontSize: 22,
    fontWeight: 700,
    marginTop: 4,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  metaLine: {
    fontSize: 10,
    marginTop: 2,
  },
  hairline: {
    borderBottomWidth: 1,
    borderBottomColor: "#DDDDDD",
    marginVertical: 14,
  },
  footer: {
    position: "absolute",
    left: PAGE_PADDING.left,
    right: PAGE_PADDING.right,
    bottom: 28,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#DDDDDD",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerDisclaimer: {
    fontSize: 8,
    maxWidth: "75%",
  },
  footerPageNumbers: {
    fontSize: 8,
  },
  watermark: {
    position: "absolute",
    top: "40%",
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: 4,
    transform: "rotate(-30deg)",
  },
});

export interface ReportDocumentProps extends RenderOptions {
  bodyMarkdown: string;
}

export const ReportDocument: React.FC<ReportDocumentProps> = ({
  bodyMarkdown,
  brand,
  header,
  footer,
  metadata,
}) => {
  const bodyColor = brand.bodyColor ?? "#0A0A0A";
  const bgColor = brand.backgroundColor ?? "#FFFFFF";
  const watermarkColor = `${brand.primaryColor}14`;

  return (
    <Document
      title={metadata.title ?? header.title}
      author={metadata.author}
      subject={metadata.subject}
      creator="@caistech/report-generator"
      producer="@caistech/report-generator"
    >
      <Page size="A4" style={{ ...styles.page, backgroundColor: bgColor, color: bodyColor }}>
        {footer.watermark ? (
          <Text style={{ ...styles.watermark, color: watermarkColor }} fixed>
            {footer.watermark}
          </Text>
        ) : null}

        <View style={styles.headerBand}>
          <Text style={{ ...styles.productName, color: brand.primaryColor }}>
            {brand.productName}
          </Text>
          <Text style={{ ...styles.title, color: brand.primaryColor }}>{header.title}</Text>
          {header.subtitle ? <Text style={styles.subtitle}>{header.subtitle}</Text> : null}
          {header.preparedFor ? (
            <Text style={styles.metaLine}>Prepared for: {header.preparedFor}</Text>
          ) : null}
          {header.dateLine ? <Text style={styles.metaLine}>{header.dateLine}</Text> : null}
        </View>

        <View style={styles.hairline} />

        <Markdown source={bodyMarkdown} brand={brand} />

        <View style={styles.footer} fixed>
          <Text style={styles.footerDisclaimer}>{footer.disclaimer}</Text>
          {footer.pageNumbers ? (
            <Text
              style={styles.footerPageNumbers}
              render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
            />
          ) : (
            <Text style={styles.footerPageNumbers} />
          )}
        </View>
      </Page>
    </Document>
  );
};
