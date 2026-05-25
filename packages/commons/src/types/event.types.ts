export interface EventStatus {
  id: string;
  name: string;
  availableSlots: number;
  maxCapacity: number;
  isFull: boolean;
}
