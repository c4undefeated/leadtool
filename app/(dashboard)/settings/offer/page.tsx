import { requireUser } from "@/lib/auth";
import { VERTICAL_TEMPLATES } from "@/lib/verticals";
import { OfferSettingsForm } from "@/components/OfferSettingsForm";
import { renameBusinessAction } from "@/lib/actions/business";

export default async function OfferSettingsPage() {
  const user = await requireUser();
  const offer = user.company?.offer;

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl mb-1">Offer &amp; ICP Profile</h1>
      <p className="text-sm text-muted mb-6">
        This is what Scout uses to judge fit and draft engagement guidance on every scan. Keep it current.
      </p>

      <div className="rounded-lg border border-line bg-surface p-5 mb-6">
        <p className="text-xs font-mono text-muted uppercase tracking-wide mb-2">This business</p>
        <form action={renameBusinessAction} className="flex flex-wrap gap-2">
          <input
            name="name"
            defaultValue={user.company?.name ?? ""}
            required
            className="flex-1 min-w-[200px] rounded-md border border-line bg-paper px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded-md border border-line px-4 py-2 text-sm hover:bg-paper">
            Save name
          </button>
        </form>
      </div>

      {offer ? (
        <OfferSettingsForm templates={VERTICAL_TEMPLATES} offer={offer} />
      ) : (
        <p className="text-sm text-muted">No offer profile found for this account yet.</p>
      )}
    </div>
  );
}
