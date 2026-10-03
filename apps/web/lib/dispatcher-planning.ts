export type PlanningTab = "vehicles" | "route-plan" | "unassigned" | "comparison";
export type VehicleCategoryTab = "All" | "Reefer" | "Van" | "Truck";

export type VehicleAssignment = {
  id: string;
  vehicleId: string;
  type: "Reefer" | "Van" | "Truck";
  driver: string;
  driverOnline: boolean;
  tripUsage: string; // e.g. "1 / 2"
  maxTrips: number;
  currentTrips: number;
  ordersCount: number;
  currentLoadKg: number;
  capacityKg: number;
  loadPercent: number;
  routeId: string; // e.g. "R1"
  status: "Assigned" | "Available" | "Maintenance";
  selected?: boolean;
};

export type DeferredOrderRow = {
  id: string;
  orderId: string;
  outlet: string;
  category: "Fresh" | "Style" | "Tech" | "General";
  reasonForDeferral: string;
  constraintCode: string;
  priority: "High" | "Medium" | "Low";
  suggestedAction: string;
};

export type RouteOverviewDetails = {
  vehicleId: string;
  routeId: string;
  totalDistanceKm: number;
  estimatedTime: string;
  ordersCount: number;
  stopsCount: number;
  stops: {
    sequence: number;
    name: string;
    items?: number;
    weightKg?: number;
    window?: string;
    distanceKm: number;
    timeOffset: string;
    isDepot?: boolean;
  }[];
};

export type VehicleExplanationDetails = {
  vehicleId: string;
  type: "Reefer" | "Van" | "Truck";
  driver: string;
  driverOnline: boolean;
  tripUsage: string;
  matchScore: number;
  matchHeadline: string;
  keyReasons: {
    icon: "location" | "product" | "capacity" | "trips" | "window" | "fuel";
    title: string;
    description: string;
  }[];
  vehicleDetails: {
    vehicleId: string;
    type: string;
    driver: string;
    capacityKg: number;
    currentLoadKg: number;
    loadPercent: number;
    remainingCapacityKg: number;
    tripUsage: string;
    currentLocation: string;
    status: string;
  };
  routeImpact: {
    totalDistanceKm: number;
    distanceChange: string;
    estimatedTime: string;
    timeChange: string;
    estimatedFuelL: number;
    fuelChange: string;
  };
  assignedOrdersSummary: {
    totalOrders: number;
    totalWeightKg: number;
    mainItems: string;
    deliveryWindow: string;
  };
};

export const defaultPlanningKpis = {
  vehiclesAssigned: "18",
  vehiclesTotal: "20",
  vehiclesPercent: 90,
  ordersScheduled: "102",
  ordersTotal: "105",
  ordersDeferred: "3",
  estimatedOnTime: "96%",
  onTimeTarget: "95%",
  estimatedFuelConsumptionL: "1,450",
  fuelReduction: "11%",
  co2Reduction: "11%",
  co2SavedKg: "420",
  constraintViolations: "0",
  allRulesSatisfied: true,
};

export const defaultVehicleAssignments: readonly VehicleAssignment[] = [
  {
    id: "veh-001",
    vehicleId: "VEH001",
    type: "Reefer",
    driver: "Ahmed R.",
    driverOnline: true,
    tripUsage: "1 / 2",
    maxTrips: 2,
    currentTrips: 1,
    ordersCount: 8,
    currentLoadKg: 1240,
    capacityKg: 2000,
    loadPercent: 62,
    routeId: "R1",
    status: "Assigned",
    selected: false,
  },
  {
    id: "veh-002",
    vehicleId: "VEH002",
    type: "Reefer",
    driver: "Sahan P.",
    driverOnline: false,
    tripUsage: "2 / 2",
    maxTrips: 2,
    currentTrips: 2,
    ordersCount: 7,
    currentLoadKg: 1125,
    capacityKg: 1500,
    loadPercent: 75,
    routeId: "R2",
    status: "Assigned",
    selected: false,
  },
  {
    id: "veh-003",
    vehicleId: "VEH003",
    type: "Van",
    driver: "Nuwan K.",
    driverOnline: true,
    tripUsage: "1 / 2",
    maxTrips: 2,
    currentTrips: 1,
    ordersCount: 10,
    currentLoadKg: 1200,
    capacityKg: 1200,
    loadPercent: 100,
    routeId: "R3",
    status: "Assigned",
    selected: false,
  },
  {
    id: "veh-004",
    vehicleId: "VEH004",
    type: "Van",
    driver: "Ramesh T.",
    driverOnline: false,
    tripUsage: "0 / 2",
    maxTrips: 2,
    currentTrips: 0,
    ordersCount: 6,
    currentLoadKg: 600,
    capacityKg: 1000,
    loadPercent: 60,
    routeId: "R4",
    status: "Assigned",
    selected: false,
  },
  {
    id: "veh-005",
    vehicleId: "VEH005",
    type: "Van",
    driver: "Kamal D.",
    driverOnline: true,
    tripUsage: "1 / 2",
    maxTrips: 2,
    currentTrips: 1,
    ordersCount: 8,
    currentLoadKg: 2550,
    capacityKg: 3000,
    loadPercent: 85,
    routeId: "R5",
    status: "Assigned",
    selected: false,
  },
  {
    id: "veh-006",
    vehicleId: "VEH006",
    type: "Truck",
    driver: "Dinesh M.",
    driverOnline: true,
    tripUsage: "1 / 2",
    maxTrips: 2,
    currentTrips: 1,
    ordersCount: 9,
    currentLoadKg: 2100,
    capacityKg: 3500,
    loadPercent: 60,
    routeId: "R6",
    status: "Assigned",
    selected: false,
  },
  {
    id: "veh-007",
    vehicleId: "VEH007",
    type: "Truck",
    driver: "Sachin L.",
    driverOnline: false,
    tripUsage: "2 / 2",
    maxTrips: 2,
    currentTrips: 2,
    ordersCount: 8,
    currentLoadKg: 1760,
    capacityKg: 2000,
    loadPercent: 88,
    routeId: "R7",
    status: "Assigned",
    selected: false,
  },
  {
    id: "veh-008",
    vehicleId: "VEH008",
    type: "Reefer",
    driver: "Imran H.",
    driverOnline: true,
    tripUsage: "0 / 2",
    maxTrips: 2,
    currentTrips: 0,
    ordersCount: 6,
    currentLoadKg: 600,
    capacityKg: 1200,
    loadPercent: 50,
    routeId: "R8",
    status: "Assigned",
    selected: false,
  },
];

export const defaultDeferredOrders: readonly DeferredOrderRow[] = [
  {
    id: "def-1",
    orderId: "OUT078",
    outlet: "TechWave - Kandy",
    category: "Tech",
    reasonForDeferral: "Low priority, served yesterday",
    constraintCode: "TIME_BUDGET",
    priority: "Low",
    suggestedAction: "Schedule Tomorrow",
  },
  {
    id: "def-2",
    orderId: "OUT091",
    outlet: "ElectroHub - Jaffna",
    category: "Tech",
    reasonForDeferral: "Exceeds daily time budget",
    constraintCode: "TIME_BUDGET",
    priority: "Medium",
    suggestedAction: "Reassign or Tomorrow",
  },
  {
    id: "def-3",
    orderId: "OUT105",
    outlet: "StyleHub - Trincomalee",
    category: "Style",
    reasonForDeferral: "Vehicle capacity limit",
    constraintCode: "NO_CAPACITY",
    priority: "Medium",
    suggestedAction: "Assign to next available",
  },
];

export const defaultRouteOverview: RouteOverviewDetails = {
  vehicleId: "VEH001",
  routeId: "VEH001 - Route 1",
  totalDistanceKm: 68,
  estimatedTime: "5h 30m",
  ordersCount: 8,
  stopsCount: 8,
  stops: [
    {
      sequence: 0,
      name: "Depot (Main Warehouse)",
      window: "Start: 5:30 AM",
      distanceKm: 0,
      timeOffset: "0 km",
      isDepot: true,
    },
    {
      sequence: 1,
      name: "OUT012 - Colombo City Center",
      items: 12,
      weightKg: 180,
      window: "8:00 - 8:30 AM",
      distanceKm: 12,
      timeOffset: "12 km (25 min)",
    },
    {
      sequence: 2,
      name: "OUT034 - FreshMart - Galle Road",
      items: 8,
      weightKg: 120,
      window: "8:45 - 9:15 AM",
      distanceKm: 28,
      timeOffset: "28 km (35 min)",
    },
    {
      sequence: 3,
      name: "OUT022 - TechWave - Kandy",
      items: 15,
      weightKg: 220,
      window: "9:50 - 10:30 AM",
      distanceKm: 52,
      timeOffset: "52 km (1h 05m)",
    },
  ],
};

export const defaultVehicleExplanation: VehicleExplanationDetails = {
  vehicleId: "VEH001",
  type: "Reefer",
  driver: "Ahmed R.",
  driverOnline: true,
  tripUsage: "1 / 2",
  matchScore: 96,
  matchHeadline: "VEH001 is the most suitable vehicle based on proximity, capacity, product requirements and delivery time window.",
  keyReasons: [
    {
      icon: "location",
      title: "Closest available vehicle",
      description: "Only 4.2 km from depot, reduces deadhead distance",
    },
    {
      icon: "product",
      title: "Meets product requirements",
      description: "Reefer vehicle required for fresh items (all 8 orders)",
    },
    {
      icon: "capacity",
      title: "Sufficient capacity",
      description: "1,240 kg load (62%) leaves 760 kg free capacity",
    },
    {
      icon: "trips",
      title: "Trip usage within limit",
      description: "Currently 1 / 2 trips, one more trip available today",
    },
    {
      icon: "window",
      title: "Meets delivery time windows",
      description: "All orders can be delivered within SLA (6:00 AM – 12:00 PM)",
    },
    {
      icon: "fuel",
      title: "Optimizes overall plan",
      description: "Helps achieve 11% fuel reduction and 96% on-time rate",
    },
  ],
  vehicleDetails: {
    vehicleId: "VEH001",
    type: "Reefer",
    driver: "Ahmed R.",
    capacityKg: 2000,
    currentLoadKg: 1240,
    loadPercent: 62,
    remainingCapacityKg: 760,
    tripUsage: "1 / 2",
    currentLocation: "Depot (4.2 km)",
    status: "Available",
  },
  routeImpact: {
    totalDistanceKm: 68,
    distanceChange: "↓ 14% vs. previous",
    estimatedTime: "5h 30m",
    timeChange: "↓ 16% vs. previous",
    estimatedFuelL: 210,
    fuelChange: "↓ 12% vs. previous",
  },
  assignedOrdersSummary: {
    totalOrders: 8,
    totalWeightKg: 1240,
    mainItems: "Fresh Products",
    deliveryWindow: "6:00 AM – 12:00 PM",
  },
};

export const defaultPlanConstraints = [
  { text: "All constraints satisfied", checked: true },
  { text: "Vehicle maximum 2 trips per day", checked: true },
  { text: "Vehicle capacity limits", checked: true },
  { text: "Reefer required for fresh items", checked: true },
  { text: "Delivery time windows (SLA)", checked: true },
  { text: "Driver working hours", checked: true },
  { text: "Route distance optimization", checked: true },
];

export const defaultPlanVsPrevious = {
  totalDistance: "412 km",
  distanceChange: "↓ 14%",
  estimatedTime: "32h 15m",
  timeChange: "↓ 16%",
  fuelConsumption: "1,450 L",
  fuelChange: "↓ 11%",
  onTimeDelivery: "96%",
  onTimeChange: "↑ 11%",
};

export const defaultAiReasoningInsights = [
  "Selected closest available vehicles with remaining trip capacity",
  "Prioritized fresh orders in early morning window",
  "Grouped nearby outlets to minimize distance",
  "Balanced vehicle load to maximize utilization",
  "Estimated 11% fuel reduction with optimized routes",
  "All vehicles are within 2 trips per day limit",
];

export function filterVehicles(
  vehicles: readonly VehicleAssignment[],
  category: VehicleCategoryTab,
  query: string,
): VehicleAssignment[] {
  const normalizedQuery = query.trim().toLowerCase();
  return vehicles.filter((v) => {
    if (category !== "All" && v.type !== category) return false;
    if (normalizedQuery === "") return true;
    return (
      v.vehicleId.toLowerCase().includes(normalizedQuery) ||
      v.driver.toLowerCase().includes(normalizedQuery) ||
      v.type.toLowerCase().includes(normalizedQuery) ||
      v.routeId.toLowerCase().includes(normalizedQuery)
    );
  });
}
