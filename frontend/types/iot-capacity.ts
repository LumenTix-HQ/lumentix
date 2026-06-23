export enum SensorType {
  ENTRY_COUNTER  = 'entry_counter',
  EXIT_COUNTER   = 'exit_counter',
  OCCUPANCY      = 'occupancy',
  WEIGHT_PLATE   = 'weight_plate',
  CAMERA_AI      = 'camera_ai',
  ENVIRONMENTAL  = 'environmental',
}

export enum SensorStatus {
  ONLINE   = 'online',
  OFFLINE  = 'offline',
  DEGRADED = 'degraded',
  FAULT    = 'fault',
}

export enum CapacityAlertLevel {
  NORMAL   = 'normal',
  WARNING  = 'warning',
  CRITICAL = 'critical',
  OVER     = 'over',
}

export interface SensorSummary {
  id: string;
  name: string;
  type: SensorType;
  status: SensorStatus;
  lastReading: number;
  lastReadingAt: string | null;
  cumulativeEntries: number;
  cumulativeExits: number;
  sectionId: string | null;
  location: string | null;
}

export interface CapacityMonitor {
  eventId: string;
  ticketsSold: number;
  actualOccupancy: number;
  capacityLimit: number | null;
  occupancyPercent: number;
  remainingCapacity: number | null;
  alertLevel: CapacityAlertLevel;
  activeSensorCount: number;
  sensors: SensorSummary[];
  sectionBreakdown: Record<string, number> | null;
  timestamp: string;
}

export interface SectionUtilisation {
  occupancy: number;
  capacity: number;
  utilisationPercent: number;
}

export interface SpaceOptimisation {
  eventId: string;
  occupancyPercent: number;
  alertLevel: CapacityAlertLevel;
  recommendations: string[];
  sectionUtilisation: Record<string, SectionUtilisation>;
  rebalancingActions: string[];
  estimatedMinutesToCritical: number | null;
}

export interface CapacitySnapshot {
  id: string;
  eventId: string;
  ticketsSold: number;
  actualOccupancy: number;
  capacityLimit: number | null;
  occupancyPercent: number;
  activeSensorCount: number;
  alertLevel: CapacityAlertLevel;
  sectionBreakdown: Record<string, number> | null;
  recommendations: string[] | null;
  createdAt: string;
}

export interface CapacityUpdateResult {
  newLimit: number | null;
  previousLimit: number | null;
  salesPaused: boolean;
  auditId: string;
}
