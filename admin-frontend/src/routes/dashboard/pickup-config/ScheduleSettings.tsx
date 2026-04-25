import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import type { PickupSettings } from '@repo/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { useUpdatePickupSettings } from '@/queries/usePickupConfig';
import { ClosureRangePicker } from './ClosureRangePicker';

const HOURS = [
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
  '19:30',
  '20:00',
  '20:30',
  '21:00',
  '21:30',
  '22:00',
];
const WEEKDAY_VALUES = [1, 2, 3, 4, 5, 6, 0] as const;

interface Props {
  initial: PickupSettings;
}

export function ScheduleSettings({ initial }: Props) {
  const { t } = useLocale();
  const [state, setState] = useState<PickupSettings>(initial);
  const updateMutation = useUpdatePickupSettings();

  useEffect(() => {
    setState(initial);
  }, [initial]);

  const toggleSlot = (slot: string, checked: boolean) => {
    setState((s) => ({
      ...s,
      timeSlots: checked
        ? Array.from(new Set([...s.timeSlots, slot])).sort()
        : s.timeSlots.filter((x) => x !== slot),
    }));
  };

  const toggleWeekday = (day: number, checked: boolean) => {
    setState((s) => ({
      ...s,
      disabledWeekdays: checked
        ? Array.from(new Set([...s.disabledWeekdays, day])).sort()
        : s.disabledWeekdays.filter((x) => x !== day),
    }));
  };

  const setWindowDays = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setState((s) => ({ ...s, windowDays: n }));
  };

  const setLeadDays = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return;
    setState((s) => ({ ...s, leadDays: n }));
  };

  const handleSave = async () => {
    if (state.timeSlots.length === 0) {
      toast.error(t('pickupConfig.schedule.errorEmptySlots'));
      return;
    }
    if (state.windowDays < 1 || state.windowDays > 365) {
      toast.error(t('pickupConfig.schedule.errorWindowDaysRange'));
      return;
    }
    if (state.leadDays < 0 || state.leadDays > 30) {
      toast.error(t('pickupConfig.schedule.errorLeadDaysRange'));
      return;
    }
    try {
      await updateMutation.mutateAsync(state);
      toast.success(t('pickupConfig.schedule.saved'));
    } catch (err) {
      toast.error((err as Error).message || t('pickupConfig.schedule.saveFailed'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pickupConfig.schedule.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">
            {t('pickupConfig.schedule.timeSlotsLegend')}
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {HOURS.map((h) => (
              <label key={h} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.timeSlots.includes(h)}
                  onCheckedChange={(v) => toggleSlot(h, Boolean(v))}
                />
                {h}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">
            {t('pickupConfig.schedule.weekdaysLegend')}
          </legend>
          <div className="flex flex-wrap gap-4">
            {WEEKDAY_VALUES.map((v) => (
              <label key={v} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.disabledWeekdays.includes(v)}
                  onCheckedChange={(c) => toggleWeekday(v, Boolean(c))}
                />
                {t(`pickupConfig.schedule.weekday.${v}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">
            {t('pickupConfig.schedule.closureLegend')}
          </legend>
          <div className="flex items-center gap-3">
            <ClosureRangePicker
              startDate={state.closureStartDate}
              endDate={state.closureEndDate}
              onChange={({ start, end }) =>
                setState((s) => ({ ...s, closureStartDate: start, closureEndDate: end }))
              }
            />
            {(state.closureStartDate || state.closureEndDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setState((s) => ({ ...s, closureStartDate: null, closureEndDate: null }))
                }
              >
                {t('pickupConfig.schedule.clearButton')}
              </Button>
            )}
          </div>
        </fieldset>

        <fieldset>
          <Label htmlFor="windowDays" className="text-sm font-medium text-text-primary">
            {t('pickupConfig.schedule.windowDaysLabel')}
          </Label>
          <div className="mt-1 flex items-center gap-3">
            <Input
              id="windowDays"
              type="number"
              min={1}
              max={365}
              value={state.windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              className="w-32"
            />
            <span className="text-xs text-text-tertiary">
              {t('pickupConfig.schedule.windowDaysHelp')}
            </span>
          </div>
        </fieldset>

        <fieldset>
          <Label htmlFor="leadDays" className="text-sm font-medium text-text-primary">
            {t('pickupConfig.schedule.leadDaysLabel')}
          </Label>
          <div className="mt-1 flex items-center gap-3">
            <Input
              id="leadDays"
              type="number"
              min={0}
              max={30}
              value={state.leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
              className="w-32"
            />
            <span className="text-xs text-text-tertiary">
              {t('pickupConfig.schedule.leadDaysHelp')}
            </span>
          </div>
        </fieldset>

        <div>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            {t('pickupConfig.schedule.saveButton')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
