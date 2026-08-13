import { requireUser } from "@/lib/auth";
import { VERTICAL_TEMPLATES } from "@/lib/verticals";
import { OfferSettingsForm } from "@/components/OfferSettingsForm";

export default async function OfferSettingsPage() {
  const user = await requireUser();
  const offer = user.company?.offer;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl mb-1">Offer &amp; ICP Profile</h1>
      <p className="text-sm text-muted mb-6">
        This is what Scout uses to judge fit and draft engagement guidance on every scan. Keep it current.
      </p>
      {offer ? (
        <OfferSettingsForm templates={VERTICAL_TEMPLATES} offer={offer} />
      ) : (
        <p className="text-sm text-muted">No offer profile found for this account yet.</p>
      )}
    </div>
  );
}
