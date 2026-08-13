export default function NotificationsSettingsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl mb-1">Webhooks &amp; Alerts</h1>
      <p className="text-sm text-muted mb-6">
        Real-time webhooks and alert delivery aren't available yet. Today, new opportunities show up in your{" "}
        Opportunities feed as soon as a scan finds them — check back there, or run a manual scan from a campaign
        page.
      </p>
      <div className="rounded-lg border border-line bg-surface p-5">
        <p className="text-sm text-muted">
          Want to be notified the moment Scout finds something? Contact support and we'll let you know when this
          ships.
        </p>
      </div>
    </div>
  );
}
