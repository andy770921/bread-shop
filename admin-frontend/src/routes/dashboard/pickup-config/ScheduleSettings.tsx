import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import type { PickupSettings } from '@repo/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useUpdatePickupSettings } from '@/queries/usePickupConfig';
import { ClosureRangePicker } from './ClosureRangePicker';

const HOURS = ['15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const WEEKDAYS = [
  { v: 1, label: '週一' },
  { v: 2, label: '週二' },
  { v: 3, label: '週三' },
  { v: 4, label: '週四' },
  { v: 5, label: '週五' },
  { v: 6, label: '週六' },
  { v: 0, label: '週日' },
];

interface Props {
  initial: PickupSettings;
}

export function ScheduleSettings({ initial }: Props) {
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

  const handleSave = async () => {
    if (state.timeSlots.length === 0) {
      toast.error('請至少保留一個可預約時段');
      return;
    }
    if (state.windowDays < 1 || state.windowDays > 365) {
      toast.error('可預約天數必須在 1–365 之間');
      return;
    }
    try {
      await updateMutation.mutateAsync(state);
      toast.success('已儲存時段設定');
    } catch (err) {
      toast.error((err as Error).message || '儲存失敗');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>時段設定</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">
            可預約時段 (15:00–22:00)
          </legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
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
          <legend className="mb-2 text-sm font-medium text-text-primary">固定休息日</legend>
          <div className="flex flex-wrap gap-4">
            {WEEKDAYS.map((d) => (
              <label key={d.v} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.disabledWeekdays.includes(d.v)}
                  onCheckedChange={(v) => toggleWeekday(d.v, Boolean(v))}
                />
                {d.label}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-primary">臨時休息區間</legend>
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
                清除
              </Button>
            )}
          </div>
        </fieldset>

        <fieldset>
          <Label htmlFor="windowDays" className="text-sm font-medium text-text-primary">
            可預約天數 (X 天)
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
            <span className="text-xs text-text-tertiary">後端預設為 30 天</span>
          </div>
        </fieldset>

        <div>
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
            <Save className="h-4 w-4" />
            儲存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
