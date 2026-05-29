export interface EventStatus {
  id: string;
  name: string;
  scheduledAt: string;
  availableSlots: number;
  maxCapacity: number;
  isFull: boolean;
}
