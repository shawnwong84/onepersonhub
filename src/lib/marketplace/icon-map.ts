import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Factory,
  FileText,
  Headphones,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

export const MODULE_ICONS: Record<string, React.ElementType> = {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Factory,
  FileText,
  Headphones,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
};

export function getModuleIcon(iconName: string): React.ElementType {
  return MODULE_ICONS[iconName] || Package;
}
