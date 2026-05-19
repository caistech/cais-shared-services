import { ExplanatoryHeader } from '@caistech/corporate-components';

export const metadata = {
  title: 'Terms of service',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <ExplanatoryHeader
        what="Terms of service"
        do="Read the agreement that governs your use of this product"
        matters="Defines who is liable for what, and how disputes are resolved"
      />
      <article className="prose prose-slate mt-8 max-w-none">
        <h2>1. The agreement</h2>
        <p>REPLACE — parties, acceptance, capacity, age.</p>

        <h2>2. The service</h2>
        <p>REPLACE — what we provide, what we do not provide, beta/preview disclaimers.</p>

        <h2>3. Your obligations</h2>
        <p>REPLACE — acceptable use, accuracy of data, account security.</p>

        <h2>4. Fees and refunds</h2>
        <p>REPLACE — pricing reference, billing cycle, refund policy.</p>

        <h2>5. Intellectual property</h2>
        <p>REPLACE — ownership of platform vs ownership of user content.</p>

        <h2>6. Limitation of liability</h2>
        <p>REPLACE — caps, exclusions, consumer-law carve-outs (ACL).</p>

        <h2>7. Termination</h2>
        <p>REPLACE — your right to cancel, our right to suspend, data export window.</p>

        <h2>8. Governing law</h2>
        <p>REPLACE — Australian state, exclusive jurisdiction clause.</p>

        <p className="text-sm text-gray-500">
          Last updated: REPLACE_WITH_DATE.
        </p>
      </article>
    </main>
  );
}
