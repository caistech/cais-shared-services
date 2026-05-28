# SayFix Integration - Required for ALL Products

> Every product MUST have SayFix embedded for issue reporting

## Why This is Required

- Users need a way to report bugs/issues
- SayFix provides voice-first issue capture
- Issues flow to approval queue for tracking
- Required for commercial products (audit/validation)

## Integration Checklist

- [ ] Product added to SayFix at `/admin/product-access`
- [ ] `@caistech/sayfix-embed` installed
- [ ] `<SayFixWidget product="product-slug" />` added to app
- [ ] Widget visible in footer/header on all pages
- [ ] Test ticket can be submitted
- [ ] Ticket appears in SayFix admin queue

## Installation

```bash
npm install @caistech/sayfix-embed
```

## Usage

```tsx
import { SayFixWidget } from '@caistech/sayfix-embed';

export default function Layout({ children }) {
  return (
    <>
      {children}
      <SayFixWidget product="your-product-slug" />
    </>
  );
}
```

## Configuration

| Prop | Required | Description |
|------|----------|-------------|
| `product` | Yes | Product slug (must exist in SayFix) |
| `userEmail` | No | Logged in user's email |
| `userName` | No | Logged in user's name |
| `apiUrl` | No | SayFix instance URL (default: production) |

## Status

**Required for:** All portfolio, sister_company, and client_build products

**Validation gate:** Must pass before Certificate of Occupancy
