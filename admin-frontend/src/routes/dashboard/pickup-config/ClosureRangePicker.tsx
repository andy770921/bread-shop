import { useState } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface ClosureRange {
  start: string | null;
  end: string | null;
}

interface Props {
  startDate: string | null;
  endDate: string | null;
  onChange: (range: ClosureRange) => void;
}

export function ClosureRangePicker({ startDate, endDate, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const from = startDate ? parseISO(startDate) : undefined;
  const to = endDate ? parseISO(endDate) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start gap-2 font-normal">
          <CalendarIcon className="h-4 w-4" />
          {from && to
            ? `${format(from, 'yyyy-MM-dd')} → ${format(to, 'yyyy-MM-dd')}`
            : '選擇休息區間'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Calendar
          mode="range"
          selected={{ from, to }}
          onSelect={(range) => {
            onChange({
              start: range?.from ? format(range.from, 'yyyy-MM-dd') : null,
              end: range?.to ? format(range.to, 'yyyy-MM-dd') : null,
            });
            if (range?.from && range?.to && !isSameDay(range.from, range.to)) {
              setOpen(false);
            }
          }}
          defaultMonth={from ?? new Date()}
        />
      </PopoverContent>
    </Popover>
  );
}
