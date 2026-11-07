import { DayPicker, type DayPickerProps } from 'react-day-picker';
import 'react-day-picker/style.css';
import './calendar.css';

export function Calendar(props: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays
      captionLayout="dropdown"
      startMonth={new Date(2000, 0)}
      endMonth={new Date(2100, 11)}
      {...props}
      className={`reservation-calendar ${props.className || ''}`}
    />
  );
}
