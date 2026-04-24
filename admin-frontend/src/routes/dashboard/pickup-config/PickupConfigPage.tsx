import { useAdminPickupLocations, useAdminPickupSettings } from '@/queries/usePickupConfig';
import { LocationManager } from './LocationManager';
import { ScheduleSettings } from './ScheduleSettings';

export default function PickupConfigPage() {
  const { data: settings, isLoading: sLoading } = useAdminPickupSettings();
  const { data: locations, isLoading: lLoading } = useAdminPickupLocations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold text-text-primary">取貨設定</h1>
        <p className="mt-1 text-sm text-text-secondary">管理面交地點、時段與休息日設定</p>
      </div>

      {sLoading || lLoading ? (
        <div className="text-sm text-text-tertiary">Loading…</div>
      ) : (
        <>
          <LocationManager locations={locations ?? []} />
          {settings && <ScheduleSettings initial={settings} />}
        </>
      )}
    </div>
  );
}
