import { ExplanatoryHeader } from '@caistech/corporate-components';

export const metadata = {
  title: 'Privacy policy',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <ExplanatoryHeader
        what="Privacy policy"
        do="Read how we handle personal information you give us"
        matters="Required under the Australian Privacy Act before we can collect personal data"
      />
      <article className="prose prose-slate mt-8 max-w-none">
        <h2>1. Who we are</h2>
        <p>REPLACE — operator entity, ABN, registered address, privacy contact.</p>

        <h2>2. What we collect</h2>
        <p>REPLACE — categories of personal information collected, with examples.</p>

        <h2>3. Why we collect it</h2>
        <p>REPLACE — primary and secondary purposes.</p>

        <h2>4. Who we share it with</h2>
        <p>REPLACE — subprocessors (Supabase, Vercel, Resend, etc.) and overseas transfers.</p>

        <h2>5. How long we keep it</h2>
        <p>REPLACE — retention windows per data category.</p>

        <h2>6. Your rights</h2>
        <p>REPLACE — access, correction, complaint pathway, OAIC reference.</p>

        <h2>7. Security</h2>
        <p>REPLACE — encryption in transit + at rest, access controls, breach notification commitment.</p>

        <h2>8. Contact</h2>
        <p>REPLACE — privacy officer email / postal address.</p>

        <p className="text-sm text-gray-500">
          Last updated: REPLACE_WITH_DATE.
        </p>
      </article>
    </main>
  );
}
