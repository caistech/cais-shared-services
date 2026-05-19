import { ExplanatoryHeader } from '@caistech/corporate-components';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <ExplanatoryHeader
        what="Replace with product name"
        do="Replace with the action this product exists to perform for the user"
        matters="Replace with why this matters in the user's broader workflow"
      />
      <p className="mt-8 text-base text-gray-700">
        Replace with the landing-page body. Mobile-first; reflow at md: and lg:.
      </p>
    </main>
  );
}
