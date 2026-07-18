import React from "react";
import { Text, View } from "@react-pdf/renderer";
import { marked, type Tokens } from "marked";
import type { ReportBrand } from "../types";

interface MarkdownProps {
  source: string;
  brand: ReportBrand;
}

// react-pdf's built-in Helvetica renders WinAnsi/Latin-1 only, and marked
// HTML-escapes text-token content (' -> &#39;, & -> &amp;, etc.). Left as-is,
// the PDF shows literal "&#39;" and drops glyphs the base font lacks (arrows).
// cleanText() decodes the entities marked emits and swaps those few glyphs for
// ASCII so body text renders cleanly. Applied at every leaf text node.
const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&#x2F;": "/",
  "&#47;": "/",
  "&nbsp;": " ",
};

// Glyphs outside the base-font (WinAnsi) range → safe equivalents. Dashes
// (en/em) and the bullet ARE in WinAnsi, so they are intentionally left alone.
const GLYPH_FALLBACK: Record<string, string> = {
  "→": "->", // →
  "←": "<-", // ←
  "↔": "<->", // ↔
  "⇒": "=>", // ⇒
  "⇐": "<=", // ⇐
  "‘": "'", // ‘
  "’": "'", // ’
  "“": '"', // “
  "”": '"', // ”
  "…": "...", // …
  " ": " ", // nbsp
};

function cleanText(input: string | undefined): string {
  if (!input) return "";
  let s = input;
  s = s.replace(/&(amp|lt|gt|quot|#39|#x27|#x2F|#47|nbsp);/g, (m) => NAMED_ENTITIES[m] ?? m);
  s = s.replace(/&#(\d+);/g, (_m, n: string) => {
    const code = parseInt(n, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => {
    const code = parseInt(n, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _m;
  });
  s = s.replace(/[→←↔⇒⇐‘’“”… ]/g, (c) => GLYPH_FALLBACK[c] ?? c);
  return s;
}

type InlineToken = Tokens.Text | Tokens.Strong | Tokens.Em | Tokens.Codespan | Tokens.Link | Tokens.Br | Tokens.Escape;

const renderInline = (tokens: InlineToken[] | undefined, brand: ReportBrand, keyPrefix: string): React.ReactNode => {
  if (!tokens) return null;
  return tokens.map((t, i) => {
    const key = `${keyPrefix}-${i}`;
    switch (t.type) {
      case "strong":
        return (
          <Text key={key} style={{ fontWeight: 700 }}>
            {renderInline((t as Tokens.Strong).tokens as InlineToken[], brand, key)}
          </Text>
        );
      case "em":
        return (
          <Text key={key} style={{ fontStyle: "italic" }}>
            {renderInline((t as Tokens.Em).tokens as InlineToken[], brand, key)}
          </Text>
        );
      case "codespan":
        return (
          <Text key={key} style={{ fontFamily: "Courier", fontSize: 10 }}>
            {cleanText((t as Tokens.Codespan).text)}
          </Text>
        );
      case "link":
        return (
          <Text key={key} style={{ color: brand.primaryColor, textDecoration: "underline" }}>
            {renderInline((t as Tokens.Link).tokens as InlineToken[], brand, key)}
          </Text>
        );
      case "br":
        return <Text key={key}>{"\n"}</Text>;
      case "escape":
      case "text":
      default:
        return <Text key={key}>{cleanText((t as { text: string }).text)}</Text>;
    }
  });
};

export const Markdown: React.FC<MarkdownProps> = ({ source, brand }) => {
  const tokens = marked.lexer(source);
  const bodyColor = brand.bodyColor ?? "#0A0A0A";

  return (
    <View>
      {tokens.map((token, idx) => {
        const key = `tok-${idx}`;
        switch (token.type) {
          case "heading": {
            const h = token as Tokens.Heading;
            const sizes = [20, 16, 13, 12, 11, 11];
            const marginTop = h.depth === 1 ? 0 : h.depth === 2 ? 16 : 12;
            return (
              <Text
                key={key}
                style={{
                  fontSize: sizes[h.depth - 1] ?? 11,
                  fontWeight: 700,
                  color: brand.primaryColor,
                  marginTop,
                  marginBottom: 6,
                  letterSpacing: h.depth <= 2 ? 0.5 : 0,
                  textTransform: h.depth <= 2 ? "uppercase" : "none",
                }}
              >
                {renderInline(h.tokens as InlineToken[], brand, key)}
              </Text>
            );
          }
          case "paragraph": {
            const p = token as Tokens.Paragraph;
            return (
              <Text
                key={key}
                style={{ fontSize: 11, color: bodyColor, lineHeight: 1.55, marginBottom: 8 }}
              >
                {renderInline(p.tokens as InlineToken[], brand, key)}
              </Text>
            );
          }
          case "list": {
            const list = token as Tokens.List;
            return (
              <View key={key} style={{ marginBottom: 8 }}>
                {list.items.map((item, i) => (
                  <View key={`${key}-${i}`} wrap={false} style={{ flexDirection: "row", marginBottom: 4 }}>
                    <Text style={{ fontSize: 11, color: bodyColor, width: 16 }}>
                      {list.ordered ? `${i + 1}.` : "\u2022"}
                    </Text>
                    <Text style={{ fontSize: 11, color: bodyColor, lineHeight: 1.55, flex: 1 }}>
                      {renderInline((item as Tokens.ListItem).tokens?.flatMap((tok) => {
                        if ((tok as Tokens.Text).tokens) return (tok as Tokens.Text).tokens as InlineToken[];
                        return [tok as unknown as InlineToken];
                      }), brand, `${key}-${i}`)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          }
          case "hr":
            return (
              <View
                key={key}
                style={{ borderBottomWidth: 1, borderBottomColor: "#DDDDDD", marginVertical: 12 }}
              />
            );
          case "blockquote": {
            const bq = token as Tokens.Blockquote;
            return (
              <View
                key={key}
                style={{
                  borderLeftWidth: 2,
                  borderLeftColor: brand.primaryColor,
                  paddingLeft: 10,
                  marginVertical: 10,
                }}
              >
                {bq.tokens.map((inner, i) => {
                  if (inner.type === "paragraph") {
                    const p = inner as Tokens.Paragraph;
                    return (
                      <Text
                        key={`${key}-bq-${i}`}
                        style={{ fontSize: 11, color: bodyColor, fontStyle: "italic", lineHeight: 1.55 }}
                      >
                        {renderInline(p.tokens as InlineToken[], brand, `${key}-bq-${i}`)}
                      </Text>
                    );
                  }
                  return null;
                })}
              </View>
            );
          }
          case "code": {
            const c = token as Tokens.Code;
            return (
              <Text
                key={key}
                style={{
                  fontFamily: "Courier",
                  fontSize: 10,
                  color: bodyColor,
                  backgroundColor: "#F5F5F5",
                  padding: 6,
                  marginBottom: 8,
                }}
              >
                {cleanText(c.text)}
              </Text>
            );
          }
          case "space":
            return <View key={key} style={{ height: 6 }} />;
          default:
            return null;
        }
      })}
    </View>
  );
};
